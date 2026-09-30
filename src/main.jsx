import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  Flag,
  Gamepad2,
  Gem,
  LayoutGrid,
  Lock,
  MousePointer2,
  PawPrint,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import './styles.css'
import creatureCsv from '../data/creatures.csv?raw'

const TILE_SIZE = 128
const TILE_GAP = 3
const TILE_STEP = TILE_SIZE + TILE_GAP
const RENDER_RADIUS = 20
const RENDER_DIAMETER = RENDER_RADIUS * 2 + 1
const EDGE_ZONE = 70
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.25
const ZOOM_STEP = 0.12

const CARDINAL_DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]

function keyFor(x, y) {
  return `${x}:${y}`
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"' && quoted && next === '"') { field += '"'; i += 1; continue }
    if (char === '"') { quoted = !quoted; continue }
    if (char === ',' && !quoted) { row.push(field); field = ''; continue }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(field)
      field = ''
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      continue
    }
    field += char
  }
  row.push(field)
  if (row.some((value) => value.trim() !== '')) rows.push(row)
  if (rows.length === 0) return []
  const headers = rows[0].map((value) => value.trim().toLowerCase())
  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, (values[index] ?? '').trim()]),
  ))
}

function firstValue(row, ...keys) {
  for (const key of keys) {
    const value = row[key.toLowerCase()]
    if (value != null && value !== '') return value
  }
  return ''
}

function slugifyCreatureName(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/’/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function rowToCreature(row) {
  const id = Number(firstValue(row, 'id'))
  const name = firstValue(row, 'candidate')
  const score = Number(firstValue(row, 'accessibility score', 'accessibility_score', 'accessibility'))
  const status = firstValue(row, 'master_status', 'master status', 'status') || 'Active'
  return {
    id,
    name,
    score: Number.isFinite(score) && score > 0 ? score : 1,
    status,
    description: 'A creature in the Zoologist expedition pool.',
  }
}

function loadCreatureCatalog() {
  const rows = parseCsv(creatureCsv)
  const creatures = rows
    .map(rowToCreature)
    .filter((creature) => creature.id && creature.name && creature.status.toLowerCase() === 'active')
  if (creatures.length === 0) throw new Error('The creature CSV loaded, but no Active creatures were found.')
  return creatures
}

function getCreatureImageCandidates(creature) {
  const slug = slugifyCreatureName(creature?.name ?? '')
  return [
    `${import.meta.env.BASE_URL}assets/creatures/${slug}.png`,
    `${import.meta.env.BASE_URL}assets/creatures/${slug}.webp`,
    `${import.meta.env.BASE_URL}assets/creatures/${slug}.jpg`,
  ]
}

function pickStartingCreature(creatures) {
  const scoreOne = creatures.filter((creature) => creature.score === 1)
  return scoreOne[Math.floor(Math.random() * scoreOne.length)] ?? creatures[0] ?? null
}

function weightedCreaturePick(available, preferredScore = null) {
  if (available.length === 0) return null
  if (preferredScore == null) return available[Math.floor(Math.random() * available.length)]
  const weighted = available.map((creature) => ({
    creature,
    weight: 1 / (1 + Math.abs(creature.score - preferredScore) * 2),
  }))
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)
  let roll = Math.random() * total
  for (const item of weighted) {
    roll -= item.weight
    if (roll <= 0) return item.creature
  }
  return weighted[weighted.length - 1].creature
}

function pickUnusedCreature(creatures, usedIds, preferredScore = null) {
  return weightedCreaturePick(creatures.filter((creature) => !usedIds.has(creature.id)), preferredScore)
}

function preferredScoreForDistance(x, y) {
  const distance = Math.abs(x) + Math.abs(y)
  return Math.min(8, Math.max(1, 1 + Math.floor(distance / 4)))
}

function createInitialTiles(creatures, startCreature) {
  const tiles = {
    [keyFor(0, 0)]: { x: 0, y: 0, state: 'explored', creatureId: startCreature.id, completed: true },
  }
  const usedIds = new Set([startCreature.id])
  CARDINAL_DIRECTIONS.forEach(([dx, dy]) => {
    const creature = pickUnusedCreature(creatures, usedIds, preferredScoreForDistance(dx, dy))
    if (!creature) return
    usedIds.add(creature.id)
    tiles[keyFor(dx, dy)] = { x: dx, y: dy, state: 'frontier', creatureId: creature.id, completed: false }
  })
  return tiles
}

