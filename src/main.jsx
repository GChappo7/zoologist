import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BookOpen, ChevronLeft, ChevronRight, Compass, Eye, Flag, Gamepad2, Gem,
  LayoutGrid, MousePointer2, PawPrint, ScrollText, ShieldCheck,
  Sparkles, Users, Search, ShoppingBag, Skull, MapPinned
} from 'lucide-react'
import './styles.css'
import './zoologist-overrides.css'
import creatureCsv from '../data/creatures.csv?raw'
import quests from '../data/quests.json'
import rewardCatalog from '../data/reward-catalog.json'
import shop from '../data/shop.json'
import bossSystem from '../data/boss-system.json'
import { isValidQuestRewardAssignment, isValidSkillRewardAssignment } from './progressionRules'
import AccountModal from './lib/accountModal'
import { supabase } from './lib/supabase'
import { ensureProfile, loadCloudGameState, readLocalGameState, saveCloudGameState } from './lib/gameState'

const TILE_SIZE = 256
const TILE_GAP = 0
const TILE_STEP = TILE_SIZE + TILE_GAP
const RENDER_RADIUS = 20
const RENDER_DIAMETER = RENDER_RADIUS * 2 + 1
const EDGE_ZONE = 70
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.25
const ZOOM_STEP = 0.12
const CARDINAL_DIRECTIONS = [[0,-1],[1,0],[0,1],[-1,0]]
const QUEST_FILTERS = ['all','revealed','completed']

const PROGRESSION_ASSETS = {
  quest: 'https://oldschool.runescape.wiki/images/Quests.png',
  diary: 'https://oldschool.runescape.wiki/images/Achievement_Diaries.png',
  skills: {},
}

const SKILL_TAB_LAYOUT = [
  ['Attack','Hitpoints','Mining'],
  ['Strength','Agility','Smithing'],
  ['Defence','Herblore','Fishing'],
  ['Ranged','Thieving','Cooking'],
  ['Prayer','Crafting','Firemaking'],
  ['Magic','Fletching','Woodcutting'],
  ['Runecraft','Slayer','Farming'],
  ['Construction','Hunter','Sailing'],
]

const SKILL_BOX_ASSET = 'Blank skill.png'

function skillIconUrl(skill) {
  const name = String(skill ?? '')
  if(name === 'Sailing') return 'https://oldschool.runescape.wiki/images/Sailing_icon.png'
  const filename = name.replace(/\s+/g,'_')
  return `https://oldschool.runescape.wiki/images/${filename}_icon_(detail).png`
}

function skillBoxUrl() {
  return `${import.meta.env.BASE_URL}assets/ui/skills/${encodeURIComponent(SKILL_BOX_ASSET)}`
}

