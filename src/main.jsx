import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BookOpen, ChevronLeft, ChevronRight, Compass, Eye, Flag, Gamepad2, Gem,
  LayoutGrid, Lock, MousePointer2, PawPrint, ScrollText, ShieldCheck,
  Sparkles, Users, Search, ShoppingBag, Skull, MapPinned
} from 'lucide-react'
import './styles.css'
import './zoologist-overrides.css'
import creatureCsv from '../data/creatures.csv?raw'
import quests from '../data/quests.json'
import rewardCatalog from '../data/reward-catalog.json'
import shop from '../data/shop.json'
import bossSystem from '../data/boss-system.json'

const TILE_SIZE = 128
const TILE_GAP = 3
const TILE_STEP = TILE_SIZE + TILE_GAP
const RENDER_RADIUS = 20
const RENDER_DIAMETER = RENDER_RADIUS * 2 + 1
const FOG_RADIUS = 2
const EDGE_ZONE = 70
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.25
const ZOOM_STEP = 0.12
const CARDINAL_DIRECTIONS = [[0,-1],[1,0],[0,1],[-1,0]]
const QUEST_FILTERS = ['all','revealed','completed']

function keyFor(x,y){ return `${x}:${y}` }

function parseCsv(text){
  const rows=[]; let row=[]; let field=''; let quoted=false
  for(let i=0;i<text.length;i+=1){
    const char=text[i], next=text[i+1]
    if(char==='"'&&quoted&&next==='"'){field+='"';i+=1;continue}
    if(char==='"'){quoted=!quoted;continue}
    if(char===','&&!quoted){row.push(field);field='';continue}
    if((char==='\n'||char==='\r')&&!quoted){
      if(char==='\r'&&next==='\n')i+=1
      row.push(field);field=''
      if(row.some(v=>v.trim()!==''))rows.push(row)
      row=[];continue
    }
    field+=char
  }
  row.push(field)
  if(row.some(v=>v.trim()!==''))rows.push(row)
  if(!rows.length)return[]
  const headers=rows[0].map(v=>v.trim().toLowerCase())
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,(values[i]??'').trim()])))
}
function firstValue(row,...keys){for(const key of keys){const value=row[key.toLowerCase()];if(value!=null&&value!=='')return value}return''}
function slugifyCreatureName(name){return(name??'').toLowerCase().replace(/’/g,'').replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')}
function rowToCreature(row){
  const id=Number(firstValue(row,'id')),name=firstValue(row,'candidate')
  const score=Number(firstValue(row,'accessibility score','accessibility_score','accessibility'))
  const status=firstValue(row,'master_status','master status','status')||'Active'
  return{id,name,score:Number.isFinite(score)&&score>0?score:1,status,description:'A creature in the Zoologist expedition pool.'}
}
function loadCreatureCatalog(){
  const creatures=parseCsv(creatureCsv).map(rowToCreature).filter(c=>c.id&&c.name&&c.status.toLowerCase()==='active')
  if(!creatures.length)throw new Error('No Active creatures were found.')
  return creatures
}
function getCreatureImageCandidates(creature){
  const slug=slugifyCreatureName(creature?.name??'')
  return[`${import.meta.env.BASE_URL}assets/creatures/${slug}.png`,`${import.meta.env.BASE_URL}assets/creatures/${slug}.webp`,`${import.meta.env.BASE_URL}assets/creatures/${slug}.jpg`]
}
function pickStartingCreature(creatures){const pool=creatures.filter(c=>c.score===1);return pool[Math.floor(Math.random()*pool.length)]??creatures[0]??null}
function weightedCreaturePick(available,preferredScore=null){
  if(!available.length)return null
  if(preferredScore==null)return available[Math.floor(Math.random()*available.length)]
  const weighted=available.map(creature=>({creature,weight:1/(1+Math.abs(creature.score-preferredScore)*2)}))
  const total=weighted.reduce((s,i)=>s+i.weight,0);let roll=Math.random()*total
  for(const item of weighted){roll-=item.weight;if(roll<=0)return item.creature}
  return weighted[weighted.length-1].creature
}
function pickUnusedCreature(creatures,usedIds,preferredScore=null){return weightedCreaturePick(creatures.filter(c=>!usedIds.has(c.id)),preferredScore)}
function preferredScoreForDistance(x,y){return Math.min(8,Math.max(1,1+Math.floor((Math.abs(x)+Math.abs(y))/4)))}
function createInitialTiles(creatures,startCreature){
  return {
    [keyFor(0,0)]:{
      x:0,
      y:0,
      state:'frontier',
      creatureId:startCreature.id,
      completed:false,
      faceDown:true,
    },
  }
}
function getAdjacentPositions(tiles){
  const positions=new Map()
  Object.values(tiles).filter(t=>t.state==='explored').forEach(tile=>CARDINAL_DIRECTIONS.forEach(([dx,dy])=>{
    const x=tile.x+dx,y=tile.y+dy,k=keyFor(x,y);if(!tiles[k])positions.set(k,{x,y})
  }))
  return[...positions.values()]
}
function recomputeFrontier(tiles,creatures){
  const next={...tiles},used=new Set(Object.values(next).map(t=>t.creatureId).filter(Boolean))
  getAdjacentPositions(tiles).forEach(({x,y})=>{const creature=pickUnusedCreature(creatures,used,preferredScoreForDistance(x,y));if(creature){used.add(creature.id);next[keyFor(x,y)]={x,y,state:'frontier',creatureId:creature.id,completed:false}}})
  return next
}
function CreatureGlyph({creature,size='medium'}){
  const[index,setIndex]=useState(0),[failed,setFailed]=useState(false),name=creature?.name??''
  useEffect(()=>{setIndex(0);setFailed(false)},[name])
  if(!creature)return null
  const candidates=getCreatureImageCandidates(creature)
  return <div className={`creature-glyph creature-glyph-${size}`}>{!failed?<img src={candidates[index]} alt="" className="creature-image" draggable="false" onError={()=>index+1<candidates.length?setIndex(i=>i+1):setFailed(true)}/>:<span className="creature-fallback-glyph">🐾</span>}</div>
}
function MapTile({tile,selected,onSelect,onReveal,creatureById}){
  const creature=tile.creatureId?creatureById[tile.creatureId]:null
  const isFaceDown=Boolean(tile.faceDown)
  const baseUrl=import.meta.env.BASE_URL
  const handleClick=()=>{
    if(isFaceDown&&creature){onReveal?.(tile);return}
    if(creature)onSelect(tile)
  }
  return <button type="button" className={`map-tile map-tile-${tile.state} ${selected?'is-selected':''} ${isFaceDown?'is-face-down':''}`} onClick={handleClick} aria-label={isFaceDown?'Unexplored starting tile':creature?`${creature.name}${tile.completed?', completed':', newly revealed'}`:'Fog of war'}>
    {creature&&<>
      <span className="map-card-face map-card-back" aria-hidden="true"><img src={`${baseUrl}assets/ui/map_tile_back.png`} alt="" draggable="false"/></span>
      <span className="map-card-face map-card-front">
        <img src={`${baseUrl}assets/ui/map_tile.png`} alt="" draggable="false"/>
        <span className="map-card-content">
          <CreatureGlyph creature={creature} size="tile"/>
          <span className="tile-name">{creature.name}</span>
          {tile.completed?<span className="tile-status tile-status-complete">✓</span>:<span className="tile-status tile-status-frontier"><Eye size={10}/> NEW</span>}
        </span>
      </span>
    </>}
    {tile.state==='locked'&&<span className="tile-lock"><Lock size={13}/></span>}
  </button>
}
function SkillsView(){
  const unrestricted=['Attack','Hitpoints','Hunter']
  const locked=rewardCatalog.lockedSkills
  return <div className="full-tab-page">
    <div className="tab-page-heading"><div className="eyebrow"><Gem size={14}/> ACCOUNT PROGRESSION</div><h1>Skills</h1><p>Three skills are always available. All other skills are unlocked through Zoologist rewards.</p></div>
    <div className="skill-section"><h2>Unrestricted</h2><div className="skills-grid">{unrestricted.map(name=><div className="skill-card unrestricted" key={name}><div className="skill-icon">{name.slice(0,2).toUpperCase()}</div><div><strong>{name}</strong><span>Levels 1–99 available</span></div></div>)}</div></div>
    <div className="skill-section"><h2>Locked skills</h2><div className="skills-grid">{locked.map(name=><div className="skill-card" key={name}><div className="skill-icon"><Lock size={12}/></div><div><strong>{name}</strong><span>Unlock + 1–10 through 91–99</span></div></div>)}</div></div>
  </div>
}
function QuestsView(){
  const [filter,setFilter]=useState('all')
  const [statuses,setStatuses]=useState(()=>{try{return JSON.parse(localStorage.getItem('zoologist-quest-statuses')||'{}')}catch{return{}}})
  const [search,setSearch]=useState('')
  useEffect(()=>localStorage.setItem('zoologist-quest-statuses',JSON.stringify(statuses)),[statuses])
  const filtered=quests.filter(q=>{
    const status=statuses[q.id]||'unrevealed'
    const matches=filter==='all'||(filter==='revealed'&&status!=='unrevealed')||(filter==='completed'&&status==='completed')
    return matches&&q.name.toLowerCase().includes(search.toLowerCase())
  })
  const grouped=Object.entries(filtered.reduce((acc,q)=>{(acc[q.difficulty]??=[]).push(q);return acc},{}))
  const counts={all:quests.length,revealed:quests.filter(q=>(statuses[q.id]||'unrevealed')!=='unrevealed').length,completed:quests.filter(q=>statuses[q.id]==='completed').length}
  const cycleStatus=id=>setStatuses(s=>({...s,[id]:s[id]==='unrevealed'?'revealed':s[id]==='revealed'?'in_progress':s[id]==='in_progress'?'completed':'unrevealed'}))
  const statusLabel={unrevealed:'Unrevealed',revealed:'Not started',in_progress:'In progress',completed:'Complete'}
  return <div className="quest-log-page">
    <div className="quest-log-shell">
      <div className="quest-log-title"><ScrollText size={17}/><div><strong>Quest Log</strong><span>184 quests</span></div></div>
      <div className="quest-log-controls"><div className="quest-filters">{QUEST_FILTERS.map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f[0].toUpperCase()+f.slice(1)} <span>{counts[f]}</span></button>)}</div><label className="quest-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quests"/></label></div>
      <div className="quest-log-body"><div className="quest-list">{grouped.map(([difficulty,rows])=><section key={difficulty}><h3>{difficulty}</h3>{rows.map(q=>{const status=statuses[q.id]||'unrevealed';return <button key={q.id} className={`quest-row quest-${status}`} onClick={()=>status!=='unrevealed'&&cycleStatus(q.id)}><span className="quest-status-dot"/><span className="quest-name">{status==='unrevealed'?'???':q.name}</span><span className="quest-status-label">{statusLabel[status]}</span></button>})}</section>)}</div><div className="quest-info"><ScrollText size={30}/><h2>Quest Log</h2><p>Quest rewards reveal individual quests. Revealed quests are shown in red until started and green when complete.</p><small>For testing, click a revealed quest to cycle its local prototype status.</small></div></div>
    </div>
  </div>
}
function DiariesView(){
  const regions=['Ardougne','Desert','Falador','Fremennik','Kandarin','Karamja','Kourend & Kebos','Lumbridge & Draynor','Morytania','Varrock','Western Provinces','Wilderness']
  return <div className="full-tab-page"><div className="tab-page-heading"><div className="eyebrow"><BookOpen size={14}/> ACCOUNT PROGRESSION</div><h1>Achievement Diaries</h1><p>Every region has Easy, Medium, Hard and Elite reward milestones.</p></div><div className="diary-grid">{regions.map(region=><div className="diary-card" key={region}><strong>{region}</strong><div>{['Easy','Medium','Hard','Elite'].map(t=><span key={t}><i/> {t}</span>)}</div></div>)}</div></div>
}
function ShopView(){
  return <div className="full-tab-page"><div className="tab-page-heading"><div className="eyebrow"><ShoppingBag size={14}/> ZOOLOGIST POINTS</div><h1>Shop</h1><p>Boss tasks will award Zoologist Points. Costs remain configurable until the progression rules are finalized.</p></div><div className="shop-grid">{shop.items.map(item=><div className="shop-card" key={item.id}><div className="shop-card-icon"><Sparkles size={17}/></div><strong>{item.name}</strong><p>{item.description}</p><span>Cost: TBD</span></div>)}</div></div>
}
function BossView(){
  return <div className="full-tab-page"><div className="tab-page-heading"><div className="eyebrow"><Skull size={14}/> BOSS LAYERS</div><h1>Boss Tasks</h1><p>Boss layers are ready to award Zoologist Points once boss placement and task eligibility are finalized.</p></div><div className="boss-empty"><MapPinned size={28}/><strong>Boss pool not assigned yet</strong><span>{bossSystem.tasks.length} boss tasks configured</span></div></div>
}
function SidePanel({open,setOpen,selectedTile,onClear,onComplete,exploredCount,frontierCount,creatureById,creatureCount}){
  const creature=selectedTile?.creatureId?creatureById[selectedTile.creatureId]:null
  return <aside className={`side-panel ${open?'side-panel-open':'side-panel-collapsed'}`}>{open?<><div className="side-panel-header"><div><div className="eyebrow"><Compass size={13}/> EXPEDITION LOG</div><strong>Discovery details</strong></div><button className="icon-button" onClick={()=>setOpen(false)}><ChevronRight size={17}/></button></div>{!creature?<div className="side-empty"><div className="empty-orb"><PawPrint size={24}/></div><h2>Select a tile</h2><p>Click an explored or newly revealed creature to inspect its progression reward.</p><div className="side-stat-grid"><div><span>Explored</span><strong>{exploredCount}</strong></div><div><span>Revealed</span><strong>{frontierCount}</strong></div><div><span>Creatures</span><strong>{creatureCount}</strong></div><div><span>Points</span><strong>0</strong></div></div></div>:<div className="side-detail"><button className="back-link" onClick={onClear}><ChevronLeft size={14}/> Back to expedition</button><div className={`detail-banner ${selectedTile.completed?'complete':'frontier'}`}><span>{selectedTile.completed?'COMPLETED TILE':'NEWLY REVEALED'}</span>{selectedTile.completed?<ShieldCheck size={15}/>:<Eye size={15}/>}</div><div className="detail-creature"><CreatureGlyph creature={creature} size="hero"/><div><h2>{creature.name}</h2><span>Creature ID {creature.id}</span></div></div><p className="detail-description">{creature.description}</p><div className="detail-stats"><div><span>Accessibility</span><strong>Score {creature.score}</strong></div><div><span>Completion</span><strong>{selectedTile.completed?'Complete':'Not complete'}</strong></div></div><div className="reward-box"><div className="reward-heading"><Sparkles size={15}/> Completion reward</div><strong>Reward assignment pending</strong><p>The reward catalog is ready; creature-specific eligibility and assignment will be added once quest/diary dependency rules are finalized.</p></div>{!selectedTile.completed&&<button className="complete-button" onClick={()=>onComplete(selectedTile)}><Flag size={15}/> Mark complete</button>}</div>}</>:<button className="collapsed-rail" onClick={()=>setOpen(true)}><ChevronLeft size={18}/><span>EXPEDITION</span></button>}</aside>
}
function MapView({creatures,onCompletedCountChange}){
  const creatureById=useMemo(()=>Object.fromEntries(creatures.map(c=>[c.id,c])),[creatures])
  const [panelOpen,setPanelOpen]=useState(true),[selectedTile,setSelectedTile]=useState(null),[startCreature]=useState(()=>pickStartingCreature(creatures))
  const [tiles,setTiles]=useState(()=>createInitialTiles(creatures,startCreature)),[pan,setPan]=useState({x:0,y:0}),[zoom,setZoom]=useState(1),[dragging,setDragging]=useState(false)
  const stageRef=useRef(null),zoomRef=useRef(zoom),pointerRef=useRef({x:0,y:0,inside:false}),dragRef=useRef({active:false,x:0,y:0}),edgeFrameRef=useRef(null)
  useEffect(()=>{zoomRef.current=zoom},[zoom])
  const updatePan=(dx,dy)=>setPan(current=>({x:current.x+dx,y:current.y+dy}))
  useEffect(()=>{
    const handleKeyDown=e=>{
      if(e.target instanceof HTMLElement&&['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return
      const amount=e.shiftKey?48:28
      if(e.key==='ArrowUp'){e.preventDefault();updatePan(0,amount)}
      if(e.key==='ArrowDown'){e.preventDefault();updatePan(0,-amount)}
      if(e.key==='ArrowLeft'){e.preventDefault();updatePan(amount,0)}
      if(e.key==='ArrowRight'){e.preventDefault();updatePan(-amount,0)}
      if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(z=>Math.min(MAX_ZOOM,Number((z+ZOOM_STEP).toFixed(2))))}
      if(e.key==='-'||e.key==='_'){e.preventDefault();setZoom(z=>Math.max(MIN_ZOOM,Number((z-ZOOM_STEP).toFixed(2))))}
      if(e.key==='0'){e.preventDefault();setPan({x:0,y:0});setZoom(1)}
    }
    window.addEventListener('keydown',handleKeyDown);return()=>window.removeEventListener('keydown',handleKeyDown)
  },[])
  useEffect(()=>{
    const tick=()=>{const stage=stageRef.current,p=pointerRef.current;if(stage&&p.inside&&!dragRef.current.active){const r=stage.getBoundingClientRect(),x=p.x-r.left,y=p.y-r.top,z=EDGE_ZONE;let dx=0,dy=0;if(x<=z)dx=5+(1-x/z)*10;if(x>=r.width-z)dx=-(5+(1-(r.width-x)/z)*10);if(y<=z)dy=5+(1-y/z)*10;if(y>=r.height-z)dy=-(5+(1-(r.height-y)/z)*10);if(dx||dy)updatePan(dx,dy)}edgeFrameRef.current=requestAnimationFrame(tick)}
    edgeFrameRef.current=requestAnimationFrame(tick);return()=>cancelAnimationFrame(edgeFrameRef.current)
  },[])
  const zoomAtPoint=(nextZoom,clientX,clientY)=>{
    const stage=stageRef.current;if(!stage)return
    const rect=stage.getBoundingClientRect(),ox=clientX-(rect.left+rect.width/2),oy=clientY-(rect.top+rect.height/2),current=zoomRef.current,target=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,nextZoom))
    if(Math.abs(target-current)<.001)return
    const ratio=target/current
    setPan(p=>({x:ox-(ox-p.x)*ratio,y:oy-(oy-p.y)*ratio}));setZoom(target)
  }
  const handleWheel=e=>{e.preventDefault();zoomAtPoint(zoomRef.current+(e.deltaY>0?-1:1)*(e.ctrlKey?.05:.11),e.clientX,e.clientY)}
  const handlePointerMove=e=>{pointerRef.current={x:e.clientX,y:e.clientY,inside:true};if(!dragRef.current.active)return;const dx=e.clientX-dragRef.current.x,dy=e.clientY-dragRef.current.y;dragRef.current.x=e.clientX;dragRef.current.y=e.clientY;updatePan(dx,dy)}
  const handlePointerDown=e=>{if(e.button!==1)return;e.preventDefault();dragRef.current={active:true,x:e.clientX,y:e.clientY};setDragging(true);stageRef.current?.setPointerCapture(e.pointerId)}
  const stopDrag=e=>{if(!dragRef.current.active)return;dragRef.current.active=false;setDragging(false);try{stageRef.current?.releasePointerCapture(e.pointerId)}catch{}}
  const handlePointerLeave=()=>{if(!dragRef.current.active)pointerRef.current.inside=false}
  const centreTileX=Math.round(-pan.x/(TILE_STEP*zoom)),centreTileY=Math.round(-pan.y/(TILE_STEP*zoom))
  const knownTiles=Object.values(tiles)
  const nearestKnownDistance=(x,y)=>knownTiles.reduce((best,t)=>Math.min(best,Math.abs(x-t.x)+Math.abs(y-t.y)),Infinity)
  const mapCells=useMemo(()=>{
    const startX=centreTileX-RENDER_RADIUS,startY=centreTileY-RENDER_RADIUS,cells=[]
    for(let y=startY;y<=centreTileY+RENDER_RADIUS;y+=1)for(let x=startX;x<=centreTileX+RENDER_RADIUS;x+=1){
      const known=tiles[keyFor(x,y)]
      if(known) cells.push({...known})
      else {
        const distance=nearestKnownDistance(x,y)
        cells.push({x,y,state:distance<=FOG_RADIUS?'locked':'void',completed:false})
      }
    }
    const gridSize=RENDER_DIAMETER*TILE_SIZE+(RENDER_DIAMETER-1)*TILE_GAP
    return{cells,gridSize,offsetX:pan.x+centreTileX*TILE_STEP*zoom,offsetY:pan.y+centreTileY*TILE_STEP*zoom}
  },[centreTileX,centreTileY,pan.x,pan.y,tiles,zoom])
  const exploredCount=knownTiles.filter(t=>t.state==='explored').length,frontierCount=knownTiles.filter(t=>t.state==='frontier').length,creatureCount=creatures.length
  const handleReveal=tile=>{
    if(!tile?.faceDown)return
    const revealed={...tile,faceDown:false}
    setTiles(current=>({...current,[keyFor(tile.x,tile.y)]:revealed}))
    setSelectedTile(revealed)
  }
  const handleComplete=tile=>{
    if(!tile||tile.state!=='frontier'||tile.completed||tile.faceDown)return
    setTiles(current=>recomputeFrontier({
      ...current,
      [keyFor(tile.x,tile.y)]:{
        ...current[keyFor(tile.x,tile.y)],
        state:'explored',
        completed:true,
        faceDown:false,
      },
    },creatures))
    setSelectedTile(current=>({...current,state:'explored',completed:true,faceDown:false}))
    onCompletedCountChange?.(n=>n+1)
  }
  return <div className={`map-layout ${panelOpen?'':'panel-collapsed-layout'}`}><section className="map-panel">
    <div className="map-toolbar"><div><div className="eyebrow"><Gamepad2 size={13}/> ZOOLOGIST EXPEDITION</div><h1>Unknown Territory</h1><p>Explore the revealed frontier and look beyond the cloud.</p></div><div className="map-legend"><span><i className="legend-swatch explored"/> Explored</span><span><i className="legend-swatch frontier"/> Revealed</span><span><i className="legend-swatch fog"/> Clouded</span></div></div>
    <div className={`map-stage ${dragging?'is-dragging':''}`} ref={stageRef} onPointerMove={handlePointerMove} onPointerDown={handlePointerDown} onPointerUp={stopDrag} onPointerCancel={stopDrag} onPointerLeave={handlePointerLeave} onWheel={handleWheel} onContextMenu={e=>e.preventDefault()} tabIndex={0} aria-label="Zoologist map">
      <div className="cloud-bank" aria-hidden="true"/><div className="map-grid-pan" style={{width:mapCells.gridSize,height:mapCells.gridSize,transform:`translate3d(-50%,-50%,0) translate3d(${mapCells.offsetX}px,${mapCells.offsetY}px,0)`}}><div className="map-grid" style={{width:mapCells.gridSize,height:mapCells.gridSize,gridTemplateColumns:`repeat(${RENDER_DIAMETER},${TILE_SIZE}px)`,gridTemplateRows:`repeat(${RENDER_DIAMETER},${TILE_SIZE}px)` ,transform:`scale(${zoom})`}}>{mapCells.cells.map(tile=><MapTile key={`${tile.x}:${tile.y}`} tile={tile} selected={selectedTile&&selectedTile.x===tile.x&&selectedTile.y===tile.y} onSelect={setSelectedTile} onReveal={handleReveal} creatureById={creatureById}/>)}</div></div>
      <div className="map-zoom-controls" onPointerDown={e=>e.stopPropagation()}><button onClick={()=>zoomAtPoint(zoom-ZOOM_STEP,innerWidth/2,innerHeight/2)}>−</button><button className="zoom-readout" onClick={()=>{setPan({x:0,y:0});setZoom(1)}}>{Math.round(zoom*100)}%</button><button onClick={()=>zoomAtPoint(zoom+ZOOM_STEP,innerWidth/2,innerHeight/2)}>+</button></div>
      <div className="map-control-hint"><div><MousePointer2 size={13}/> Move to edge to pan</div><div>↑ ↓ ← → <span>Arrow keys</span></div><div>MMB <span>Drag to pan</span></div><div>Wheel <span>Zoom</span></div></div>
      <div className="map-key"><div><span className="key-dot key-complete"/> Completed</div><div><span className="key-dot key-frontier"/> Revealed</div><div><span className="key-dot key-fog"/> Clouded</div></div><div className="map-position">WORLD {centreTileX}, {centreTileY}</div>
    </div>
    <div className="map-footer-bar"><div><span>EXPLORED</span><strong>{exploredCount}</strong></div><div><span>REVEALED</span><strong>{frontierCount}</strong></div><div><span>CREATURES COMPLETED</span><strong>{exploredCount} / {creatureCount}</strong></div><div className="footer-note"><Eye size={13}/> The wider world is hidden.</div></div>
  </section><SidePanel open={panelOpen} setOpen={setPanelOpen} selectedTile={selectedTile} onClear={()=>setSelectedTile(null)} onComplete={handleComplete} exploredCount={exploredCount} frontierCount={frontierCount} creatureById={creatureById} creatureCount={creatureCount}/></div>
}
function App(){
  const [tab,setTab]=useState('map')
  const [creatures]=useState(()=>{try{return loadCreatureCatalog()}catch{return[]}})
  const [completedCount,setCompletedCount]=useState(1)
  if(!creatures.length)return <div className="app-shell"><div className="full-tab-page"><h1>Creature data could not be loaded</h1><p>Check data/creatures.csv.</p></div></div>
  const creatureCount=creatures.length
  const tabs=[
    {id:'map',label:'Map',icon:LayoutGrid},{id:'skills',label:'Skills',icon:Gem},{id:'quests',label:'Quests',icon:ScrollText},
    {id:'diaries',label:'Diaries',icon:BookOpen},{id:'shop',label:'Shop',icon:ShoppingBag},{id:'bosses',label:'Bosses',icon:Skull}
  ]
  const page=tab==='skills'?<SkillsView/>:tab==='quests'?<QuestsView/>:tab==='diaries'?<DiariesView/>:tab==='shop'?<ShopView/>:tab==='bosses'?<BossView/>:<MapView creatures={creatures} onCompletedCountChange={setCompletedCount}/>
  return <div className="app-shell"><header className="topbar"><div className="brand-block"><div className="brand-mark"><PawPrint size={21}/></div><div><div className="brand-name">Zoologist</div><div className="brand-subtitle">OSRS creature exploration</div></div></div><nav className="top-tabs">{tabs.map(({id,label,icon:Icon})=><button type="button" key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={16}/>{label}</button>)}</nav><div className="header-actions"><div className="header-progress"><div className="progress-label"><span>CREATURES</span><strong>{completedCount} / {creatureCount}</strong></div><div className="progress-track"><div className="progress-fill" style={{width:`${Math.min(100,completedCount/creatureCount*100)}%`}}/></div></div><button className="account-button"><Users size={16}/> Account</button></div></header><main className="app-main">{page}</main><footer className="footer"><span>ZOOLOGIST • MASTER DATA CONNECTED</span><span>{creatureCount} Active creatures • Graduated cloud fog • Progression framework</span></footer></div>
}
createRoot(document.getElementById('root')).render(<App />)