function getAdjacentPositions(tiles) {
  const explored = Object.values(tiles).filter((tile) => tile.state === 'explored')
  const positions = new Map()
  explored.forEach((tile) => {
    CARDINAL_DIRECTIONS.forEach(([dx, dy]) => {
      const x = tile.x + dx
      const y = tile.y + dy
      const key = keyFor(x, y)
      if (!tiles[key]) positions.set(key, { x, y })
    })
  })
  return [...positions.values()]
}

function recomputeFrontier(tiles, creatures) {
  const next = { ...tiles }
  const frontierPositions = getAdjacentPositions(tiles)
  const usedIds = new Set(Object.values(next).map((tile) => tile.creatureId).filter(Boolean))
  frontierPositions.forEach(({ x, y }) => {
    const creature = pickUnusedCreature(creatures, usedIds, preferredScoreForDistance(x, y))
    if (!creature) return
    usedIds.add(creature.id)
    next[keyFor(x, y)] = { x, y, state: 'frontier', creatureId: creature.id, completed: false }
  })
  return next
}

function CreatureGlyph({ creature, size = 'medium' }) {
  const [imageIndex, setImageIndex] = useState(0)
  const [imageFailed, setImageFailed] = useState(false)
  const creatureName = creature?.name ?? ''

  useEffect(() => {
    setImageIndex(0)
    setImageFailed(false)
  }, [creatureName])

  if (!creature) return null

  const candidates = getCreatureImageCandidates(creature)
  const image = candidates[imageIndex]

  const handleImageError = () => {
    if (imageIndex + 1 < candidates.length) {
      setImageIndex((current) => current + 1)
    } else {
      setImageFailed(true)
    }
  }

  return (
    <div className={`creature-glyph creature-glyph-${size}`}>
      {!imageFailed && image ? (
        <img
          src={image}
          alt=""
          className="creature-image"
          draggable="false"
          onError={handleImageError}
        />
      ) : (
        <span className="creature-fallback-glyph">🐾</span>
      )}
    </div>
  )
}

function MapTile({ tile, selected, onSelect, creatureById }) {
  const creature = tile.creatureId ? creatureById[tile.creatureId] : null
  const isFrontier = tile.state === 'frontier'
  const isExplored = tile.state === 'explored'

  return (
    <button
      type="button"
      className={`map-tile map-tile-${tile.state} ${selected ? 'is-selected' : ''}`}
      onClick={() => creature && onSelect(tile)}
      aria-label={creature ? `${creature.name}${tile.completed ? ', completed' : ', newly revealed'}` : 'Fog of war'}
    >
      {isExplored && creature && (
        <>
          <CreatureGlyph creature={creature} size="tile" />
          <span className="tile-name">{creature.name}</span>
          <span className="tile-status tile-status-complete">✓</span>
        </>
      )}

      {isFrontier && creature && (
        <>
          <CreatureGlyph creature={creature} size="tile" />
          <span className="tile-name">{creature.name}</span>
          <span className="tile-status tile-status-frontier"><Eye size={10} /> NEW</span>
        </>
      )}

      {tile.state === 'fog' && <Lock size={15} />}
    </button>
  )
}