function ProgressionIcon({type,skill,background=false,className=''}) {
  const src=type==='skill' ? skillIconUrl(skill) : PROGRESSION_ASSETS[type]
  if(!src)return null
  return <img className={`progression-icon ${background?'progression-icon-background':''} ${className}`} src={src} alt="" aria-hidden="true" draggable="false"/>
}

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
  const requiredSkill=firstValue(row,'required skill','required_skill')
  const requiredLevelValue=Number(firstValue(row,'required level','required_level'))
  const howToComplete=firstValue(row,'how to complete?','how_to_complete','how to complete')
  const requiredQuests=firstValue(row,'required quest(s)','required_quest(s)','required quests','required quests')
    .split(';').map(q=>q.trim()).filter(Boolean)
  const hardNoRewardQuests=firstValue(row,'hard no reward quest(s)','hard_no_reward_quests','hard no reward quests')
    .split(';').map(q=>q.trim()).filter(Boolean)
  const requiredLevel=Number.isFinite(requiredLevelValue)&&requiredLevelValue>0?requiredLevelValue:null
  return{id,name,score:Number.isFinite(score)&&score>=0?score:1,status,howToComplete,requiredQuests,requiredSkill,requiredLevel,hardNoRewardQuests,description:'A creature in the Zoologist expedition pool.'}
}
function loadCreatureCatalog(){
  const creatures=parseCsv(creatureCsv).map(rowToCreature).filter(c=>c.id&&c.name&&c.status.toLowerCase()==='active')
  if(!creatures.length)throw new Error('No Active creatures were found.')
  return creatures
}
const RAW_FISH_WIKI_IMAGES={
  Shrimp:'Raw_shrimps_detail.png',
  Anchovy:'Raw_anchovies_detail.png',
  Sardine:'Raw_sardine_detail.png',
  Herring:'Raw_herring_detail.png',
  Mackerel:'Raw_mackerel_detail.png',
  Cod:'Raw_cod_detail.png',
  Pike:'Raw_pike_detail.png',
  Trout:'Raw_trout_detail.png',
  Salmon:'Raw_salmon_detail.png',
  Tuna:'Raw_tuna_detail.png',
  Bass:'Raw_bass_detail.png',
  Swordfish:'Raw_swordfish_detail.png',
  Lobster:'Raw_lobster_detail.png',
  Monkfish:'Raw_monkfish_detail.png',
  Shark:'Raw_shark_detail.png',
  Anglerfish:'Raw_anglerfish_detail.png',
  Karambwanji:'Raw_karambwanji_detail.png',
  Karambwan:'Raw_karambwan_detail.png',
  'Rainbow fish':'Raw_rainbow_fish_detail.png',
  'Dark Crab':'Raw_dark_crab_detail.png',
  'Cave Eel':'Raw_cave_eel_detail.png',
  'Slimy Eel':'Raw_slimy_eel_detail.png',
  'Manta Ray':'Raw_manta_ray_detail.png',
  'Sea Turtle':'Raw_sea_turtle_detail.png',
  'Swordtip Squid':'Raw_swordtip_squid_detail.png',
  'Giant Krill':'Raw_giant_krill_detail.png',
  Haddock:'Raw_haddock_detail.png',
  Yellowfin:'Raw_yellowfin_detail.png',
  Halibut:'Raw_halibut_detail.png',
  Bluefin:'Raw_bluefin_detail.png',
  Marlin:'Raw_marlin_detail.png',
  'Jumbo Squid':'Raw_jumbo_squid_detail.png'
}
function getCreatureImageCandidates(creature){
  const name=creature?.name??''
  const slug=slugifyCreatureName(name)
  const localCandidates=[`${import.meta.env.BASE_URL}assets/creatures/${slug}.png`,`${import.meta.env.BASE_URL}assets/creatures/${slug}.webp`,`${import.meta.env.BASE_URL}assets/creatures/${slug}.jpg`]
  const rawFishImage=RAW_FISH_WIKI_IMAGES[name]
  return rawFishImage?[`https://oldschool.runescape.wiki/images/${rawFishImage}`,...localCandidates]:localCandidates
}
const STARTING_TILE_EXCLUDED_CREATURES=new Set(['Duck'])
function pickStartingCreature(creatures){
  const pool=creatures.filter(c=>c.score===0&&!STARTING_TILE_EXCLUDED_CREATURES.has(c.name))
  if(!pool.length)throw new Error('No valid score 0 creatures available for starting tile.')
  return pool[Math.floor(Math.random()*pool.length)]
}
function canAssignSkillReward(creature,reward){return isValidSkillRewardAssignment(creature,reward)}
function canAssignQuestReward(creature,reward){return isValidQuestRewardAssignment(creature,reward)}
function weightedCreaturePick(available,preferredScore=null){
  if(!available.length)return null
  if(preferredScore==null)return available[Math.floor(Math.random()*available.length)]
  const weighted=available.map(creature=>({creature,weight:1/(1+Math.abs(creature.score-preferredScore)*2)}))
  const total=weighted.reduce((s,i)=>s+i.weight,0);let roll=Math.random()*total
  for(const item of weighted){roll-=item.weight;if(roll<=0)return item.creature}
  return weighted[weighted.length-1].creature
}
function pickUnusedCreature(creatures,usedIds,preferredScore=null){
  const available=creatures.filter(c=>!usedIds.has(c.id))
  if(preferredScore===1){
    const weighted=available.map(creature=>({
      creature,
      weight:creature.score<=1?12:creature.score===2?2:0.5
    }))
    const total=weighted.reduce((s,i)=>s+i.weight,0)
    let roll=Math.random()*total
    for(const item of weighted){
      roll-=item.weight
      if(roll<=0)return item.creature
    }
    return weighted[weighted.length-1]?.creature??null
  }
  return weightedCreaturePick(available,preferredScore)
}
function preferredScoreForDistance(x,y){return Math.min(8,Math.max(1,1+Math.floor((Math.abs(x)+Math.abs(y))/4)))}
function createInitialTiles(creatures,startCreature,skillProgress){
  const reward=getInitialTileReward(startCreature,skillProgress)
  return {
    [keyFor(0,0)]:{
      x:0,
      y:0,
      state:'frontier',
      creatureId:startCreature.id,
      completed:false,
      faceDown:true,
      ...(reward?{reward}:{}),
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
function recomputeFrontier(tiles,creatures,skillProgress){
  const next={...tiles},used=new Set(Object.values(next).map(t=>t.creatureId).filter(Boolean))
  getAdjacentPositions(tiles).forEach(({x,y})=>{
    const creature=pickUnusedCreature(creatures,used,preferredScoreForDistance(x,y))
    if(creature){
      used.add(creature.id)
      const distance=Math.abs(x)+Math.abs(y)
      const reward=createTileReward(creature,skillProgress,distance)
      next[keyFor(x,y)]={x,y,state:'frontier',creatureId:creature.id,completed:false,faceDown:false,revealAnimation:true,...(reward?{reward}:{})}
    }
  })
  return next
}
function CreatureGlyph({creature,size='medium'}){
  const[index,setIndex]=useState(0),[failed,setFailed]=useState(false),name=creature?.name??''
  useEffect(()=>{setIndex(0);setFailed(false)},[name])
  if(!creature)return null
  const candidates=getCreatureImageCandidates(creature)
  const isRawFishImage=Boolean(RAW_FISH_WIKI_IMAGES[name]&&index===0)
  return <div className={`creature-glyph creature-glyph-${size} ${isRawFishImage?'creature-glyph-raw-fish':''}`}>{!failed?<img src={candidates[index]} alt="" className={`creature-image ${isRawFishImage?'creature-image-raw-fish':''}`} draggable="false" onError={()=>index+1<candidates.length?setIndex(i=>i+1):setFailed(true)}/>:<span className="creature-fallback-glyph">🐾</span>}</div>
}
function MapTile({tile,selected,onSelect,onReveal,creatureById,skillProgress}){
  const creature=tile.creatureId?creatureById[tile.creatureId]:null
  const isFaceDown=Boolean(tile.faceDown)
    const handleClick=()=>{
    if(isFaceDown&&creature){onReveal?.(tile);return}
    if(creature)onSelect(tile)
  }
  return <button type="button" style={{...(tile.fogDistance?{'--fog-distance':tile.fogDistance}:{}),...(tile.gridColumn?{gridColumn:tile.gridColumn,gridRow:tile.gridRow}:{})}} data-tile-key={keyFor(tile.x,tile.y)} className={`map-tile map-tile-${tile.state} ${selected?'is-selected':''} ${isFaceDown?'is-face-down':''} ${tile.revealAnimation?'is-batch-reveal':''}`} onClick={handleClick} aria-label={isFaceDown?'Unexplored starting tile':creature?`${creature.name}${tile.completed?', completed':', newly revealed'}`:'Fog of war'}>
    {creature&&<>
      <span className="map-card-face map-card-back" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}assets/ui/map_tile_back.png`} alt="" draggable="false"/></span>
      <span className="map-card-face map-card-front">
        <img src={`${import.meta.env.BASE_URL}assets/ui/map_tile.png`} alt="" draggable="false"/>
        <span className="map-card-content">
          {tile.completed&&<img className="tile-completed-tick" src={`${import.meta.env.BASE_URL}assets/ui/tick_circle.png`} alt="" aria-hidden="true" draggable="false"/>}
          {(()=>{const reward=getTileReward(tile,creature,skillProgress);const presentation=getRewardPresentation(reward);return reward&&<ProgressionIcon type={presentation.type} skill={presentation.iconName} className="tile-progression-stamp"/>})()}
          <CreatureGlyph creature={creature} size="tile"/>
          <span className={`tile-completion-method ${creature.howToComplete === 'Find and kill' ? 'tile-method-slay' : creature.howToComplete === 'Find and examine' ? 'tile-method-examine' : creature.howToComplete === 'Find and catch/hunt' ? 'tile-method-catch' : creature.howToComplete === 'Shear' ? 'tile-method-shear' : creature.howToComplete === 'PET!' || creature.howToComplete === 'Examine or PET!' ? 'tile-method-pet' : ''}`}>{creature.howToComplete === 'Find and kill' ? 'Slay' : creature.howToComplete === 'Find and examine' ? 'Examine' : creature.howToComplete === 'Find and catch/hunt' ? 'Catch or Hunt' : creature.howToComplete === 'Shear' ? 'Shear' : creature.howToComplete === 'PET!' ? 'PET!' : creature.howToComplete === 'Examine or PET!' ? 'Examine or PET!' : creature.howToComplete}</span><span className="tile-name">{creature.name}</span>
        </span>
      </span>
    </>}
    {['locked','dark-fog-1','dark-fog-2','dark-fog-3','black-fog'].includes(tile.state)&&<span className="map-card-face map-card-back map-fog-card" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}assets/ui/map_tile_back.png`} alt="" draggable="false"/>{tile.state!=='locked'&&<span className="fog-darken" aria-hidden="true"/>}</span>}
  </button>
}
function getSkillRewardSequence(skill){
  return rewardCatalog.mandatory.filter(r=>String(r.type).toLowerCase()==='skill'&&r.skill===skill).sort((a,b)=>Number(a.band.split('-')[0])-Number(b.band.split('-')[0]))
}
function getInitialSkillProgress(){
  return Object.fromEntries(rewardCatalog.lockedSkills.map(skill=>[skill,{unlocked:false,maxLevel:0,nextRewardIndex:0}]))
}
function normalizeSkillProgress(saved){
  const initial=getInitialSkillProgress()
  for(const skill of rewardCatalog.lockedSkills){
    const value=saved?.[skill]
    if(!value)continue
    if(value.unlocked===true&&Number(value.maxLevel)===0){
      initial[skill]={unlocked:false,maxLevel:0,nextRewardIndex:0}
      continue
    }
    const maxLevel=Math.min(99,Math.max(0,Number(value.maxLevel)||0))
    const nextRewardIndex=Math.min(10,Math.max(0,Number(value.nextRewardIndex)||0))
    initial[skill]={unlocked:maxLevel>0,maxLevel,nextRewardIndex}
  }
  return initial
}
function getNextSkillBand(skillProgress,skill){
  const progress=skillProgress?.[skill]??{nextRewardIndex:0}
  return getSkillRewardSequence(skill)[progress.nextRewardIndex]??null
}
function getRandomSkillReward(creature,skillProgress){
  const skills=rewardCatalog.lockedSkills
  const validSkills=skills.filter(skill=>{
    const nextReward=getNextSkillBand(skillProgress??getInitialSkillProgress(),skill)
    return nextReward&&canAssignSkillReward(creature,{...nextReward,type:'skill',skill})
  })
  if(!validSkills.length)return null
  const skill=validSkills[Math.floor(Math.random()*validSkills.length)]
  const reward=getNextSkillBand(skillProgress??getInitialSkillProgress(),skill)
  return reward?{...reward,type:'skill',skill}:null
}
function SkillsDropdown({open,onClose,skillProgress,anchorRef}) {
  const panelRef=useRef(null)
  const [anchorPosition,setAnchorPosition]=useState(null)
  useLayoutEffect(()=>{
    if(!open)return
    const updatePosition=()=>{
      const anchor=anchorRef?.current
      if(!anchor)return
      const rect=anchor.getBoundingClientRect()
      setAnchorPosition({top:rect.bottom+8,left:rect.left+rect.width/2})
    }
    updatePosition()
    window.addEventListener('resize',updatePosition)
    window.addEventListener('scroll',updatePosition,true)
    return()=>{
      window.removeEventListener('resize',updatePosition)
      window.removeEventListener('scroll',updatePosition,true)
    }
  },[open,anchorRef])
  useEffect(()=>{
    if(!open)return
    const handlePointerDown=e=>{
      const insidePanel=panelRef.current?.contains(e.target)
      const insideAnchor=anchorRef?.current?.contains(e.target)
      if(!insidePanel&&!insideAnchor)onClose?.()
    }
    const handleKeyDown=e=>{
      if(e.key==='Escape')onClose?.()
    }
    document.addEventListener('pointerdown',handlePointerDown)
    window.addEventListener('keydown',handleKeyDown)
    return()=>{
      document.removeEventListener('pointerdown',handlePointerDown)
      window.removeEventListener('keydown',handleKeyDown)
    }
  },[open,onClose])
  if(!open)return null
  const unrestricted=new Set(['Attack','Hitpoints','Hunter'])
  const getDisplay=name=>{
    if(unrestricted.has(name))return '1-99'
    const progress=skillProgress?.[name]??{unlocked:false,maxLevel:0,nextRewardIndex:0}
    if(!progress.unlocked)return 'Locked'
    const completedIndex=Math.max(0,Math.min(9,Number(progress.nextRewardIndex)-1))
    return getSkillRewardSequence(name)[completedIndex]?.band??'91–99'
  }
  return <div className="skills-dropdown-anchor" ref={panelRef} role="dialog" aria-label="Skills" style={anchorPosition?{top:anchorPosition.top,left:anchorPosition.left}:undefined}>
    <div className="skills-dropdown-panel">
      <div className="skills-dropdown-grid">
        {SKILL_TAB_LAYOUT.flatMap(row=>row.map(name=>{
          const unlocked=unrestricted.has(name)||(skillProgress?.[name]?.unlocked===true)
          const value=getDisplay(name)
          const boxUrl=skillBoxUrl()
          return <div className={`osrs-skill-slot ${unlocked?'is-unlocked':'is-locked'}`} key={name} title={unlocked?`${name}: ${value}`:`${name}: locked`} style={{backgroundImage:`url("${boxUrl}")`,backgroundSize:'100% 100%',backgroundRepeat:'no-repeat'}}>
            <span className="osrs-skill-box" aria-hidden="true">
              <ProgressionIcon type="skill" skill={name} className="osrs-skill-icon"/>
              {!unlocked&&<img className="osrs-skill-lock-asset" src={`${import.meta.env.BASE_URL}assets/ui/lock_asset.png`} alt="" draggable="false"/>}
            </span>
            <span className="osrs-skill-level" aria-label={value}>{value}</span>
          </div>
        }))}
      </div>
    </div>
  </div>
}
function QuestsView({initialStatuses={},onStatusesChange}){
  const [filter,setFilter]=useState('all')
  const [statuses,setStatuses]=useState(initialStatuses||{})
  const [search,setSearch]=useState('')
  useEffect(()=>{localStorage.setItem('zoologist-quest-statuses',JSON.stringify(statuses));onStatusesChange?.(statuses)},[statuses,onStatusesChange])
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
      <div className="quest-log-title"><ProgressionIcon type="quest"/><div><strong>Quest Log</strong><span>184 quests</span></div></div>
      <div className="quest-log-controls"><div className="quest-filters">{QUEST_FILTERS.map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f[0].toUpperCase()+f.slice(1)} <span>{counts[f]}</span></button>)}</div><label className="quest-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quests"/></label></div>
      <div className="quest-log-body"><div className="quest-list">{grouped.map(([difficulty,rows])=><section key={difficulty}><h3>{difficulty}</h3>{rows.map(q=>{const status=statuses[q.id]||'unrevealed';return <button key={q.id} className={`quest-row quest-${status}`} onClick={()=>status!=='unrevealed'&&cycleStatus(q.id)}><span className="quest-status-dot"/><span className="quest-name">{status==='unrevealed'?'???':q.name}</span><span className="quest-status-label">{statusLabel[status]}</span></button>})}</section>)}</div><div className="quest-info"><ScrollText size={30}/><h2>Quest Log</h2><p>Quest rewards reveal individual quests. Revealed quests are shown in red until started and green when complete.</p><small>For testing, click a revealed quest to cycle its local prototype status.</small></div></div>
    </div>
  </div>
}
function DiariesView(){
  const regions=['Ardougne','Desert','Falador','Fremennik','Kandarin','Karamja','Kourend & Kebos','Lumbridge & Draynor','Morytania','Varrock','Western Provinces','Wilderness']
  return <div className="full-tab-page"><div className="tab-page-heading"><div className="eyebrow"><BookOpen size={14}/> ACCOUNT PROGRESSION</div><h1>Achievement Diaries</h1><p>Every region has Easy, Medium, Hard and Elite reward milestones.</p></div><div className="diary-grid">{regions.map(region=><div className="diary-card" key={region}><ProgressionIcon type="diary" background/><strong>{region}</strong><div>{['Easy','Medium','Hard','Elite'].map(t=><span key={t}><i/> {t}</span>)}</div></div>)}</div></div>
}
function ShopView(){
  return <div className="full-tab-page"><div className="tab-page-heading"><div className="eyebrow"><ShoppingBag size={14}/> ZOOLOGIST POINTS</div><h1>Shop</h1><p>Boss tasks will award Zoologist Points. Costs remain configurable until the progression rules are finalized.</p></div><div className="shop-grid">{shop.items.map(item=><div className="shop-card" key={item.id}><div className="shop-card-icon"><Sparkles size={17}/></div><strong>{item.name}</strong><p>{item.description}</p><span>Cost: TBD</span></div>)}</div></div>
}
function BossView(){
  return <div className="full-tab-page"><div className="tab-page-heading"><div className="eyebrow"><Skull size={14}/> BOSS LAYERS</div><h1>Boss Tasks</h1><p>Boss layers are ready to award Zoologist Points once boss placement and task eligibility are finalized.</p></div><div className="boss-empty"><MapPinned size={28}/><strong>Boss pool not assigned yet</strong><span>{bossSystem.tasks.length} boss tasks configured</span></div></div>
}
function getInitialTileReward(creature,skillProgress){
  const skillReward=getRandomSkillReward(creature,skillProgress)
  if(!skillReward)return null
  const firstBand=getSkillRewardSequence(skillReward.skill)[0]
  return firstBand?{...firstBand,type:'skill',skill:skillReward.skill}:skillReward
}

