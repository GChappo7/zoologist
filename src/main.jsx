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
import { buildRewardAssignments, getAssignedReward, hasValidRewardAssignments } from './rewardAssignments'
import AccountModal from './lib/accountModal'
import { supabase } from './lib/supabase'
import { EMPTY_GAME_STATE, createWorldId, deleteCloudGameState, ensureProfile, loadCloudGameState, readLocalGameState, saveCloudGameState } from './lib/gameState'

const TILE_SIZE = 256
const TILE_GAP = 0
const TILE_STEP = TILE_SIZE + TILE_GAP
const RENDER_RADIUS = 20
const RENDER_DIAMETER = RENDER_RADIUS * 2 + 1
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.25
const ZOOM_STEP = 0.12
const CARDINAL_DIRECTIONS = [[0,-1],[1,0],[0,1],[-1,0]]
const QUEST_FILTERS = ['all','revealed','completed']
const DEPLOYMENT_SHA = String(import.meta.env.VITE_DEPLOYMENT_SHA || 'local')
const DEPLOYMENT_RUN = String(import.meta.env.VITE_DEPLOYMENT_RUN || '')
const DEPLOYMENT_LABEL = DEPLOYMENT_SHA === 'local' ? 'LOCAL BUILD' : `DEPLOY #${DEPLOYMENT_RUN || '?'} • ${DEPLOYMENT_SHA.slice(0,7)}`

function withTimeout(promise,ms=10000){
  return Promise.race([
    promise,
    new Promise((_,reject)=>window.setTimeout(()=>reject(new Error('Cloud account load timed out.')),ms)),
  ])
}