function SkillsView() {
  const skills = [
    ['Attack', 1], ['Strength', 1], ['Defence', 1], ['Ranged', 1], ['Prayer', 1], ['Magic', 1],
    ['Runecraft', 1], ['Construction', 1], ['Hitpoints', 10], ['Agility', 1], ['Herblore', 1], ['Thieving', 1],
    ['Crafting', 1], ['Fletching', 1], ['Slayer', 1], ['Hunter', 1], ['Mining', 1], ['Smithing', 1],
    ['Fishing', 1], ['Cooking', 1], ['Firemaking', 1], ['Woodcutting', 1], ['Farming', 1], ['Dungeoneering', 1],
  ]
  return (
    <div className="full-tab-page">
      <div className="tab-page-heading">
        <div className="eyebrow"><Gem size={14} /> ACCOUNT PROGRESSION</div>
        <h1>Skills</h1>
        <p>A future overview of the skills that determine which revealed creatures you can currently complete.</p>
      </div>
      <div className="skills-grid">
        {skills.map(([name, level]) => (
          <div className="skill-card" key={name}>
            <div className="skill-icon">{name.slice(0, 2).toUpperCase()}</div>
            <div><strong>{name}</strong><span>Level {level}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuestsView() {
  const questRows = [
    ['Tutorial Island', 'Completed', true],
    ["Cook's Assistant", 'Available', false],
    ['Dragon Slayer I', 'Locked', false],
    ['Monkey Madness I', 'Locked', false],
    ['Desert Treasure II', 'Locked', false],
  ]
  return (
    <div className="full-tab-page">
      <div className="tab-page-heading">
        <div className="eyebrow"><ScrollText size={14} /> ACCOUNT PROGRESSION</div>
        <h1>Quests</h1>
        <p>Quest progression will feed directly into creature requirement checks.</p>
      </div>
      <div className="progress-list">
        {questRows.map(([name, status, done]) => (
          <div className="progress-row" key={name}>
            <div className={`status-marker ${done ? 'done' : ''}`}>{done ? '✓' : '—'}</div>
            <strong>{name}</strong>
            <span>{status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiariesView() {
  const diaries = [
    ['Lumbridge & Draynor', 'Not started'],
    ['Kandarin', 'Not started'],
    ['Karamja', 'Not started'],
    ['Desert', 'Not started'],
  ]
  return (
    <div className="full-tab-page">
      <div className="tab-page-heading">
        <div className="eyebrow"><BookOpen size={14} /> ACCOUNT PROGRESSION</div>
        <h1>Diaries</h1>
        <p>Achievement diary state can become another source of progression information for Zoologist.</p>
      </div>
      <div className="progress-list">
        {diaries.map(([name, status]) => (
          <div className="progress-row" key={name}>
            <div className="status-marker">D</div>
            <strong>{name}</strong>
            <span>{status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SidePanel({ open, setOpen, selectedTile, onClear, onComplete, exploredCount, frontierCount, creatureById, creatureCount }) {
  const creature = selectedTile?.creatureId ? creatureById[selectedTile.creatureId] : null

  return (
    <aside className={`side-panel ${open ? 'side-panel-open' : 'side-panel-collapsed'}`}>
      {open ? (
        <>
          <div className="side-panel-header">
            <div>
              <div className="eyebrow"><Compass size={13} /> EXPEDITION LOG</div>
              <strong>Discovery details</strong>
            </div>
            <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Collapse panel">
              <ChevronRight size={17} />
            </button>
          </div>

          {!creature ? (
            <div className="side-empty">
              <div className="empty-orb"><PawPrint size={24} /></div>
              <h2>Select a tile</h2>
              <p>Click an explored or newly revealed tile to inspect the creature, accessibility and completion reward.</p>
              <div className="side-stat-grid">
                <div><span>Explored</span><strong>{exploredCount}</strong></div>
                <div><span>Revealed</span><strong>{frontierCount}</strong></div>
                <div><span>Fog</span><strong>∞</strong></div>
                <div><span>Pool</span><strong>{creatureCount}</strong></div>
              </div>
            </div>
          ) : (
            <div className="side-detail">
              <button className="back-link" type="button" onClick={onClear}><ChevronLeft size={14} /> Back to expedition</button>
              <div className={`detail-banner ${selectedTile.completed ? 'complete' : 'frontier'}`}>
                <span>{selectedTile.completed ? 'COMPLETED TILE' : 'NEWLY REVEALED'}</span>
                {selectedTile.completed ? <ShieldCheck size={15} /> : <Eye size={15} />}
              </div>
              <div className="detail-creature">
                <CreatureGlyph creature={creature} size="hero" />
                <div>
                  <h2>{creature.name}</h2>
                  <span>Creature ID {creature.id}</span>
                </div>
              </div>
              <p className="detail-description">{creature.description}</p>
              <div className="detail-stats">
                <div><span>Accessibility</span><strong>Score {creature.score}</strong></div>
                <div><span>Completion</span><strong>{selectedTile.completed ? 'Complete' : 'Not complete'}</strong></div>
              </div>
              <div className="reward-box">
                <div className="reward-heading"><Sparkles size={15} /> Completion reward</div>
                <strong>Reward data not assigned yet</strong>
                <p>The reward will be shown here once the master creature data includes it.</p>
              </div>
              {!selectedTile.completed && (
                <button className="complete-button" type="button" onClick={() => onComplete(selectedTile)}>
                  <Flag size={15} /> Mark complete
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <button className="collapsed-rail" type="button" onClick={() => setOpen(true)} aria-label="Open expedition panel">
          <ChevronLeft size={18} />
          <span>EXPEDITION</span>
        </button>
      )}
    </aside>
  )
}

function MapView({ creatures, onCompletedCountChange }) {
  const creatureById = useMemo(() => Object.fromEntries(creatures.map((creature) => [creature.id, creature])), [creatures])
  const creatureCount = creatures.length
  const [panelOpen, setPanelOpen] = useState(true)
  const [selectedTile, setSelectedTile] = useState(null)
  const [startCreature] = useState(() => pickStartingCreature(creatures))
  const [tiles, setTiles] = useState(() => createInitialTiles(creatures, startCreature))
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)

  const stageRef = useRef(null)
  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  const pointerRef = useRef({ x: 0, y: 0, inside: false })
  const dragRef = useRef({ active: false, x: 0, y: 0 })
  const edgeFrameRef = useRef(null)

  useEffect(() => { panRef.current = pan }, [pan])
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  const updatePan = (dx, dy) => {
    setPan((current) => ({ x: current.x + dx, y: current.y + dy }))
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return

      const amount = event.shiftKey ? 48 : 28
      if (event.key === 'ArrowUp') { event.preventDefault(); updatePan(0, amount) }
      if (event.key === 'ArrowDown') { event.preventDefault(); updatePan(0, -amount) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); updatePan(amount, 0) }
      if (event.key === 'ArrowRight') { event.preventDefault(); updatePan(-amount, 0) }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        setZoom((current) => Math.min(MAX_ZOOM, Number((current + ZOOM_STEP).toFixed(2))))
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        setZoom((current) => Math.max(MIN_ZOOM, Number((current - ZOOM_STEP).toFixed(2))))
      }
      if (event.key === '0') {
        event.preventDefault()
        setPan({ x: 0, y: 0 })
        setZoom(1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const tick = () => {
      const stage = stageRef.current
      const pointer = pointerRef.current

      if (stage && pointer.inside && !dragRef.current.active) {
        const rect = stage.getBoundingClientRect()
        const x = pointer.x - rect.left
        const y = pointer.y - rect.top
        const zone = EDGE_ZONE
        let dx = 0
        let dy = 0

        if (x >= 0 && x <= zone) dx = 5 + (1 - x / zone) * 10
        if (x >= rect.width - zone && x <= rect.width) dx = -(5 + (1 - (rect.width - x) / zone) * 10)
        if (y >= 0 && y <= zone) dy = 5 + (1 - y / zone) * 10
        if (y >= rect.height - zone && y <= rect.height) dy = -(5 + (1 - (rect.height - y) / zone) * 10)

        if (dx || dy) updatePan(dx, dy)
      }

      edgeFrameRef.current = requestAnimationFrame(tick)
    }

    edgeFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(edgeFrameRef.current)
  }, [])

  const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

  const zoomAtPoint = (nextZoom, clientX, clientY) => {
    const stage = stageRef.current
    if (!stage) return

    const rect = stage.getBoundingClientRect()
    const offsetX = clientX - (rect.left + rect.width / 2)
    const offsetY = clientY - (rect.top + rect.height / 2)
    const currentZoom = zoomRef.current
    const targetZoom = clampZoom(nextZoom)

    if (Math.abs(targetZoom - currentZoom) < 0.001) return

    const ratio = targetZoom / currentZoom
    setPan((currentPan) => ({
      x: offsetX - (offsetX - currentPan.x) * ratio,
      y: offsetY - (offsetY - currentPan.y) * ratio,
    }))
    setZoom(targetZoom)
  }

  const handleWheel = (event) => {
    event.preventDefault()
    const direction = event.deltaY > 0 ? -1 : 1
    const amount = event.ctrlKey ? 0.05 : 0.11
    zoomAtPoint(zoomRef.current + direction * amount, event.clientX, event.clientY)
  }

  const handlePointerMove = (event) => {
    pointerRef.current = { x: event.clientX, y: event.clientY, inside: true }

    if (!dragRef.current.active) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    dragRef.current.x = event.clientX
    dragRef.current.y = event.clientY
    updatePan(dx, dy)
  }

  const handlePointerDown = (event) => {
    if (event.button !== 1) return
    event.preventDefault()
    dragRef.current = { active: true, x: event.clientX, y: event.clientY }
    setDragging(true)
    stageRef.current?.setPointerCapture(event.pointerId)
  }

  const stopDrag = (event) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    setDragging(false)
    try { stageRef.current?.releasePointerCapture(event.pointerId) } catch {}
  }

  const handlePointerLeave = () => {
    if (!dragRef.current.active) pointerRef.current.inside = false
  }

  const centreTileX = Math.round(-pan.x / (TILE_STEP * zoom))
  const centreTileY = Math.round(-pan.y / (TILE_STEP * zoom))

  const mapCells = useMemo(() => {
    const startX = centreTileX - RENDER_RADIUS
    const startY = centreTileY - RENDER_RADIUS
    const cells = []

    for (let y = startY; y <= centreTileY + RENDER_RADIUS; y += 1) {
      for (let x = startX; x <= centreTileX + RENDER_RADIUS; x += 1) {
        const known = tiles[keyFor(x, y)]
        cells.push({
          x,
          y,
          state: known?.state ?? 'fog',
          creatureId: known?.creatureId,
          completed: known?.completed ?? false,
        })
      }
    }

    const gridSize = RENDER_DIAMETER * TILE_SIZE + (RENDER_DIAMETER - 1) * TILE_GAP
    return {
      startX,
      startY,
      cells,
      gridSize,
      offsetX: pan.x + centreTileX * TILE_STEP * zoom,
      offsetY: pan.y + centreTileY * TILE_STEP * zoom,
    }
  }, [centreTileX, centreTileY, pan.x, pan.y, tiles, zoom])

  const exploredCount = Object.values(tiles).filter((tile) => tile.state === 'explored').length
  const frontierCount = Object.values(tiles).filter((tile) => tile.state === 'frontier').length

  const handleComplete = (tile) => {
    if (!tile || tile.state !== 'frontier') return

    setTiles((current) => {
      const completedMap = {
        ...current,
        [keyFor(tile.x, tile.y)]: {
          ...current[keyFor(tile.x, tile.y)],
          state: 'explored',
          completed: true,
        },
      }
      return recomputeFrontier(completedMap, creatures)
    })

    setSelectedTile((current) => ({
      ...current,
      state: 'explored',
      completed: true,
    }))
    onCompletedCountChange?.((current) => current + 1)
  }

  const selectTile = (tile) => setSelectedTile(tile)

  const resetCamera = () => {
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }

  return (
    <div className={`map-layout ${panelOpen ? '' : 'panel-collapsed-layout'}`}>
      <section className="map-panel">
        <div className="map-toolbar">
          <div>
            <div className="eyebrow"><Gamepad2 size={13} /> ZOOLOGIST EXPEDITION</div>
            <h1>Unknown Territory</h1>
            <p>One creature to begin. Reveal the frontier and discover what lies beyond it.</p>
          </div>
          <div className="map-legend">
            <span><i className="legend-swatch explored" /> Explored</span>
            <span><i className="legend-swatch frontier" /> Revealed</span>
            <span><i className="legend-swatch fog" /> Fog of war</span>
          </div>
        </div>

        <div
          className={`map-stage ${dragging ? 'is-dragging' : ''}`}
          ref={stageRef}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onPointerLeave={handlePointerLeave}
          onWheel={handleWheel}
          onContextMenu={(event) => event.preventDefault()}
          tabIndex={0}
          aria-label="Zoologist map. Pan with arrow keys, screen edges, or middle mouse drag."
        >
          <div
            className="map-grid-pan"
            style={{
              width: mapCells.gridSize,
              height: mapCells.gridSize,
              transform: `translate3d(calc(-50% + ${mapCells.offsetX}px), calc(-50% + ${mapCells.offsetY}px), 0)`,
            }}
          >
            <div
              className="map-grid"
              style={{
                width: mapCells.gridSize,
                height: mapCells.gridSize,
                gridTemplateColumns: `repeat(${RENDER_DIAMETER}, ${TILE_SIZE}px)`,
                gridTemplateRows: `repeat(${RENDER_DIAMETER}, ${TILE_SIZE}px)`,
                transform: `scale(${zoom})`,
              }}
            >
              {mapCells.cells.map((tile) => (
                <MapTile
                  key={`${tile.x}:${tile.y}`}
                  tile={tile}
                  selected={selectedTile && selectedTile.x === tile.x && selectedTile.y === tile.y}
                  onSelect={selectTile}
                  creatureById={creatureById}
                />
              ))}
            </div>
          </div>

          <div
            className="map-zoom-controls"
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => zoomAtPoint(zoom - ZOOM_STEP, window.innerWidth / 2, window.innerHeight / 2)} aria-label="Zoom out">−</button>
            <button type="button" className="zoom-readout" onClick={resetCamera} aria-label="Reset map and zoom">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => zoomAtPoint(zoom + ZOOM_STEP, window.innerWidth / 2, window.innerHeight / 2)} aria-label="Zoom in">+</button>
          </div>

          <div className="map-control-hint">
            <div><MousePointer2 size={13} /> Move to map edge to pan</div>
            <div>↑ ↓ ← → <span>Arrow keys</span></div>
            <div>MMB <span>Drag to pan</span></div>
            <div>Wheel <span>Zoom in / out</span></div>
          </div>

          <div className="map-key">
            <div><span className="key-dot key-complete" /> Completed territory</div>
            <div><span className="key-dot key-frontier" /> Visible frontier</div>
            <div><span className="key-dot key-fog" /> Unknown</div>
          </div>
          <div className="map-position">WORLD {centreTileX}, {centreTileY}</div>
        </div>

        <div className="map-footer-bar">
          <div><span>EXPLORED</span><strong>{exploredCount}</strong></div>
          <div><span>FRONTIER</span><strong>{frontierCount}</strong></div>
          <div><span>CREATURES COMPLETED</span><strong>{exploredCount} / {creatureCount}</strong></div>
          <div className="footer-note"><Eye size={13} /> The wider map remains hidden.</div>
        </div>
      </section>

      <SidePanel
        open={panelOpen}
        setOpen={setPanelOpen}
        selectedTile={selectedTile}
        onClear={() => setSelectedTile(null)}
        onComplete={handleComplete}
        exploredCount={exploredCount}
        frontierCount={frontierCount}
        creatureById={creatureById}
        creatureCount={creatureCount}
      />
    </div>
  )
}

function App() {
  const [tab, setTab] = useState('map')
  const [creatures] = useState(() => {
    try {
      return loadCreatureCatalog()
    } catch {
      return []
    }
  })
  const [completedCount, setCompletedCount] = useState(1)

  if (creatures.length === 0) {
    return (
      <div className="app-shell">
        <div className="full-tab-page">
          <div className="tab-page-heading">
            <div className="eyebrow"><ShieldCheck size={14} /> DATA ERROR</div>
            <h1>Creature data could not be loaded</h1>
            <p>Check that <code>data/creatures.csv</code> exists in the repository and contains an Active creature pool.</p>
          </div>
        </div>
      </div>
    )
  }

  const creatureCount = creatures.length
  const page = tab === 'skills' ? <SkillsView />
    : tab === 'quests' ? <QuestsView />
      : tab === 'diaries' ? <DiariesView />
        : <MapView creatures={creatures} onCompletedCountChange={setCompletedCount} />

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark"><PawPrint size={21} /></div>
          <div>
            <div className="brand-name">Zoologist</div>
            <div className="brand-subtitle">OSRS creature exploration</div>
          </div>
        </div>

        <nav className="top-tabs" aria-label="Primary navigation">
          {[
            { id: 'map', label: 'Map', icon: LayoutGrid },
            { id: 'skills', label: 'Skills', icon: Gem },
            { id: 'quests', label: 'Quests', icon: ScrollText },
            { id: 'diaries', label: 'Diaries', icon: BookOpen },
          ].map(({ id, label, icon: Icon }) => (
            <button type="button" key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <div className="header-progress">
            <div className="progress-label"><span>CREATURES</span><strong>{completedCount} / {creatureCount}</strong></div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, (completedCount / creatureCount) * 100))}%` }} /></div>
          </div>
          <button type="button" className="account-button"><Users size={16} /> Account</button>
        </div>
      </header>

      <main className="app-main">{page}</main>

      <footer className="footer">
        <span>ZOOLOGIST • MASTER DATA CONNECTED</span>
        <span>{creatureCount} Active creatures • Local images • Square grid • Fog of war</span>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