function weightedRandomPick(items,getWeight){
  if(!items.length)return null
  const weighted=items.map(item=>({item,weight:Math.max(0,Number(getWeight(item))||0)}))
  const total=weighted.reduce((sum,entry)=>sum+entry.weight,0)
  if(total<=0)return items[Math.floor(Math.random()*items.length)]
  let roll=Math.random()*total
  for(const entry of weighted){
    roll-=entry.weight
    if(roll<=0)return entry.item
  }
  return weighted[weighted.length-1].item
}

function getDiaryTierWeight(tier,distance){
  const weightsByDistance=distance<=4
    ? {Easy:75,Medium:20,Hard:4,Elite:1}
    : distance<=8
      ? {Easy:60,Medium:27,Hard:10,Elite:3}
      : distance<=12
        ? {Easy:40,Medium:30,Hard:22,Elite:8}
        : {Easy:25,Medium:30,Hard:30,Elite:15}
  return weightsByDistance[tier]??0
}

function createTileReward(creature,skillProgress,distance=Infinity){
  // Achievement diaries should be uncommon near the centre so early
  // progression is driven more by skills and quests.
  const diaryChance=distance<=4?0.03:distance<=8?0.07:distance<=12?0.15:0.25
  const type=Math.random()<diaryChance?'Diary':Math.random()<0.5?'Quest':'Skill'

  if(type==='Skill'){
    return getRandomSkillReward(creature,skillProgress)
  }

  if(type==='Quest'){
    const rewards=rewardCatalog.mandatory.filter(
      r=>String(r.type).toLowerCase()==='quest'
    )
    const validRewards=rewards.filter(reward=>{
      if(!canAssignQuestReward(creature,reward))return false

      // A quest required to access a creature is also a progression deadlock,
      // so never place it on that creature even if it was not duplicated in
      // Hard No Reward Quest(s).
      const requiredQuests=new Set(
        (creature?.requiredQuests??[]).map(q=>String(q).trim().toLowerCase())
      )
      const rewardQuest=String(reward.label??reward.name??'').trim().toLowerCase()
      return !requiredQuests.has(rewardQuest)
    })

    // Never fall back to a blocked quest. If every quest is blocked, use a
    // different reward type instead.
    if(validRewards.length){
      return validRewards[Math.floor(Math.random()*validRewards.length)]
    }

    const skillReward=getRandomSkillReward(creature,skillProgress)
    if(skillReward)return skillReward

    const diaryRewards=rewardCatalog.mandatory.filter(
      r=>String(r.type).toLowerCase()==='diary'
    )
    return weightedRandomPick(diaryRewards,reward=>getDiaryTierWeight(reward.tier,distance))
  }

  const diaryRewards=rewardCatalog.mandatory.filter(
    r=>String(r.type).toLowerCase()==='diary'
  )
  return weightedRandomPick(diaryRewards,reward=>getDiaryTierWeight(reward.tier,distance))
}