const PROGRESSION_ASSETS = {
  quest: 'https://oldschool.runescape.wiki/images/Quests.png',
  diary: 'https://oldschool.runescape.wiki/images/Achievement_Diaries.png',
  diaryRegions: {
    'Ardougne': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Ardougne%20icon.png',
    'Desert': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Desert%20icon.png',
    'Falador': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Falador%20icon.png',
    'Fremennik': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Fremennik%20icon.png',
    'Kandarin': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Kandarin%20icon.png',
    'Karamja': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Karamja%20icon.png',
    'Kourend & Kebos': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Kourend%20%26%20Kebos%20icon.png',
    'Lumbridge & Draynor': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Lumbridge%20%26%20Draynor%20icon.png',
    'Morytania': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Morytania%20icon.png',
    'Varrock': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Varrock%20icon.png',
    'Western Provinces': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Western%20Provinces%20icon.png',
    'Wilderness': 'https://oldschool.runescape.wiki/w/Special:Redirect/file/Wilderness%20icon.png',
  },
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

function ProgressionIcon({type,skill,region,background=false,className=''}) {
  const src=type==='skill' ? skillIconUrl(skill) : type==='diaryRegion' ? PROGRESSION_ASSETS.diaryRegions[region] : PROGRESSION_ASSETS[type]
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
function createInitialTiles(creatures,startCreature,skillProgress,rewardAssignments){
  const reward=getAssignedReward(rewardAssignments,startCreature)
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
function getCompletedTileCount(tiles){
  return Object.values(tiles??{}).filter(tile=>tile?.completed===true).length
}

function getEarlyRewardCandidate(creatures,used,rewardAssignments,completedCount){
  const targetIds = []
  if(completedCount < 10) targetIds.push('fishing-1-10')
  if(completedCount < 20) targetIds.push('quest-novice-5')
  if(completedCount < 40) targetIds.push('quest-novice-29')

  for(const targetId of targetIds){
    const candidates=creatures.filter(creature=>{
      if(used.has(creature.id))return false
      const reward=getAssignedReward(rewardAssignments,creature)
      return String(reward?.id??'')===targetId && Number(creature.score)<=2
    })
    if(candidates.length){
      return candidates.sort((a,b)=>Number(a.score)-Number(b.score))[0]
    }
  }
  return null
}

function recomputeFrontier(tiles,creatures,skillProgress,rewardAssignments){
  const next={...tiles},used=new Set(Object.values(next).map(t=>t.creatureId).filter(Boolean))
  const usedQuestRewards=getUsedQuestRewardKeys(tiles)
  const completedCount=getCompletedTileCount(tiles)
  let earlyRewardCandidate=getEarlyRewardCandidate(creatures,used,rewardAssignments,completedCount)

  getAdjacentPositions(tiles).forEach(({x,y})=>{
    const creature=earlyRewardCandidate ?? pickUnusedCreature(creatures,used,preferredScoreForDistance(x,y))
    if(creature){
      used.add(creature.id)
      const distance=Math.abs(x)+Math.abs(y)
      const reward=createTileReward(creature,skillProgress,distance,usedQuestRewards,rewardAssignments)
      if(String(reward?.type??'').toLowerCase()==='quest'){
        const questKey=String(reward.label??reward.name??'').trim().toLowerCase()
        if(questKey)usedQuestRewards.add(questKey)
      }
      next[keyFor(x,y)]={x,y,state:'frontier',creatureId:creature.id,completed:false,faceDown:false,revealAnimation:true,...(reward?{reward}:{})}
      earlyRewardCandidate=null
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
function MapTile({tile,selected,onSelect,onReveal,creatureById,skillProgress,rewardAssignments}){
  const creature=tile.creatureId?creatureById[tile.creatureId]:null
  const isFaceDown=Boolean(tile.faceDown)
    const handleClick=()=>{
    if(isFaceDown&&creature){onReveal?.(tile);return}
    if(creature)onSelect(tile)
  }
  return <button type="button" style={{...(tile.fogDistance?{'--fog-distance':tile.fogDistance}:{}),...(tile.gridColumn?{gridColumn:tile.gridColumn,gridRow:tile.gridRow}:{})}} data-tile-key={keyFor(tile.x,tile.y)} className={`map-tile map-tile-${tile.state} ${selected?'is-selected':''} ${isFaceDown?'is-face-down':''} ${tile.revealAnimation?'is-batch-reveal':''} ${tile.completed?'is-completed':''}`} onClick={handleClick} aria-label={isFaceDown?'Unexplored starting tile':creature?`${creature.name}${tile.completed?', completed':', newly revealed'}`:'Fog of war'}>
    {creature&&<>
      <span className="map-card-face map-card-back" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}assets/ui/map_tile_back.png`} alt="" draggable="false"/></span>
      <span className="map-card-face map-card-front">
        <img src={`${import.meta.env.BASE_URL}assets/ui/map_tile.png`} alt="" draggable="false"/>
        <span className="map-card-content">
          {tile.completed&&<img className="tile-completed-tick" src={`${import.meta.env.BASE_URL}assets/ui/tick_circle.png`} alt="" aria-hidden="true" draggable="false"/>}
          {(()=>{const reward=getTileReward(tile,creature,skillProgress,rewardAssignments);const presentation=getRewardPresentation(reward);return reward&&<ProgressionIcon type={presentation.type} skill={presentation.iconName} className="tile-progression-stamp"/>})()}
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
    if(unrestricted.has(name))return '99'
    const progress=skillProgress?.[name]??{unlocked:false,maxLevel:0,nextRewardIndex:0}
    if(!progress.unlocked)return 'Locked'
    const completedIndex=Math.max(0,Math.min(9,Number(progress.nextRewardIndex)-1))
    const band=getSkillRewardSequence(name)[completedIndex]?.band??'91–99'
    return Number(String(band).split('-').pop().trim())||99
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
  const questListRef=useRef(null)
  const questScrollbarRef=useRef(null)
  const [questScroll,setQuestScroll]=useState({top:0,height:54})
  const questDragRef=useRef(null)

  useEffect(()=>{
    setStatuses(initialStatuses||{})
  },[initialStatuses])

  useEffect(()=>{
    localStorage.setItem('zoologist-quest-statuses',JSON.stringify(statuses))
    onStatusesChange?.(statuses)
  },[statuses,onStatusesChange])

  const dragQuestScrollbar=(event)=>{
    const scrollbar=questScrollbarRef.current
    const list=questListRef.current
    if(!scrollbar||!list||list.scrollHeight<=list.clientHeight)return
    event.preventDefault()
    const trackHeight=Math.max(1,scrollbar.clientHeight-48)
    const maxThumbTop=Math.max(0,trackHeight-questScroll.height)
    const rect=scrollbar.getBoundingClientRect()
    const pointerTop=event.clientY-rect.top-24
    const nextTop=Math.max(0,Math.min(maxThumbTop,pointerTop-questScroll.height/2))
    const maxScroll=list.scrollHeight-list.clientHeight
    list.scrollTop=maxThumbTop ? (nextTop/maxThumbTop)*maxScroll : 0
  }

  const startQuestScrollbarDrag=(event)=>{
    if(event.button!==0)return
    const scrollbar=questScrollbarRef.current
    const list=questListRef.current
    if(!scrollbar||!list||list.scrollHeight<=list.clientHeight)return
    const rect=scrollbar.getBoundingClientRect()
    const thumbTop=questScroll.top+24
    if(event.clientY<rect.top+thumbTop || event.clientY>rect.top+thumbTop+questScroll.height){
      const trackHeight=Math.max(1,scrollbar.clientHeight-48)
      const maxThumbTop=Math.max(0,trackHeight-questScroll.height)
      const clickTop=Math.max(0,Math.min(maxThumbTop,event.clientY-rect.top-24-questScroll.height/2))
      const maxScroll=list.scrollHeight-list.clientHeight
      list.scrollTop=maxThumbTop ? (clickTop/maxThumbTop)*maxScroll : 0
      return
    }
    questDragRef.current={startY:event.clientY,startScroll:list.scrollTop}
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const moveQuestScrollbar=(event)=>{
    const drag=questDragRef.current
    const scrollbar=questScrollbarRef.current
    const list=questListRef.current
    if(!drag||!scrollbar||!list)return
    const trackHeight=Math.max(1,scrollbar.clientHeight-48)
    const maxThumbTop=Math.max(0,trackHeight-questScroll.height)
    const maxScroll=list.scrollHeight-list.clientHeight
    if(maxThumbTop<=0)return
    list.scrollTop=Math.max(0,Math.min(maxScroll,drag.startScroll+(event.clientY-drag.startY)*(maxScroll/maxThumbTop)))
  }

  const endQuestScrollbarDrag=()=>{ questDragRef.current=null }

  const counts=useMemo(()=>({
    all:quests.length,
    revealed:quests.filter(q=>(statuses[q.id]||'unrevealed')!=='unrevealed').length,
    completed:quests.filter(q=>statuses[q.id]==='completed').length,
    inProgress:0,
  }),[statuses])

  const filtered=useMemo(()=>quests.filter(q=>{
    const status=statuses[q.id]||'unrevealed'
    const matchesFilter=
      filter==='all' ||
      (filter==='revealed'&&status!=='unrevealed') ||
      (filter==='completed'&&status==='completed') ||
      (filter==='in_progress'&&status==='in_progress')
    return matchesFilter&&q.name.toLowerCase().includes(search.toLowerCase())
  }),[statuses,filter,search])

  useEffect(()=>{
    const list=questListRef.current
    const scrollbar=questScrollbarRef.current
    if(!list||!scrollbar)return
    const updateScrollBar=()=>{
      const maxScroll=Math.max(0,list.scrollHeight-list.clientHeight)
      const trackHeight=Math.max(1,scrollbar.clientHeight-48)
      const thumbHeight=maxScroll>0
        ? Math.max(28,Math.min(trackHeight,trackHeight*(list.clientHeight/list.scrollHeight)))
        : trackHeight
      const maxThumbTop=Math.max(0,trackHeight-thumbHeight)
      const top=maxScroll>0 ? (list.scrollTop/maxScroll)*maxThumbTop : 0
      setQuestScroll({top,height:thumbHeight})
    }
    updateScrollBar()
    list.addEventListener('scroll',updateScrollBar,{passive:true})
    window.addEventListener('resize',updateScrollBar)
    return ()=>{
      list.removeEventListener('scroll',updateScrollBar)
      window.removeEventListener('resize',updateScrollBar)
    }
  },[filtered.length,filter,search])

  const difficultyOrder=['Novice','Intermediate','Experienced','Master','Grandmaster']
  const grouped=difficultyOrder
    .map(difficulty=>[difficulty,filtered.filter(q=>q.difficulty===difficulty)])
    .filter(([,rows])=>rows.length)

  const cycleStatus=id=>setStatuses(s=>{
    const current=s[id]||'unrevealed'
    if(current==='unrevealed') return s
    return {...s,[id]:current==='completed'?'revealed':'completed'}
  })

  const statusLabel={
    unrevealed:'???',
    revealed:'Revealed',
    completed:'Complete'
  }

  return <div className="quest-log-page">
    <div className="quest-log-shell">
      <div className="quest-log-title">
        <ProgressionIcon type="quest"/>
        <div>
          <strong>Quest Log</strong>
          <span>{counts.completed} / {counts.all} quests complete</span>
        </div>
      </div>

      <div className="quest-log-summary">
        <span>Quests complete</span>
        <strong>{counts.completed} / {counts.all}</strong>
      </div>

      <div className="quest-log-controls">
        <div className="quest-filters">
          {[
            ['all','All',counts.all],
            ['revealed','Revealed',counts.revealed],
            ['completed','Completed',counts.completed],
          ].map(([id,label,count])=>
            <button type="button" key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>
              {label} <span>{count}</span>
            </button>
          )}
        </div>
        <label className="quest-search">
          <Search size={14}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quests"/>
        </label>
      </div>

      <div className="quest-log-body">
        <div className="quest-list" ref={questListRef}>
          {grouped.map(([difficulty,rows])=>
            <section key={difficulty}>
              <h3><span>{difficulty}</span><i>{rows.length}</i></h3>
              {rows.map(q=>{
                const status=statuses[q.id]||'unrevealed'
                return <button
                  type="button"
                  key={q.id}
                  className={`quest-row quest-${status}`}
                  onClick={()=>status!=='unrevealed'&&cycleStatus(q.id)}
                  aria-label={status==='unrevealed'?`${q.name}, quest not revealed`:`${q.name}, ${statusLabel[status]}`}
                >
                  <span className="quest-status-dot" aria-hidden="true"/>
                  <span className="quest-name">{status==='unrevealed'?'???':q.name}</span>
                  <span className="quest-status-label">{statusLabel[status]}</span>
                </button>
              })}
            </section>
          )}
          {!filtered.length&&<div className="quest-empty">No quests match your search.</div>}
        </div>
        <div className="quest-scroll-arrows" ref={questScrollbarRef} aria-label="Quest list scroll controls"
          onPointerMove={moveQuestScrollbar} onPointerUp={endQuestScrollbarDrag} onPointerCancel={endQuestScrollbarDrag} onPointerDown={startQuestScrollbarDrag}>
          <button type="button" className="quest-scroll-arrow quest-scroll-up" onClick={()=>questListRef.current?.scrollBy({top:-260,behavior:'smooth'})} aria-label="Scroll quest list up">
            <img src={`${import.meta.env.BASE_URL}assets/ui/down%20arrow.png`} alt="" draggable="false"/>
          </button>
          <button type="button" className="quest-scroll-arrow quest-scroll-down" onClick={()=>questListRef.current?.scrollBy({top:260,behavior:'smooth'})} aria-label="Scroll quest list down">
            <img src={`${import.meta.env.BASE_URL}assets/ui/up%20arrow.png`} alt="" draggable="false"/>
          </button>
          <div className="quest-scroll-track" aria-hidden="true">
            <div className="quest-scroll-thumb" style={{transform:`translateY(${questScroll.top}px)`,height:`${questScroll.height}px`}} />
          </div>
        </div>
      </div>
    </div>
  </div>
}
function CollectionLog({creatures,mapTiles,onBack}){
  const [filter,setFilter]=useState('all')
  const [search,setSearch]=useState('')
  const statusByCreature=useMemo(()=>{
    const statuses={}
    Object.values(mapTiles||{}).forEach(tile=>{
      if(!tile?.creatureId)return
      const id=String(tile.creatureId)
      if(tile.completed)statuses[id]='completed'
      else if(tile.faceDown===false&&statuses[id]!=='completed')statuses[id]='revealed'
    })
    return statuses
  },[mapTiles])
  const counts=useMemo(()=>{
    const complete=creatures.filter(c=>statusByCreature[String(c.id)]==='completed').length
    const recorded=creatures.filter(c=>statusByCreature[String(c.id)]==='completed'||statusByCreature[String(c.id)]==='revealed').length
    return {all:creatures.length,recorded,complete,unknown:creatures.length-recorded}
  },[creatures,statusByCreature])
  const filtered=creatures.filter(creature=>{
    const status=statusByCreature[String(creature.id)]||'unknown'
    const matchesFilter=filter==='all'||(filter==='recorded'&&status!=='unknown')||(filter===status)
    const matchesSearch=creature.name.toLowerCase().includes(search.toLowerCase())
    return matchesFilter&&matchesSearch
  })
  const filters=[['all','All',counts.all],['recorded','Recorded',counts.recorded],['completed','Complete',counts.complete],['unknown','Unknown',counts.unknown]]
  return <div className="collection-log-page">
    <div className="collection-log-shell">
      <div className="collection-log-header">
        <button type="button" className="collection-back-button" onClick={onBack} aria-label="Back to map"><ChevronLeft size={18}/><span>Map</span></button>
        <div className="collection-log-title">
          <div className="collection-log-icon"><PawPrint size={22}/></div>
          <div><strong>Creature Collection</strong><span>Pokédex • {counts.recorded} / {counts.all} recorded</span></div>
        </div>
        <div className="collection-log-stat"><b>{counts.complete}</b><span>COMPLETE</span></div>
      </div>
      <div className="collection-log-progress">
        <div className="collection-log-progress-label"><span>CREATURES RECORDED</span><strong>{counts.recorded} / {counts.all}</strong></div>
        <div className="collection-log-progress-track"><div className="collection-log-progress-fill" style={{width:`${counts.all?Math.min(100,counts.recorded/counts.all*100):0}%`}}/></div>
        <div className="collection-log-legend"><span><i className="collection-swatch complete"/> Complete</span><span><i className="collection-swatch revealed"/> Revealed</span><span><i className="collection-swatch unknown"/> Unknown</span></div>
      </div>
      <div className="collection-log-controls">
        <div className="collection-filters">{filters.map(([id,label,count])=><button type="button" key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label} <span>{count}</span></button>)}</div>
        <label className="collection-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search creatures"/></label>
      </div>
      <div className="collection-grid">
        {filtered.map(creature=>{
          const status=statusByCreature[String(creature.id)]||'unknown'
          return <div className={'collection-card collection-card-'+status} key={creature.id}>
            <div className="collection-card-art">{status==='unknown'?<span className="collection-question">?</span>:<CreatureGlyph creature={creature} size="collection"/>}</div>
            <div className="collection-card-name">{status==='unknown'?'???':creature.name}</div>
            <div className="collection-card-status">{status==='completed'?'Recorded':status==='revealed'?'Revealed':'Unknown'}</div>
          </div>
        })}
      </div>
      {!filtered.length&&<div className="collection-empty">No creatures match that search.</div>}
    </div>
  </div>
}

function DiariesView({statuses={},onStatusClick}){
  const regions=['Ardougne','Desert','Falador','Fremennik','Kandarin','Karamja','Kourend & Kebos','Lumbridge & Draynor','Morytania','Varrock','Western Provinces','Wilderness']
  const tiers=['Easy','Medium','Hard','Elite']
  return <div className="full-tab-page"><div className="tab-page-heading"><div className="eyebrow"><BookOpen size={14}/> ACCOUNT PROGRESSION</div><h1>Achievement Diaries</h1><p>Each diary is one bar split into Easy, Medium, Hard and Elite reward tiers.</p></div><div className="diary-grid">{regions.map(region=><div className="diary-card" key={region}><div className="diary-card-header"><ProgressionIcon type="diaryRegion" region={region}/><strong>{region}</strong></div><div className="diary-tier-labels">{tiers.map(tier=><span key={tier}>{tier}</span>)}</div><button className="diary-progress-bar" type="button" onClick={()=>onStatusClick?.(region)} aria-label={`Mark ${region} diary progress complete`}>{tiers.map(tier=>{const key=`${region}|${tier}`;const status=statuses[key]||'locked';return <span key={tier} className={`diary-quadrant diary-quadrant-${status}`}><i>{status!=='locked'?'Completed':''}</i></span>})}</button></div>)}</div></div>
}
function ShopView(){
  return <div className="full-tab-page"><div className="tab-page-heading"><div className="eyebrow"><ShoppingBag size={14}/> ZOOLOGIST POINTS</div><h1>Shop</h1><p>Boss tasks will award Zoologist Points. Costs remain configurable until the progression rules are finalized.</p></div><div className="shop-grid">{shop.items.map(item=><div className="shop-card" key={item.id}><div className="shop-card-icon"><Sparkles size={17}/></div><strong>{item.name}</strong><p>{item.description}</p><span>Cost: TBD</span></div>)}</div></div>
}
function BossView(){
  return <div className="full-tab-page"><div className="tab-page-heading"><div className="eyebrow"><Skull size={14}/> BOSS LAYERS</div><h1>Boss Tasks</h1><p>Boss layers are ready to award Zoologist Points once boss placement and task eligibility are finalized.</p></div><div className="boss-empty"><MapPinned size={28}/><strong>Boss pool not assigned yet</strong><span>{bossSystem.tasks.length} boss tasks configured</span></div></div>
}
function resolveReservedReward(reward,skillProgress){
  if(!reward)return null
  if(String(reward.type).toLowerCase()!=='skill'||reward.band)return reward
  const next=getNextSkillBand(skillProgress,reward.skill)
  return next?{...next,type:'skill',skill:reward.skill,slot:reward.slot}:reward
}

function getSkillProgressAfterReward(currentProgress,reward){
  if(String(reward?.type).toLowerCase()!=='skill')return currentProgress
  const sequence=getSkillRewardSequence(reward.skill)
  const index=sequence.findIndex(item=>item.id===reward.id)
  if(index<0)return currentProgress
  const band=sequence[index]?.band
  const maxLevel=Number(String(band).split('-').pop())||0
  return {...currentProgress,[reward.skill]:{unlocked:true,maxLevel,nextRewardIndex:index+1}}
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

function getUsedQuestRewardKeys(tiles){
  return new Set(
    Object.values(tiles??{})
      .map(tile=>tile?.reward)
      .filter(reward=>String(reward?.type??'').toLowerCase()==='quest')
      .map(reward=>String(reward?.label??reward?.name??'').trim().toLowerCase())
      .filter(Boolean)
  )
}

function createTileReward(creature,skillProgress,distance=Infinity,usedQuestRewards=new Set(),rewardAssignments=null){
  const reservedReward=getAssignedReward(rewardAssignments,creature)
  if(reservedReward)return reservedReward
  const diaryRewards=rewardCatalog.mandatory.filter(r=>String(r.type).toLowerCase()==='diary')
  return weightedRandomPick(diaryRewards,reward=>getDiaryTierWeight(reward.tier,distance))
}

function getTileReward(tile,creature,skillProgress,rewardAssignments){
  // Once a tile has been assigned a reward, that reward is permanent.
  // This is important for revealed frontier tiles: recalculating their
  // reward on every render can make a quest appear to change or duplicate.
  if(tile?.reward)return resolveReservedReward(tile.reward,skillProgress)
  return resolveReservedReward(createTileReward(creature,skillProgress,Infinity,new Set(),rewardAssignments),skillProgress)
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
function TilePopup({selectedTile,onShowMore,onComplete,creatureById,position,skillProgress,rewardAssignments}){
  const [isDismissing,setIsDismissing]=useState(false)
  const creature=selectedTile?.creatureId?creatureById[selectedTile.creatureId]:null
  if(!selectedTile||!creature)return null
  const reward=getTileReward(selectedTile,creature,skillProgress,rewardAssignments)
  const presentation=getRewardPresentation(reward)
  const rewardAsset=`${import.meta.env.BASE_URL}assets/ui/${presentation.asset}`
  return <section
    className={`tile-popup tile-popup-${presentation.type} ${isDismissing?'is-dismissing':''}`}
    style={position?{left:position.left,top:position.top}:undefined}
    aria-label="Reward details"
  >
    <img className="tile-popup-frame" src={rewardAsset} alt="" aria-hidden="true" draggable="false"/>
    <div className="tile-popup-content">
      <ProgressionIcon type={presentation.type} skill={presentation.iconName} className={`tile-popup-progression-icon tile-popup-${presentation.type}-icon ${presentation.type === 'skill' ? `tile-popup-skill-${String(presentation.iconName || '').toLowerCase().replace(/\\s+/g, '-')}` : ''}`}/>

      <div className="tile-popup-reward-copy">
        <strong className="tile-popup-title">{presentation.title}</strong>
        {presentation.subtitle&&<span className="tile-popup-subtitle">{presentation.subtitle}</span>}
      </div>
      <div className="tile-popup-actions">
        {!selectedTile.completed&&<button className="tile-popup-complete" onClick={()=>{if(isDismissing)return;setIsDismissing(true);onComplete(selectedTile);window.setTimeout(()=>onShowMore?.(false),180)}}>COMPLETE</button>}
        <button className="tile-popup-more" onClick={onShowMore}>DETAILS <ChevronRight size={13}/></button>
      </div>
    </div>
  </section>
}
function SidePanel({open,setOpen,selectedTile,onClear,onComplete,creatureById,skillProgress,rewardAssignments}){
  const creature=selectedTile?.creatureId?creatureById[selectedTile.creatureId]:null
  const reward=selectedTile&&creature?getTileReward(selectedTile,creature,skillProgress,rewardAssignments):null
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
function MapView({creatures,onProgressChange,skillProgress,onSkillRewardComplete,onDiaryRewardComplete,initialTiles,onTilesChange,rewardAssignments,onRewardAssignmentsChange}){
  const creatureById=useMemo(()=>Object.fromEntries(creatures.map(c=>[c.id,c])),[creatures])
  const [panelOpen,setPanelOpen]=useState(false),[selectedTile,setSelectedTile]=useState(null),[dismissingTileKey,setDismissingTileKey]=useState(null),[startCreature]=useState(()=>creatureById[initialTiles?.[keyFor(0,0)]?.creatureId]??pickStartingCreature(creatures))
  const [generatedRewardAssignments]=useState(()=>rewardAssignments??buildRewardAssignments(creatures,startCreature))
  const effectiveRewardAssignments=rewardAssignments??generatedRewardAssignments
  const [tiles,setTiles]=useState(()=>initialTiles&&Object.keys(initialTiles).length?initialTiles:createInitialTiles(creatures,startCreature,skillProgress,effectiveRewardAssignments))
  const [fogVisible,setFogVisible]=useState(()=>Object.values(initialTiles??{}).some(tile=>tile?.state==='explored'))
  const [pan,setPan]=useState({x:0,y:0}),[zoom,setZoom]=useState(1),[dragging,setDragging]=useState(false), [mapHelpOpen,setMapHelpOpen]=useState(false)
  const stageRef=useRef(null),zoomRef=useRef(zoom),pointerRef=useRef({x:0,y:0,inside:false}),dragRef=useRef({active:false,x:0,y:0,pointerType:null}),touchPointersRef=useRef(new Map()),pinchRef=useRef(null),suppressClickRef=useRef(false),edgeFrameRef=useRef(null)
  useEffect(()=>{zoomRef.current=zoom},[zoom])
  useEffect(()=>{onTilesChange?.(tiles)},[tiles,onTilesChange])
  useEffect(()=>{
    if(rewardAssignments||!startCreature)return
    const assignments=generatedRewardAssignments
    onRewardAssignmentsChange?.(assignments)
  },[rewardAssignments,startCreature,creatures,generatedRewardAssignments,onRewardAssignmentsChange])


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

  const zoomAtPoint=(nextZoom,clientX,clientY)=>{
    const stage=stageRef.current;if(!stage)return
    const rect=stage.getBoundingClientRect(),ox=clientX-(rect.left+rect.width/2),oy=clientY-(rect.top+rect.height/2),current=zoomRef.current,target=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,nextZoom))
    if(Math.abs(target-current)<.001)return
    const ratio=target/current
    setPan(p=>({x:ox-(ox-p.x)*ratio,y:oy-(oy-p.y)*ratio}));setZoom(target)
  }
  const handleWheel=e=>{e.preventDefault();zoomAtPoint(zoomRef.current+(e.deltaY>0?-1:1)*.11,e.clientX,e.clientY)}
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
    const reward=getTileReward(tile,creatureById[tile.creatureId],skillProgress,effectiveRewardAssignments)
    const completed={...tile,state:'explored',completed:true,faceDown:false,reward}
    const nextSkillProgress=String(reward?.type).toLowerCase()==='skill'
      ?getSkillProgressAfterReward(skillProgress,reward)
      :skillProgress
    if(String(reward?.type).toLowerCase()==='skill')onSkillRewardComplete?.(reward)
    if(String(reward?.type).toLowerCase()==='diary')onDiaryRewardComplete?.(reward)
    setTiles(current=>recomputeFrontier({...current,[keyFor(tile.x,tile.y)]:completed},creatures,nextSkillProgress,effectiveRewardAssignments))
    setSelectedTile(completed)
    setDismissingTileKey(keyFor(completed.x,completed.y))
    setPanelOpen(false)
    window.setTimeout(()=>setDismissingTileKey(null),180)
    onProgressChange?.({explored:1, revealed:frontierCount})
  }
  return <div className={`map-layout ${panelOpen?'':'panel-collapsed-layout'}`}><section className="map-panel">
    <div className={`map-stage ${dragging?'is-dragging':''}`} ref={stageRef} onPointerMove={handlePointerMove} onPointerDown={handlePointerDown} onPointerUp={stopDrag} onPointerCancel={stopDrag} onPointerLeave={handlePointerLeave} onWheel={handleWheel} onClickCapture={handleStageClickCapture} onContextMenu={e=>e.preventDefault()} tabIndex={0} aria-label="Zoologist map">
  <div className="map-grid-pan" style={{width:mapCells.gridSize,height:mapCells.gridSize,transform:`translate3d(-50%,-50%,0) translate3d(${mapCells.offsetX}px,${mapCells.offsetY}px,0)`}}><div className="map-grid" style={{width:mapCells.gridSize,height:mapCells.gridSize,gridTemplateColumns:`repeat(${RENDER_DIAMETER},${TILE_SIZE}px)`,gridTemplateRows:`repeat(${RENDER_DIAMETER},${TILE_SIZE}px)` ,transform:`scale(${zoom})`}}>{mapCells.cells.map(tile=><MapTile key={`${tile.x}:${tile.y}`} tile={tile} selected={selectedTile&&selectedTile.x===tile.x&&selectedTile.y===tile.y&&dismissingTileKey!==keyFor(tile.x,tile.y)} onSelect={openTile} onReveal={handleReveal} creatureById={creatureById} skillProgress={skillProgress} rewardAssignments={effectiveRewardAssignments}/>)}{selectedTile&&<TilePopup selectedTile={selectedTile} onShowMore={(open=true)=>open?setPanelOpen(true):setSelectedTile(null)} onComplete={handleComplete} creatureById={creatureById} skillProgress={skillProgress} rewardAssignments={effectiveRewardAssignments} position={{left:(selectedTile.x-(centreTileX-RENDER_RADIUS))*TILE_STEP+132,top:(selectedTile.y-(centreTileY-RENDER_RADIUS))*TILE_STEP-38}}/>}</div></div>
      <div className="map-zoom-controls" onPointerDown={e=>e.stopPropagation()}><button onClick={()=>zoomAtPoint(zoom-ZOOM_STEP,innerWidth/2,innerHeight/2)}>−</button><button className="zoom-readout" onClick={()=>{setPan({x:0,y:0});setZoom(1)}}>{Math.round(zoom*100)}%</button><button onClick={()=>zoomAtPoint(zoom+ZOOM_STEP,innerWidth/2,innerHeight/2)}>+</button></div>
      <div className={`map-help ${mapHelpOpen?'is-open':''}`}><button type="button" className="map-help-toggle" onClick={e=>{e.stopPropagation();setMapHelpOpen(open=>!open)}} aria-label={mapHelpOpen?'Hide map controls':'Show map controls'} aria-expanded={mapHelpOpen} title="Map controls"><img src="https://oldschool.runescape.wiki/images/Lumbridge_Guide_icon.png" alt="" draggable="false"/></button><div className="map-help-panel"><div><MousePointer2 size={13}/> Move to edge to pan</div><div>↑ ↓ ← → <span>Arrow keys</span></div><div>MMB <span>Drag to pan</span></div><div>Wheel <span>Zoom</span></div></div></div>
      <div className="map-key"><div><span className="key-dot key-complete"/> Completed</div><div><span className="key-dot key-frontier"/> Revealed</div><div><span className="key-dot key-fog"/> Clouded</div></div><div className="map-position">WORLD {centreTileX}, {centreTileY}</div>
    </div>
  </section>
  <SidePanel open={panelOpen} setOpen={setPanelOpen} selectedTile={selectedTile} onClear={()=>setSelectedTile(null)} onComplete={handleComplete} creatureById={creatureById} skillProgress={skillProgress} rewardAssignments={effectiveRewardAssignments}/>
</div>
}
function App(){
  const [tab,setTab]=useState('map')
  const [skillsOpen,setSkillsOpen]=useState(false)
  const skillsButtonRef=useRef(null)
  const [accountOpen,setAccountOpen]=useState(false)
  const [resetConfirmOpen,setResetConfirmOpen]=useState(false)
  const [resetInProgress,setResetInProgress]=useState(false)
  const [resetStatus,setResetStatus]=useState(null)
  const [session,setSession]=useState(null)
  const [accountReady,setAccountReady]=useState(false)
  const [cloudSaveStatus,setCloudSaveStatus]=useState('disconnected')
  const [gameState,setGameState]=useState(()=>readLocalGameState())
  const [creatures]=useState(()=>{try{return loadCreatureCatalog()}catch{return[]}})
  const [progress,setProgress]=useState({explored:0,revealed:1})
  const [skillProgress,setSkillProgress]=useState(()=>normalizeSkillProgress(gameState.skillProgress||{}))
  const [rewardAssignments,setRewardAssignments]=useState(()=>hasValidRewardAssignments(gameState.rewardAssignments)?gameState.rewardAssignments:null)
  const [questStatuses,setQuestStatuses]=useState(gameState.questStatuses||{})
  const [diaryStatuses,setDiaryStatuses]=useState(gameState.diaryStatuses||{})
  const [resetVersion,setResetVersion]=useState(0)
  const [passwordRecovery,setPasswordRecovery]=useState(false)
  const saveGenerationRef=useRef(0)
  const accountLoadGenerationRef=useRef(0)
  const queuedSaveRef=useRef(Promise.resolve())

  useEffect(()=>{
    if(!supabase){setAccountReady(true);return}
    let active=true
    supabase.auth.getSession().then(({data})=>{
      if(active)setSession(data.session||null)
    })
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,nextSession)=>{
      if(!active)return
      if(event==='PASSWORD_RECOVERY'){
        setPasswordRecovery(true)
        setSession(null)
      }else{
        setSession(nextSession||null)
      }
    })
    return()=>{active=false;subscription.unsubscribe()}
  },[])

  useEffect(()=>{
    let active=true
    const loadGeneration=++accountLoadGenerationRef.current
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
        await withTimeout(ensureProfile(session.user))

        // The cloud row is the only persistent account save. A factory reset
        // deletes that row, so a subsequent load simply starts a new world.
        const cloud=await withTimeout(loadCloudGameState(session.user.id))
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
            next={...EMPTY_GAME_STATE,worldId:createWorldId()}
          }
        }

        if(!next.worldId)next={...next,worldId:createWorldId()}
        localStorage.setItem('zoologist-world-id',next.worldId)

        if(active && loadGeneration===accountLoadGenerationRef.current){
          setGameState(next)
          setSkillProgress(normalizeSkillProgress(next.skillProgress||{}))
          setRewardAssignments(next.rewardAssignments||null)
          setQuestStatuses(next.questStatuses||{})
          setDiaryStatuses(next.diaryStatuses||{})
          setAccountReady(true)
          setCloudSaveStatus('connected')
        }

      }catch(error){
        console.error('Could not load Zoologist cloud save:',error)
        if(active && loadGeneration===accountLoadGenerationRef.current){
          setAccountReady(true)
          setCloudSaveStatus('error')
        }
      }
    }
    load()
    return()=>{active=false}
  },[session?.user?.id])

  useEffect(()=>localStorage.setItem('zoologist-skill-progress',JSON.stringify(skillProgress)),[skillProgress])
  useEffect(()=>localStorage.setItem('zoologist-diary-statuses',JSON.stringify(diaryStatuses)),[diaryStatuses])

  // Quest rewards become "Revealed" as soon as their reward tile is revealed.
  // Map tiles are the authoritative source here, so this also catches quests
  // revealed automatically when the frontier expands after completing a tile.
  useEffect(()=>{
    const revealedQuestIds=new Set(
      Object.values(gameState.mapTiles||{})
        .filter(tile=>tile?.faceDown===false)
        .map(tile=>tile?.reward)
        .filter(reward=>String(reward?.type??'').toLowerCase()==='quest')
        .map(reward=>String(reward?.questId??'').trim())
        .filter(Boolean)
    )
    if(!revealedQuestIds.size)return
    setQuestStatuses(current=>{
      let changed=false
      const next={...current}
      revealedQuestIds.forEach(id=>{
        if((next[id]||'unrevealed')==='unrevealed'){
          next[id]='revealed'
          changed=true
        }
      })
      return changed?next:current
    })
  },[gameState.mapTiles])
  useEffect(()=>{
    if(gameState.mapTiles){
      localStorage.setItem('zoologist-map-tiles',JSON.stringify(gameState.mapTiles))
    }else{
      localStorage.removeItem('zoologist-map-tiles')
    }
  },[gameState.mapTiles])

  const updateGameState=patch=>setGameState(current=>({...current,...patch}))

  useEffect(()=>{
    // A factory-reset account has no cloud row until the player actually
    // makes progress. Do not recreate a save just because the fresh map
    // generated its initial starting tile.
    const hasCompletedTile=Object.values(gameState.mapTiles||{}).some(tile=>tile?.completed===true)
    const hasUnlockedSkill=Object.values(skillProgress||{}).some(value=>Number(value?.maxLevel)>0)
    const hasQuestProgress=Object.keys(questStatuses||{}).length>0
    const hasDiaryProgress=Object.keys(diaryStatuses||{}).length>0
    if(!session||!accountReady||resetInProgress||(!hasCompletedTile&&!hasUnlockedSkill&&!hasQuestProgress&&!hasDiaryProgress))return
    const payload={...gameState,skillProgress,rewardAssignments,questStatuses,diaryStatuses}
    const generation=saveGenerationRef.current
    const timer=window.setTimeout(()=>{
      if(generation!==saveGenerationRef.current)return
      setCloudSaveStatus('saving')
      const save=async()=>{
        if(generation!==saveGenerationRef.current)return
        try{
          await saveCloudGameState(session.user.id,payload)
          if(generation!==saveGenerationRef.current){
            try{await deleteCloudGameState(session.user.id)}catch(error){console.error('Could not remove stale pre-reset save:',error)}
            return
          }
          localStorage.setItem('zoologist-local-save-owner',session.user.id)
          setCloudSaveStatus('connected')
        }catch(error){
          if(generation!==saveGenerationRef.current)return
          console.error('Could not save Zoologist cloud save:',error)
          setCloudSaveStatus('error')
        }
      }
      queuedSaveRef.current=queuedSaveRef.current.catch(()=>{}).then(save)
    },500)
    return()=>window.clearTimeout(timer)
  },[session?.user?.id,accountReady,resetInProgress,gameState,skillProgress,rewardAssignments,questStatuses,diaryStatuses])

  const handleResetProgress=async()=>{
    setResetConfirmOpen(true)
  }

  const confirmResetProgress=async()=>{
    if(resetInProgress||!session?.user?.id)return
    setResetInProgress(true)
    setResetConfirmOpen(false)
    setAccountOpen(false)
    setResetStatus({step:1,status:'active',message:'Preparing the factory reset…'})
    setCloudSaveStatus('saving')

    saveGenerationRef.current+=1
    accountLoadGenerationRef.current+=1

    try{
      setResetStatus({step:2,status:'active',message:'Waiting for any pending cloud save to finish…'})
      await queuedSaveRef.current.catch(()=>{})
      setResetStatus({step:2,status:'complete',message:'Pending saves cleared.'})

      setResetStatus({step:3,status:'active',message:'Replacing your account save with a blank world…'})
      const freshState={...EMPTY_GAME_STATE,worldId:createWorldId()}
      await saveCloudGameState(session.user.id,freshState)
      setResetStatus({step:3,status:'complete',message:'Blank world saved to the cloud.'})

      setResetStatus({step:4,status:'active',message:'Verifying the cloud save is actually blank…'})
      const remaining=await loadCloudGameState(session.user.id)
      if(remaining?.worldId!==freshState.worldId ||
         remaining?.mapTiles!=null ||
         remaining?.skillProgress!=null ||
         remaining?.rewardAssignments!=null ||
         Object.keys(remaining?.questStatuses??{}).length>0){
        throw new Error('Factory reset could not replace the account save with a blank world.')
      }
      setResetStatus({step:4,status:'complete',message:'Cloud verification passed.'})

      setResetStatus({step:5,status:'active',message:'Clearing saved progression from this device…'})
      localStorage.removeItem('zoologist-skill-progress')
      localStorage.removeItem('zoologist-map-tiles')
      localStorage.removeItem('zoologist-reward-assignments')
      localStorage.removeItem('zoologist-quest-statuses')
      localStorage.removeItem('zoologist-local-save-owner')
      localStorage.removeItem('zoologist-world-id')
      localStorage.removeItem('zoologist-reset-state')
      localStorage.removeItem('zoologist-reset-pending')
      setResetStatus({step:5,status:'complete',message:'Local progression cleared.'})

      setResetStatus({step:6,status:'active',message:'Starting your new Zoologist world…'})
      setGameState(freshState)
      setSkillProgress(normalizeSkillProgress({}))
      setRewardAssignments(null)
      setQuestStatuses({})
      setDiaryStatuses({})
      setProgress({explored:0,revealed:1})
      setResetVersion(current=>current+1)
      setCloudSaveStatus('connected')
      setResetStatus({step:6,status:'complete',message:'New world ready. Your account is still logged in.'})
    }catch(error){
      console.error('Could not factory reset Zoologist account:',error)
      setCloudSaveStatus('error')
      setResetStatus(current=>({...(current||{}),status:'error',message:`Reset failed: ${error?.message||'Unknown error'}`}))
    }finally{
      setResetInProgress(false)
    }
  }
  const handleDiaryRewardComplete=reward=>setDiaryStatuses(current=>{
    const region=String(reward?.region??reward?.location??'').trim()
    const tier=String(reward?.tier??'').trim()
    if(!region||!tier)return current
    const key=`${region}|${tier}`
    if(current[key])return current
    return {...current,[key]:'rewarded'}
  })
  const handleDiaryStatusClick=region=>setDiaryStatuses(current=>{
    const next={...current}
    ;['Easy','Medium','Hard','Elite'].forEach(tier=>{
      const key=`${region}|${tier}`
      if(next[key]==='rewarded')next[key]='completed'
    })
    return next
  })
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
    return <div className="login-page"><AccountModal open={true} onClose={()=>{}} session={null} onAuthChange={setSession} passwordRecovery={passwordRecovery} onPasswordRecoveryComplete={()=>{
      setPasswordRecovery(false)
      supabase.auth.getSession().then(({data})=>setSession(data.session||null))
    }} standalone/></div>
  }

  const creatureCount=creatures.length
  const recordedCreatureCount=new Set(Object.values(gameState.mapTiles||{}).filter(tile=>tile?.creatureId&&tile?.faceDown===false).map(tile=>String(tile.creatureId))).size
  const OSRS_TAB_ICONS = {
    map: 'https://oldschool.runescape.wiki/images/World_map_icon.png',
    skills: 'https://oldschool.runescape.wiki/images/Skills_icon.png',
    quests: 'https://oldschool.runescape.wiki/images/Quests.png',
    diaries: 'https://oldschool.runescape.wiki/images/Achievement_Diaries.png',
    shop: 'https://oldschool.runescape.wiki/images/Inventory.png',
    bosses: 'https://oldschool.runescape.wiki/images/Artio.png',
  }
  const tabs=[
    {id:'map',label:'Map',icon:LayoutGrid},{id:'skills',label:'Skills',icon:Gem},{id:'quests',label:'Quests',icon:ScrollText},
    {id:'diaries',label:'Diaries',icon:BookOpen},{id:'shop',label:'Shop',icon:ShoppingBag},{id:'bosses',label:'Bosses',icon:Skull}
  ]
  const page=tab==='collection'
    ?<CollectionLog creatures={creatures} mapTiles={gameState.mapTiles} onBack={()=>setTab('map')}/>
    :tab==='quests'
    ?<QuestsView initialStatuses={questStatuses} onStatusesChange={statuses=>{setQuestStatuses(statuses);updateGameState({questStatuses:statuses})}}/>
    :tab==='diaries'?<DiariesView statuses={diaryStatuses} onStatusClick={handleDiaryStatusClick}/>
    :tab==='shop'?<ShopView/>
    :tab==='bosses'?<BossView/>
    :<MapView
      key={`${session?.user?.id??'local'}-${gameState.worldId??'legacy'}-${resetVersion}`}
      creatures={creatures}
      onProgressChange={setProgress}
      skillProgress={skillProgress}
      onSkillRewardComplete={handleSkillRewardComplete}
      onDiaryRewardComplete={handleDiaryRewardComplete}
      initialTiles={gameState.mapTiles}
      onTilesChange={resetInProgress?undefined:mapTiles=>updateGameState({mapTiles})}
      rewardAssignments={rewardAssignments}
      onRewardAssignmentsChange={resetInProgress?undefined:assignments=>{setRewardAssignments(assignments);updateGameState({rewardAssignments:assignments})}}
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
      <div className="brand-block"><div className="brand-mark"><PawPrint size={21}/></div><div><div className="brand-name">Zoologist <span className="deployment-indicator" title={`GitHub deployment ${DEPLOYMENT_SHA}`}>{DEPLOYMENT_LABEL}</span></div><div className="brand-subtitle">OSRS creature exploration</div></div></div>
      <nav className="top-tabs">{tabs.map(({id,label,icon:Icon})=><button type="button" key={id} ref={id==='skills'?skillsButtonRef:undefined} className={`top-tab-${id} ${id==='skills'&&skillsOpen||tab===id?'active':''}`} onClick={()=>handleTabClick(id)} aria-expanded={id==='skills'?skillsOpen:undefined}>{OSRS_TAB_ICONS[id]?<img className="osrs-top-tab-icon" src={OSRS_TAB_ICONS[id]} alt="" aria-hidden="true" draggable="false"/>:<Icon size={16}/>}<span>{label}</span></button>)}</nav>
      <div className="header-actions">
        <button type="button" className={`header-collection ${tab==='collection'?'active':''}`} onClick={()=>{setSkillsOpen(false);setTab('collection')}} aria-label="Open creature collection" title="Open Creature Collection">
          <div className="header-collection-label"><span>CREATURES RECORDED</span><strong>{recordedCreatureCount} / {creatureCount}</strong></div>
          <div className="header-collection-track"><div className="header-collection-fill" style={{width:`${creatureCount?Math.min(100,recordedCreatureCount/creatureCount*100):0}%`}}/></div>
        </button>
        <button className={`account-button ${session?'account-button-signed-in':''}`} onClick={()=>setAccountOpen(true)} aria-label="Account" title="Account"><img className="account-button-icon" src="https://oldschool.runescape.wiki/images/Account_Management_-_Name_Changer_icon.png" alt="" aria-hidden="true" draggable="false"/>{session&&<i className="account-status-dot" aria-label="Cloud save connected"/>}</button>
      </div>   </header>
    <main className="app-main"><SkillsDropdown open={skillsOpen&&tab==='map'} onClose={()=>setSkillsOpen(false)} skillProgress={skillProgress} anchorRef={skillsButtonRef}/>{page}</main>
    <footer className="footer"><span>ZOOLOGIST • {cloudSaveStatus==='saving'?'SAVING…':cloudSaveStatus==='error'?'CLOUD SAVE ERROR':cloudSaveStatus==='connected'?'CLOUD SAVE CONNECTED':'CONNECTING…'}</span><span>{creatureCount} Active creatures • Graduated cloud fog • Progression framework</span></footer>
    <AccountModal open={accountOpen} onClose={()=>setAccountOpen(false)} session={session} onAuthChange={setSession} onResetProgress={handleResetProgress} passwordRecovery={passwordRecovery} onPasswordRecoveryComplete={()=>{
      setPasswordRecovery(false)
      supabase.auth.getSession().then(({data})=>setSession(data.session||null))
    }}/>
    {resetConfirmOpen&&<div className="reset-confirm-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!resetInProgress)setResetConfirmOpen(false)}}>
      <div className="reset-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
        <div className="reset-confirm-title" id="reset-confirm-title">Reset all Zoologist progress?</div>
        <div className="reset-confirm-message">This will clear your map, skills, quests and reward assignments, but your account will remain logged in.</div>
        <div className="reset-confirm-actions">
          <button type="button" className="reset-confirm-cancel" onClick={()=>setResetConfirmOpen(false)}>Cancel</button>
          <button type="button" className="reset-confirm-danger" onClick={confirmResetProgress} disabled={resetInProgress}>{resetInProgress ? "Resetting…" : "Reset Progress"}</button>
        </div>
      </div>
    </div>}
    {resetStatus&&<div className="reset-confirm-overlay" role="presentation">
      <div className="reset-status-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-status-title" aria-live="polite">
        <div className="reset-status-title" id="reset-status-title">{resetStatus.status==='error'?'Factory reset failed':resetStatus.step===6&&resetStatus.status==='complete'?'Factory reset complete':'Resetting Zoologist…'}</div>
        <div className="reset-status-message">{resetStatus.message}</div>
        <div className="reset-status-steps">
          {['Prepare reset','Clear pending saves','Replace cloud save','Verify cloud save','Clear device save','Start new world'].map((label,index)=>{
            const step=index+1
            const complete=resetStatus.status==='complete'&&step<=resetStatus.step
            const active=resetStatus.status==='active'&&step===resetStatus.step
            const failed=resetStatus.status==='error'&&step===resetStatus.step
            return <div className={`reset-status-step ${complete?'is-complete':''} ${active?'is-active':''} ${failed?'is-failed':''}`} key={label}>
              <span className="reset-status-indicator">{complete?'✓':failed?'!':active?'…':step}</span>
              <span>{label}</span>
            </div>
          })}
        </div>
        {resetStatus.status==='error'&&<div className="reset-status-error-detail">The reset stopped before it could finish. The error above shows exactly which operation failed.</div>}
        {resetStatus.status==='complete'&&<div className="reset-status-success-detail">You can now play from the beginning. Your login and account are unchanged.</div>}
        {(resetStatus.status==='complete'||resetStatus.status==='error')&&<div className="reset-status-actions"><button type="button" className="reset-confirm-danger" onClick={()=>setResetStatus(null)}>Close</button></div>}
      </div>
    </div>}
  </div>
}
createRoot(document.getElementById('root')).render(<App />)