function getTileReward(tile,creature,skillProgress){
  if(tile?.reward)return tile.reward
  return createTileReward(creature,skillProgress)
}
function getRewardPresentation(reward){
  const metadata=reward?.metadata??reward?.reward_metadata??{}
  const type=String(reward?.type??'quest').toLowerCase()
  if(type==='skill'){
    const skill=reward?.skill??reward?.skillName??metadata.skill??reward?.name??'Skill'
    return {
      type:'skill',
      title:skill,
      subtitle:reward?.band??reward?.levelBracket??reward?.level_bracket??metadata.band??metadata.levelBracket??'Unlock',
      asset:'reward_skill.png',
      iconName:skill,
    }
  }
  if(type==='diary'){
    return {
      type:'diary',
      title:reward?.tier??metadata.tier??'Diary',
      subtitle:reward?.region??reward?.location??metadata.region??metadata.location??'Location pending',
      asset:'reward_diary.png',
    }
  }
  return {
    type:'quest',
    title:reward?.name??reward?.label??metadata.name??metadata.label??'Quest reward pending',
    subtitle:'',
    asset:'reward_quest.png',
  }
}
function TilePopup({selectedTile,onShowMore,onComplete,creatureById,position,skillProgress}){
  const [isDismissing,setIsDismissing]=useState(false)
  const creature=selectedTile?.creatureId?creatureById[selectedTile.creatureId]:null
  if(!selectedTile||!creature)return null
  const reward=getTileReward(selectedTile,creature,skillProgress)
  const presentation=getRewardPresentation(reward)
  const rewardAsset=`${import.meta.env.BASE_URL}assets/ui/${presentation.asset}`
  return <section
    className={`tile-popup tile-popup-${presentation.type} ${isDismissing?'is-dismissing':''}`}
    style={position?{left:position.left,top:position.top}:undefined}
    aria-label="Reward details"
  >
    <img className="tile-popup-frame" src={rewardAsset} alt="" aria-hidden="true" draggable="false"/>
    <div className="tile-popup-content">
      <ProgressionIcon type={presentation.type} skill={presentation.iconName} className={`tile-popup-progression-icon tile-popup-${presentation.type}-icon`}/>

      <div className="tile-popup-reward-copy">
        <strong className="tile-popup-title">{presentation.title}</strong>
        {presentation.subtitle&&<span className="tile-popup-subtitle">{presentation.subtitle}</span>}
      </div>
      <div className="tile-popup-actions">
        {!selectedTile.completed&&<button className="tile-popup-complete" onClick={()=>{if(isDismissing)return;setIsDismissing(true);onComplete(selectedTile);window.setTimeout(()=>onShowMore?.(false),180)}}>COMPLETE</button>}
        <button className="tile-popup-more" onClick={onShowMore}>More details <ChevronRight size={13}/></button>
      </div>
    </div>
  </section>
}
function SidePanel({open,setOpen,selectedTile,onClear,onComplete,creatureById,skillProgress}){
  const creature=selectedTile?.creatureId?creatureById[selectedTile.creatureId]:null
  const reward=selectedTile&&creature?getTileReward(selectedTile,creature,skillProgress):null
  if(!open)return null
  return <aside className="side-panel side-panel-open">
    <div className="side-panel-header"><div><div className="eyebrow"><Compass size={13}/> EXPEDITION LOG</div><strong>Animal details</strong></div><button className="icon-button" onClick={()=>setOpen(false)}><ChevronRight size={17}/></button></div>
    {!creature?<div className="side-empty"><div className="empty-orb"><PawPrint size={24}/></div><h2>Select a tile</h2><p>Click a revealed or completed animal to inspect it.</p></div>:<div className="side-detail">
      <button className="back-link" onClick={onClear}><ChevronLeft size={14}/> Back to expedition</button>
      <div className={`detail-banner ${selectedTile.completed?'complete':'frontier'}`}><span>{selectedTile.completed?'COMPLETED TILE':'REVEALED TILE'}</span>{selectedTile.completed?<ShieldCheck size={15}/>:<Eye size={15}/>}</div>
      <div className="detail-creature"><CreatureGlyph creature={creature} size="hero"/><div><h2>{creature.name}</h2><span>Creature ID {creature.id}</span></div></div>
      <p className="detail-description">{creature.description}</p>
      <div className="detail-stats"><div><span>Accessibility</span><strong>Score {creature.score}</strong></div><div><span>Status</span><strong>{selectedTile.completed?'Complete':'Not complete'}</strong></div></div>
      <div className="reward-box"><div className="reward-heading"><Sparkles size={15}/> Reward</div><strong>{reward.type}</strong><p>{reward.label??reward.name}</p></div>
      {selectedTile.bossId&&<button className="boss-button side-boss-button" type="button"><Skull size={15}/> Boss</button>}
      {!selectedTile.completed&&<button className="complete-button" onClick={()=>onComplete(selectedTile)}>Mark complete</button>}
    </div>}
  </aside>
}
function MapView({creatures,onProgressChange,skillProgress,onSkillRewardComplete,initialTiles,onTilesChange}){
  const creatureById=useMemo(()=>Object.fromEntries(creatures.map(c=>[c.id,c])),[creatures])
  const [panelOpen,setPanelOpen]=useState(false),[selectedTile,setSelectedTile]=useState(null),[dismissingTileKey,setDismissingTileKey]=useState(null),[startCreature]=useState(()=>creatureById[initialTiles?.[keyFor(0,0)]?.creatureId]??pickStartingCreature(creatures))
  const [tiles,setTiles]=useState(()=>initialTiles&&Object.keys(initialTiles).length?initialTiles:createInitialTiles(creatures,startCreature,skillProgress)),[fogVisible,setFogVisible]=useState(true),[pan,setPan]=useState({x:0,y:0}),[zoom,setZoom]=useState(1),[dragging,setDragging]=useState(false), [mapHelpOpen,setMapHelpOpen]=useState(false)
  const stageRef=useRef(null),zoomRef=useRef(zoom),pointerRef=useRef({x:0,y:0,inside:false}),dragRef=useRef({active:false,x:0,y:0,pointerType:null}),touchPointersRef=useRef(new Map()),pinchRef=useRef(null),suppressClickRef=useRef(false),edgeFrameRef=useRef(null)
  useEffect(()=>{zoomRef.current=zoom},[zoom])
  useEffect(()=>{onTilesChange?.(tiles)},[tiles,onTilesChange])


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
  const handlePointerMove=e=>{
    pointerRef.current={x:e.clientX,y:e.clientY,inside:true}
    if(e.pointerType==='touch'){
      const pointers=touchPointersRef.current
      if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY})
      if(pointers.size>=2){
        const entries=[...pointers.values()]
        const a=entries[0],b=entries[1]
        const distance=Math.hypot(b.x-a.x,b.y-a.y)
        const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2}
        const pinch=pinchRef.current
        if(pinch){
          const nextZoom=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,pinch.zoom*(distance/pinch.distance)))
          const rect=stageRef.current?.getBoundingClientRect()
          if(rect){
            const currentMidpoint={x:rect.left+rect.width/2,y:rect.top+rect.height/2}
            const dx=midpoint.x-pinch.midpoint.x
            const dy=midpoint.y-pinch.midpoint.y
            zoomAtPoint(nextZoom,midpoint.x,midpoint.y)
            setPan(p=>({x:p.x+dx,y:p.y+dy}))
          }
          dragRef.current.active=false
          setDragging(false)
        } else {
          pinchRef.current={distance,midpoint,zoom:zoomRef.current}
        }
        return
      }
    }
    if(!dragRef.current.active)return
    const dx=e.clientX-dragRef.current.x,dy=e.clientY-dragRef.current.y
    if(Math.abs(dx)+Math.abs(dy)>3)suppressClickRef.current=true
    dragRef.current.x=e.clientX
    dragRef.current.y=e.clientY
    updatePan(dx,dy)
  }
  const handlePointerDown=e=>{
    if(e.pointerType==='touch'){
      e.preventDefault()
      touchPointersRef.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
      if(touchPointersRef.current.size>=2){
        const entries=[...touchPointersRef.current.values()]
        const a=entries[0],b=entries[1]
        pinchRef.current={
          distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),
          midpoint:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},
          zoom:zoomRef.current
        }
        dragRef.current.active=false
        setDragging(false)
      } else {
        dragRef.current={active:true,x:e.clientX,y:e.clientY,pointerType:'touch'}
        suppressClickRef.current=false
        setDragging(true)
      }
      stageRef.current?.setPointerCapture(e.pointerId)
      return
    }
    if(e.pointerType==='mouse'&&e.button!==1)return
    e.preventDefault()
    dragRef.current={active:true,x:e.clientX,y:e.clientY,pointerType:e.pointerType}
    suppressClickRef.current=false
    setDragging(true)
    stageRef.current?.setPointerCapture(e.pointerId)
  }
  const stopDrag=e=>{
    if(e.pointerType==='touch'){
      touchPointersRef.current.delete(e.pointerId)
      if(touchPointersRef.current.size<2)pinchRef.current=null
    }
    if(!dragRef.current.active)return
    dragRef.current.active=false
    setDragging(false)
    try{stageRef.current?.releasePointerCapture(e.pointerId)}catch{}
  }
  const handlePointerLeave=()=>{if(!dragRef.current.active)pointerRef.current.inside=false}
  const handleStageClickCapture=e=>{
    if(suppressClickRef.current){
      e.preventDefault()
      e.stopPropagation()
      suppressClickRef.current=false
    }
  }
  const centreTileX=Math.round(-pan.x/(TILE_STEP*zoom)),centreTileY=Math.round(-pan.y/(TILE_STEP*zoom))
  const knownTiles=Object.values(tiles)
  const nearestKnownDistance=(x,y)=>knownTiles.reduce((best,t)=>Math.min(best,Math.abs(x-t.x)+Math.abs(y-t.y)),Infinity)
  const mapCells=useMemo(()=>{
    const startX=centreTileX-RENDER_RADIUS,startY=centreTileY-RENDER_RADIUS,cells=[]
    for(let y=startY;y<=centreTileY+RENDER_RADIUS;y+=1)for(let x=startX;x<=centreTileX+RENDER_RADIUS;x+=1){
      const known=tiles[keyFor(x,y)]
      if(known) cells.push({...known,gridColumn:x-startX+1,gridRow:y-startY+1})
      else if(fogVisible) {
        const distance=nearestKnownDistance(x,y)
        const fogState =
          distance === 1 ? 'locked' :
          distance === 2 ? 'dark-fog-1' :
          distance === 3 ? 'dark-fog-2' :
          distance === 4 ? 'dark-fog-3' :
          distance <= 6 ? 'black-fog' :
          'void'
        cells.push({x,y,state:fogState,completed:false,fogDistance:distance,gridColumn:x-startX+1,gridRow:y-startY+1})
      }
    }
    const gridSize=RENDER_DIAMETER*TILE_SIZE+(RENDER_DIAMETER-1)*TILE_GAP
    return{cells,gridSize,offsetX:pan.x+centreTileX*TILE_STEP*zoom,offsetY:pan.y+centreTileY*TILE_STEP*zoom}
  },[centreTileX,centreTileY,pan.x,pan.y,tiles,zoom,fogVisible])
  const exploredCount=knownTiles.filter(t=>t.state==='explored').length,frontierCount=knownTiles.filter(t=>t.state==='frontier').length,creatureCount=creatures.length
  useEffect(()=>{onProgressChange?.({explored:exploredCount,revealed:frontierCount})},[exploredCount,frontierCount,onProgressChange])
  const openTile=tile=>{
    if(!tile?.creatureId)return
    setSelectedTile(tile)
    setPanelOpen(false)
  }
  const handleReveal=tile=>{
    if(!tile?.faceDown)return
    const revealed={...tile,faceDown:false}
    setTiles(current=>({...current,[keyFor(tile.x,tile.y)]:revealed}))
    setFogVisible(true)
    openTile(revealed)
  }
  const handleComplete=tile=>{
    if(!tile||tile.state!=='frontier'||tile.completed||tile.faceDown)return
    const reward=getTileReward(tile,creatureById[tile.creatureId],skillProgress)
    const completed={...tile,state:'explored',completed:true,faceDown:false,reward}
    if(String(reward?.type).toLowerCase()==='skill')onSkillRewardComplete?.(reward)
    setTiles(current=>recomputeFrontier({...current,[keyFor(tile.x,tile.y)]:completed},creatures,skillProgress))
    setSelectedTile(completed)
    setDismissingTileKey(keyFor(completed.x,completed.y))
    setPanelOpen(false)
    window.setTimeout(()=>setDismissingTileKey(null),180)
    onProgressChange?.({explored:1, revealed:frontierCount})
  }
  return <div className={`map-layout ${panelOpen?'':'panel-collapsed-layout'}`}><section className="map-panel">
    <div className={`map-stage ${dragging?'is-dragging':''}`} ref={stageRef} onPointerMove={handlePointerMove} onPointerDown={handlePointerDown} onPointerUp={stopDrag} onPointerCancel={stopDrag} onPointerLeave={handlePointerLeave} onWheel={handleWheel} onClickCapture={handleStageClickCapture} onContextMenu={e=>e.preventDefault()} tabIndex={0} aria-label="Zoologist map">
  <div className="map-grid-pan" style={{width:mapCells.gridSize,height:mapCells.gridSize,transform:`translate3d(-50%,-50%,0) translate3d(${mapCells.offsetX}px,${mapCells.offsetY}px,0)`}}><div className="map-grid" style={{width:mapCells.gridSize,height:mapCells.gridSize,gridTemplateColumns:`repeat(${RENDER_DIAMETER},${TILE_SIZE}px)`,gridTemplateRows:`repeat(${RENDER_DIAMETER},${TILE_SIZE}px)` ,transform:`scale(${zoom})`}}>{mapCells.cells.map(tile=><MapTile key={`${tile.x}:${tile.y}`} tile={tile} selected={selectedTile&&selectedTile.x===tile.x&&selectedTile.y===tile.y&&dismissingTileKey!==keyFor(tile.x,tile.y)} onSelect={openTile} onReveal={handleReveal} creatureById={creatureById} skillProgress={skillProgress}/>)}{selectedTile&&<TilePopup selectedTile={selectedTile} onShowMore={(open=true)=>open?setPanelOpen(true):setSelectedTile(null)} onComplete={handleComplete} creatureById={creatureById} skillProgress={skillProgress} position={{left:(selectedTile.x-(centreTileX-RENDER_RADIUS))*TILE_STEP+TILE_SIZE-64,top:(selectedTile.y-(centreTileY-RENDER_RADIUS))*TILE_STEP-25}}/>}</div></div>
      <div className="map-zoom-controls" onPointerDown={e=>e.stopPropagation()}><button onClick={()=>zoomAtPoint(zoom-ZOOM_STEP,innerWidth/2,innerHeight/2)}>−</button><button className="zoom-readout" onClick={()=>{setPan({x:0,y:0});setZoom(1)}}>{Math.round(zoom*100)}%</button><button onClick={()=>zoomAtPoint(zoom+ZOOM_STEP,innerWidth/2,innerHeight/2)}>+</button></div>
      <div className={`map-help ${mapHelpOpen?'is-open':''}`}><button type="button" className="map-help-toggle" onClick={e=>{e.stopPropagation();setMapHelpOpen(open=>!open)}} aria-label={mapHelpOpen?'Hide map controls':'Show map controls'} aria-expanded={mapHelpOpen} title="Map controls"><img src="https://oldschool.runescape.wiki/images/Lumbridge_Guide_icon.png" alt="" draggable="false"/></button><div className="map-help-panel"><div><MousePointer2 size={13}/> Move to edge to pan</div><div>↑ ↓ ← → <span>Arrow keys</span></div><div>MMB <span>Drag to pan</span></div><div>Wheel <span>Zoom</span></div></div></div>
      <div className="map-key"><div><span className="key-dot key-complete"/> Completed</div><div><span className="key-dot key-frontier"/> Revealed</div><div><span className="key-dot key-fog"/> Clouded</div></div><div className="map-position">WORLD {centreTileX}, {centreTileY}</div>
    </div>
  </section>
  <SidePanel open={panelOpen} setOpen={setPanelOpen} selectedTile={selectedTile} onClear={()=>setSelectedTile(null)} onComplete={handleComplete} creatureById={creatureById} skillProgress={skillProgress}/>
</div>
}
function App(){
  const [tab,setTab]=useState('map')
  const [skillsOpen,setSkillsOpen]=useState(false)
  const skillsButtonRef=useRef(null)
  const [accountOpen,setAccountOpen]=useState(false)
  const [session,setSession]=useState(null)
  const [accountReady,setAccountReady]=useState(false)
  const [cloudSaveStatus,setCloudSaveStatus]=useState('disconnected')
  const [gameState,setGameState]=useState(()=>readLocalGameState())
  const [creatures]=useState(()=>{try{return loadCreatureCatalog()}catch{return[]}})
  const [progress,setProgress]=useState({explored:0,revealed:1})
  const [skillProgress,setSkillProgress]=useState(()=>normalizeSkillProgress(gameState.skillProgress||{}))
  const [questStatuses,setQuestStatuses]=useState(gameState.questStatuses||{})

  useEffect(()=>{
    if(!supabase){setAccountReady(true);return}
    let active=true
    supabase.auth.getSession().then(({data})=>{
      if(active)setSession(data.session||null)
    })
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{
      if(active)setSession(nextSession||null)
    })
    return()=>{active=false;subscription.unsubscribe()}
  },[])

  useEffect(()=>{
    let active=true
    const load=async()=>{
      if(!session){
        if(active){
          setAccountReady(true)
          setCloudSaveStatus('disconnected')
        }
        return
      }

      setAccountReady(false)
      setCloudSaveStatus('loading')

      try{
        await ensureProfile(session.user)
        const cloud=await loadCloudGameState(session.user.id)

        // Cloud state is authoritative once an account has one. Only migrate
        // the legacy local save into the first account that claims it.
        let next=cloud&&typeof cloud==='object' ? cloud : null
        if(!next){
          const localOwner=localStorage.getItem('zoologist-local-save-owner')
          const local=readLocalGameState()
          const hasLocalProgress=Boolean(local.mapTiles||local.skillProgress||Object.keys(local.questStatuses||{}).length)
          if(!localOwner && hasLocalProgress){
            next=local
            localStorage.setItem('zoologist-local-save-owner',session.user.id)
          } else if(localOwner===session.user.id){
            next=local
          } else {
            next={...EMPTY_GAME_STATE}
          }
        }

        if(active){
          setGameState(next)
          setSkillProgress(normalizeSkillProgress(next.skillProgress||{}))
          setQuestStatuses(next.questStatuses||{})
          setAccountReady(true)
          setCloudSaveStatus('connected')
        }
      }catch(error){
        console.error('Could not load Zoologist cloud save:',error)
        if(active){
          setAccountReady(true)
          setCloudSaveStatus('error')
        }
      }
    }
    load()
    return()=>{active=false}
  },[session?.user?.id])

  useEffect(()=>localStorage.setItem('zoologist-skill-progress',JSON.stringify(skillProgress)),[skillProgress])
  useEffect(()=>{
    if(gameState.mapTiles) localStorage.setItem('zoologist-map-tiles',JSON.stringify(gameState.mapTiles))
  },[gameState.mapTiles])

  const updateGameState=patch=>setGameState(current=>({...current,...patch}))

  useEffect(()=>{
    if(!session||!accountReady)return
    const payload={...gameState,skillProgress,questStatuses}
    const timer=window.setTimeout(async()=>{
      setCloudSaveStatus('saving')
      try{
        await saveCloudGameState(session.user.id,payload)
        localStorage.setItem('zoologist-local-save-owner',session.user.id)
        setCloudSaveStatus('connected')
      }catch(error){
        console.error('Could not save Zoologist cloud save:',error)
        setCloudSaveStatus('error')
      }
    },500)
    return()=>window.clearTimeout(timer)
  },[session?.user?.id,accountReady,gameState,skillProgress,questStatuses])

  const handleSkillRewardComplete=reward=>setSkillProgress(current=>{
    const skill=reward?.skill
    if(!skill)return current
    const sequence=getSkillRewardSequence(skill)
    const index=sequence.findIndex(item=>item.id===reward.id)
    if(index<0)return current
    const band=sequence[index]?.band
    const maxLevel=Number(String(band).split('-').pop())||0
    return {...current,[skill]:{unlocked:true,maxLevel,nextRewardIndex:index+1}}
  })

  if(!creatures.length)return <div className="app-shell"><div className="full-tab-page"><h1>Creature data could not be loaded</h1><p>Check data/creatures.csv.</p></div></div>
  if(!accountReady)return <div className="app-shell"><div className="account-loading"><div className="account-loading-spinner"/>Loading Zoologist…</div></div>

  // Authentication is a hard gate: logged-out users never receive the map,
  // progression tabs, or another account's state.
  if(!session){
    return <div className="login-page"><AccountModal open={true} onClose={()=>{}} session={null} onAuthChange={setSession} standalone/></div>
  }

  const creatureCount=creatures.length
  const OSRS_TAB_ICONS = {
    map: 'https://oldschool.runescape.wiki/images/World_map_icon.png',
    skills: 'https://oldschool.runescape.wiki/images/Skills_icon.png',
    quests: 'https://oldschool.runescape.wiki/images/Quests.png',
    diaries: 'https://oldschool.runescape.wiki/images/Achievement_Diaries.png',
    shop: 'https://oldschool.runescape.wiki/images/Inventory.png',
  }
  const tabs=[
    {id:'map',label:'Map',icon:LayoutGrid},{id:'skills',label:'Skills',icon:Gem},{id:'quests',label:'Quests',icon:ScrollText},
    {id:'diaries',label:'Diaries',icon:BookOpen},{id:'shop',label:'Shop',icon:ShoppingBag},{id:'bosses',label:'Bosses',icon:Skull}
  ]
  const page=tab==='quests'
    ?<QuestsView initialStatuses={questStatuses} onStatusesChange={statuses=>{setQuestStatuses(statuses);updateGameState({questStatuses:statuses})}}/>
    :tab==='diaries'?<DiariesView/>
    :tab==='shop'?<ShopView/>
    :tab==='bosses'?<BossView/>
    :<MapView
      key={session?.user?.id??'local'}
      creatures={creatures}
      onProgressChange={setProgress}
      skillProgress={skillProgress}
      onSkillRewardComplete={handleSkillRewardComplete}
      initialTiles={gameState.mapTiles}
      onTilesChange={mapTiles=>updateGameState({mapTiles})}
    />
  const handleTabClick=id=>{
    if(id==='skills'){
      setTab('map')
      setSkillsOpen(current=>!current)
      return
    }
    setSkillsOpen(false)
    setTab(id)
  }
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-block"><div className="brand-mark"><PawPrint size={21}/></div><div><div className="brand-name">Zoologist</div><div className="brand-subtitle">OSRS creature exploration</div></div></div>
      <nav className="top-tabs">{tabs.map(({id,label,icon:Icon})=><button type="button" key={id} ref={id==='skills'?skillsButtonRef:undefined} className={`top-tab-${id} ${id==='skills'&&skillsOpen||tab===id?'active':''}`} onClick={()=>handleTabClick(id)} aria-expanded={id==='skills'?skillsOpen:undefined}>{OSRS_TAB_ICONS[id]?<img className="osrs-top-tab-icon" src={OSRS_TAB_ICONS[id]} alt="" aria-hidden="true" draggable="false"/>:<Icon size={16}/>}<span>{label}</span></button>)}</nav>
      <div className="header-actions">
        <div className="header-progress"><div className="progress-label"><span>EXPLORED <b>{progress.explored}</b> · REVEALED <b>{progress.revealed}</b></span><strong>{progress.explored} / {creatureCount}</strong></div><div className="progress-track"><div className="progress-fill" style={{width:`${Math.min(100,progress.explored/creatureCount*100)}%`}}/></div></div>
        <button className={`account-button ${session?'account-button-signed-in':''}`} onClick={()=>setAccountOpen(true)} aria-label="Account" title="Account"><img className="account-button-icon" src="https://oldschool.runescape.wiki/images/Account_Management_-_Name_Changer_icon.png" alt="" aria-hidden="true" draggable="false"/>{session&&<i className="account-status-dot" aria-label="Cloud save connected"/>}</button>
      </div>
    </header>
    <main className="app-main"><SkillsDropdown open={skillsOpen&&tab==='map'} onClose={()=>setSkillsOpen(false)} skillProgress={skillProgress} anchorRef={skillsButtonRef}/>{page}</main>
    <footer className="footer"><span>ZOOLOGIST • {cloudSaveStatus==='saving'?'SAVING…':cloudSaveStatus==='error'?'CLOUD SAVE ERROR':cloudSaveStatus==='connected'?'CLOUD SAVE CONNECTED':'CONNECTING…'}</span><span>{creatureCount} Active creatures • Graduated cloud fog • Progression framework</span></footer>
    <AccountModal open={accountOpen} onClose={()=>setAccountOpen(false)} session={session} onAuthChange={setSession}/>
  </div>
}
createRoot(document.getElementById('root')).render(<App />)
