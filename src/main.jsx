import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,import React, { useEffect, useMemo, useRef, useState } from 'react'
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

const MASTER_CREATURE_COUNT = 440
const TILE_SIZE = 72
const TILE_GAP = 2
const TILE_STEP = TILE_SIZE + TILE_GAP
const GRID_RADIUS = 12
const GRID_DIAMETER = GRID_RADIUS * 2 + 1
const EDGE_ZONE = 56

// Small UI catalogue for the visual prototype. The full master dataset will replace this.
const creatureCatalog = [
  { id: 1, name: 'Chicken', score: 1, glyph: '🐔', description: 'Your starting creature. The expedition begins here.' },
  { id: 2, name: 'Cow', score: 1, glyph: '🐄', description: 'A nearby creature waiting to be completed.' },
  { id: 12, name: 'Dog', score: 1, glyph: '🐕', description: 'An accessible early discovery.' },
  { id: 13, name: 'Cat', score: 1, glyph: '🐈', description: 'Another early expedition target.' },
  { id: 17, name: 'Rabbit', score: 1, glyph: '🐇', description: 'A score 1 creature close to the beginning.' },
]

const creatureByName = Object.fromEntries(creatureCatalog.map((creature) => [creature.name, creature]))

// For the initial UI prototype there is exactly one explored/completed tile.
// The four cardinal neighbours form the visible frontier. Everything else is fog.
const knownTiles = {
  '0:0': { state: 'explored', creature: 'Chicken', completed: true },
  '0:-1': { state: 'frontier', creature: 'Rabbit', completed: false },
  '1:0': { state: 'frontier', creature: 'Cow', completed: false },
  '0:1': { state: 'frontier', creature: 'Dog', completed: false },
  '-1:0': { state: 'frontier', creature: 'Cat', completed: false },
}

const topTabs = [
  { id: 'map', label: 'Map', icon: LayoutGrid },
  { id: 'skills', label: 'Skills', icon: Gem },
  { id: 'quests', label: 'Quests', icon: ScrollText },
  { id: 'diaries', label: 'Diaries', icon: BookOpen },
]

function getKnownTile(x, y) {
  return knownTiles[`${x}:${y}`]
}

function CreatureGlyph({ creature, size = 'medium' }) {
  if (!creature) return null
  return <div className={`creature-glyph creature-glyph-${size}`}>{creature.glyph}</div>
}

function MapTile({ tile, selected, onSelect }) {
  const creature = tile.creature ? creatureByName[tile.creature] : null
  const isFrontier = tile.state === 'frontier'
  const isExplored = tile.state === 'explored'

  return (
    <button
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

function SidePanel({ open, setOpen, selectedTile, onClear }) {
  const creature = selectedTile?.creature ? creatureByName[selectedTile.creature] : null

  return (
    <aside className={`side-panel ${open ? 'side-panel-open' : 'side-panel-collapsed'}`}>
      {open ? (
        <>
          <div className="side-panel-header">
            <div>
              <div className="eyebrow"><Compass size={13} /> EXPEDITION LOG</div>
              <strong>Discovery details</strong>
            </div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="Collapse panel">
              <ChevronRight size={17} />
            </button>
          </div>

          {!creature ? (
            <div className="side-empty">
              <div className="empty-orb"><PawPrint size={24} /></div>
              <h2>Select a tile</h2>
              <p>Click an explored or newly revealed tile to inspect the creature, accessibility and completion reward.</p>
              <div className="side-stat-grid">
                <div><span>Explored</span><strong>1</strong></div>
                <div><span>Revealed</span><strong>4</strong></div>
                <div><span>Fog</span><strong>∞</strong></div>
                <div><span>Pool</span><strong>{MASTER_CREATURE_COUNT}</strong></div>
              </div>
            </div>
          ) : (
            <div className="side-detail">
              <button className="back-link" onClick={onClear}><ChevronLeft size={14} /> Back to expedition</button>
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
                <button className="complete-button"><Flag size={15} /> Mark complete</button>
              )}
            </div>
          )}
        </>
      ) : (
        <button className="collapsed-rail" onClick={() => setOpen(true)} aria-label="Open expedition panel">
          <ChevronLeft size={18} />
          <span>EXPEDITION</span>
        </button>
      )}
    </aside>
  )
}

function MapView() {
  const [panelOpen, setPanelOpen] = useState(true)
  const [selectedTile, setSelectedTile] = useState(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const stageRef = useRef(null)
  const panRef = useRef(pan)
  const pointerRef = useRef({ x: 0, y: 0, inside: false })
  const dragRef = useRef({ active: false, x: 0, y: 0 })
  const edgeFrameRef = useRef(null)

  useEffect(() => {
    panRef.current = pan
  }, [pan])

  const updatePan = (dx, dy) => {
    setPan((current) => ({ x: current.x + dx, y: current.y + dy }))
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      const amount = event.shiftKey ? 34 : 20
      if (event.key === 'ArrowUp') { event.preventDefault(); updatePan(0, amount) }
      if (event.key === 'ArrowDown') { event.preventDefault(); updatePan(0, -amount) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); updatePan(amount, 0) }
      if (event.key === 'ArrowRight') { event.preventDefault(); updatePan(-amount, 0) }
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

        if (x >= 0 && x <= zone) dx = 6 + (1 - x / zone) * 7
        if (x >= rect.width - zone && x <= rect.width) dx = -(6 + (1 - (rect.width - x) / zone) * 7)
        if (y >= 0 && y <= zone) dy = 6 + (1 - y / zone) * 7
        if (y >= rect.height - zone && y <= rect.height) dy = -(6 + (1 - (rect.height - y) / zone) * 7)

        if (dx || dy) updatePan(dx, dy)
      }

      edgeFrameRef.current = requestAnimationFrame(tick)
    }

    edgeFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(edgeFrameRef.current)
  }, [])

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

  const mapCells = useMemo(() => {
    const startX = Math.floor(-pan.x / TILE_STEP) - GRID_RADIUS
    const startY = Math.floor(-pan.y / TILE_STEP) - GRID_RADIUS
    const cells = []

    for (let y = startY; y < startY + GRID_DIAMETER; y += 1) {
      for (let x = startX; x < startX + GRID_DIAMETER; x += 1) {
        const known = getKnownTile(x, y)
        cells.push({ x, y, state: known?.state ?? 'fog', creature: known?.creature, completed: known?.completed ?? false })
      }
    }

    return {
      startX,
      startY,
      cells,
      left: pan.x + startX * TILE_STEP - TILE_SIZE / 2,
      top: pan.y + startY * TILE_STEP - TILE_SIZE / 2,
    }
  }, [pan])

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
          onContextMenu={(event) => event.preventDefault()}
          tabIndex={0}
          aria-label="Zoologist map. Pan with arrow keys, screen edges, or middle mouse drag."
        >
          <div
            className="map-grid"
            style={{
              width: GRID_DIAMETER * TILE_SIZE + (GRID_DIAMETER - 1) * TILE_GAP,
              height: GRID_DIAMETER * TILE_SIZE + (GRID_DIAMETER - 1) * TILE_GAP,
              gridTemplateColumns: `repeat(${GRID_DIAMETER}, ${TILE_SIZE}px)`,
              gridTemplateRows: `repeat(${GRID_DIAMETER}, ${TILE_SIZE}px)`,
              left: `calc(50% + ${mapCells.left}px)`,
              top: `calc(50% + ${mapCells.top}px)`,
            }}
          >
            {mapCells.cells.map((tile) => (
              <MapTile
                key={`${tile.x}:${tile.y}`}
                tile={tile}
                selected={selectedTile && selectedTile.x === tile.x && selectedTile.y === tile.y}
                onSelect={setSelectedTile}
              />
            ))}
          </div>

          <div className="map-control-hint">
            <div><MousePointer2 size={13} /> Move to map edge to pan</div>
            <div>↑ ↓ ← → <span>Arrow keys</span></div>
            <div>MMB <span>Drag to pan</span></div>
          </div>

          <div className="map-key">
            <div><span className="key-dot key-complete" /> Completed territory</div>
            <div><span className="key-dot key-frontier" /> Visible frontier</div>
            <div><span className="key-dot key-fog" /> Unknown</div>
          </div>
          <div className="map-position">WORLD {Math.round(-pan.x / TILE_STEP)}, {Math.round(-pan.y / TILE_STEP)}</div>
        </div>

        <div className="map-footer-bar">
          <div><span>EXPLORED</span><strong>1</strong></div>
          <div><span>FRONTIER</span><strong>4</strong></div>
          <div><span>CREATURES COMPLETED</span><strong>1 / {MASTER_CREATURE_COUNT}</strong></div>
          <div className="footer-note"><Eye size={13} /> The wider map remains hidden.</div>
        </div>
      </section>
      <SidePanel open={panelOpen} setOpen={setPanelOpen} selectedTile={selectedTile} onClear={() => setSelectedTile(null)} />
    </div>
  )
}

function App() {
  const [tab, setTab] = useState('map')

  const page = useMemo(() => {
    if (tab === 'skills') return <SkillsView />
    if (tab === 'quests') return <QuestsView />
    if (tab === 'diaries') return <DiariesView />
    return <MapView />
  }, [tab])

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
          {topTabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <div className="header-progress">
            <div className="progress-label"><span>CREATURES</span><strong>1 / {MASTER_CREATURE_COUNT}</strong></div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${100 / MASTER_CREATURE_COUNT}%` }} /></div>
          </div>
          <button className="account-button"><Users size={16} /> Account</button>
        </div>
      </header>

      <main className="app-main">{page}</main>

      <footer className="footer">
        <span>ZOOLOGIST • FRONTEND PROTOTYPE</span>
        <span>Square grid • Fog of war • Edge pan • Arrow keys • Middle mouse</span>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)

  CircleHelp,
  Compass,
  Eye,
  Flag,
  Gamepad2,
  Gem,
  LayoutGrid,
  Lock,
  PawPrint,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Swords,
  Users,
  X,
} from 'lucide-react'
import './styles.css'

const MASTER_CREATURE_COUNT = 440

// UI sample data. The complete CSV can be plugged into the same shape later.
const creatureCatalog = [
  { id: 1, name: 'Chicken', score: 1, glyph: '🐔', description: 'A very normal chicken. A very important chicken.' },
  { id: 2, name: 'Cow', score: 1, glyph: '🐄', description: 'An early expedition staple.' },
  { id: 15, name: 'Fox', score: 2, glyph: '🦊', description: 'A little further out than the starting creatures.' },
  { id: 17, name: 'Rabbit', score: 1, glyph: '🐇', description: 'An accessible creature found near the beginning.' },
  { id: 42, name: 'Wolf', score: 2, glyph: '🐺', description: 'A step up in accessibility.' },
  { id: 48, name: 'Werewolf', score: 4, glyph: '🐺', description: 'This one comes with rather more homework.' },
  { id: 55, name: 'Gorilla', score: 4, glyph: '🦍', description: 'A tougher expedition target.' },
  { id: 57, name: 'Demonic Gorilla', score: 8, glyph: '🦍', description: 'One of the highest-accessibility creatures in the launch pool.' },
  { id: 90, name: 'Crow', score: 1, glyph: '🐦', description: 'A score 1 creature demonstrating that distance and difficulty are not the same thing.' },
  { id: 102, name: 'Hippo', score: 4, glyph: '🦛', description: 'A Varlamore-era expedition target.' },
  { id: 134, name: 'Sulphur Lizard', score: 4, glyph: '🦎', description: 'A mid-to-late progression encounter.' },
  { id: 155, name: 'Araxyte', score: 6, glyph: '🕷️', description: 'A high-accessibility encounter.' },
  { id: 166, name: 'Gemstone Crab', score: 5, glyph: '🦀', description: 'A creature with plenty of reasons to keep an eye on the tile.' },
  { id: 196, name: 'Monkfish', score: 4, glyph: '🐟', description: 'A fishing-related expedition target.' },
  { id: 291, name: 'Rune Dragon', score: 7, glyph: '🐉', description: 'A late progression target.' },
  { id: 302, name: 'Hydra', score: 8, glyph: '🐍', description: 'One of the launch pool\'s most demanding creatures.' },
  { id: 315, name: 'Lucky Impling', score: 7, glyph: '🧚', description: 'A rare-feeling discovery represented here as a high-accessibility target.' },
  { id: 320, name: 'Abyssal Sire', score: 8, glyph: '👹', description: 'A very late expedition target.' },
  { id: 330, name: 'Tormented Demon', score: 8, glyph: '👹', description: 'Another high-accessibility creature.' },
  { id: 357, name: 'Hespori', score: 6, glyph: '🌿', description: 'A progression-heavy encounter.' },
  { id: 374, name: 'Gryphon', score: 6, glyph: '🦅', description: 'A high-accessibility creature.' },
  { id: 385, name: 'Orca', score: 7, glyph: '🐋', description: 'A deep expedition target in the current pool.' },
  { id: 427, name: 'Mammoth', score: 4, glyph: '🐘', description: 'A larger creature represented on the map.' },
  { id: 428, name: 'Unicorn', score: 2, glyph: '🦄', description: 'An accessible fantasy creature.' },
  { id: 440, name: 'Minotaur', score: 2, glyph: '🐂', description: 'An accessible creature from the launch pool.' },
]

const creatureByName = Object.fromEntries(creatureCatalog.map((creature) => [creature.name, creature]))

const tileMap = {
  '-1:-1': { state: 'explored', creature: 'Rabbit', completed: true },
  '0:-1': { state: 'explored', creature: 'Chicken', completed: true },
  '1:-1': { state: 'explored', creature: 'Cow', completed: true },
  '-1:0': { state: 'explored', creature: 'Crow', completed: true },
  '0:0': { state: 'explored', creature: 'Fox', completed: true },
  '1:0': { state: 'explored', creature: 'Wolf', completed: true },
  '-1:1': { state: 'explored', creature: 'Minotaur', completed: true },
  '0:1': { state: 'explored', creature: 'Rabbit', completed: true },
  '1:1': { state: 'explored', creature: 'Cow', completed: true },
  '-2:-2': { state: 'frontier', creature: 'Unicorn', completed: false },
  '-1:-2': { state: 'frontier', creature: 'Monkfish', completed: false },
  '0:-2': { state: 'frontier', creature: 'Gemstone Crab', completed: false },
  '1:-2': { state: 'frontier', creature: 'Werewolf', completed: false },
  '2:-2': { state: 'frontier', creature: 'Demonic Gorilla', completed: false },
  '-2:-1': { state: 'frontier', creature: 'Gorilla', completed: false },
  '2:-1': { state: 'frontier', creature: 'Hippo', completed: false },
  '-2:0': { state: 'frontier', creature: 'Fox', completed: false },
  '2:0': { state: 'frontier', creature: 'Sulphur Lizard', completed: false },
  '-2:1': { state: 'frontier', creature: 'Crow', completed: false },
  '2:1': { state: 'frontier', creature: 'Araxyte', completed: false },
  '-2:2': { state: 'frontier', creature: 'Mammoth', completed: false },
  '-1:2': { state: 'frontier', creature: 'Hespori', completed: false },
  '0:2': { state: 'frontier', creature: 'Rune Dragon', completed: false },
  '1:2': { state: 'frontier', creature: 'Lucky Impling', completed: false },
  '2:2': { state: 'frontier', creature: 'Hydra', completed: false },
}

const mapCells = []
for (let y = -5; y <= 5; y += 1) {
  for (let x = -5; x <= 5; x += 1) {
    const key = `${x}:${y}`
    const known = tileMap[key]
    mapCells.push({
      x,
      y,
      state: known?.state ?? 'fog',
      creature: known?.creature,
      completed: known?.completed ?? false,
    })
  }
}

const topTabs = [
  { id: 'map', label: 'Map', icon: LayoutGrid },
  { id: 'skills', label: 'Skills', icon: Gem },
  { id: 'quests', label: 'Quests', icon: ScrollText },
  { id: 'diaries', label: 'Diaries', icon: BookOpen },
]

function CreatureGlyph({ creature, size = 'medium' }) {
  if (!creature) return null
  return <div className={`creature-glyph creature-glyph-${size}`}>{creature.glyph}</div>
}

function MapTile({ tile, selected, onSelect }) {
  const creature = tile.creature ? creatureByName[tile.creature] : null
  const isFrontier = tile.state === 'frontier'
  const isExplored = tile.state === 'explored'

  return (
    <button
      className={`map-tile map-tile-${tile.state} ${selected ? 'is-selected' : ''}`}
      onClick={() => creature && onSelect(tile)}
      aria-label={creature ? `${creature.name}${tile.completed ? ', completed' : ', incomplete'}` : 'Fog of war'}
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
    ['Cook\'s Assistant', 'Available', false],
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

function SidePanel({ open, setOpen, selectedTile, onClear }) {
  const creature = selectedTile?.creature ? creatureByName[selectedTile.creature] : null

  return (
    <aside className={`side-panel ${open ? 'side-panel-open' : 'side-panel-collapsed'}`}>
      {open ? (
        <>
          <div className="side-panel-header">
            <div>
              <div className="eyebrow"><Compass size={13} /> EXPEDITION LOG</div>
              <strong>Discovery details</strong>
            </div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="Collapse panel">
              <ChevronRight size={17} />
            </button>
          </div>

          {!creature ? (
            <div className="side-empty">
              <div className="empty-orb"><PawPrint size={24} /></div>
              <h2>Select a tile</h2>
              <p>Click an explored or newly revealed tile to inspect the creature, accessibility and completion reward.</p>
              <div className="side-stat-grid">
                <div><span>Completed</span><strong>9</strong></div>
                <div><span>Revealed</span><strong>16</strong></div>
                <div><span>Hidden</span><strong>96+</strong></div>
                <div><span>Pool</span><strong>{MASTER_CREATURE_COUNT}</strong></div>
              </div>
            </div>
          ) : (
            <div className="side-detail">
              <button className="back-link" onClick={onClear}><ChevronLeft size={14} /> Back to expedition</button>
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
                <p>The visual slot is ready for the eventual reward metadata.</p>
              </div>
              {!selectedTile.completed && (
                <button className="complete-button"><Flag size={15} /> Mark complete</button>
              )}
            </div>
          )}
        </>
      ) : (
        <button className="collapsed-rail" onClick={() => setOpen(true)} aria-label="Open expedition panel">
          <ChevronLeft size={18} />
          <span>EXPEDITION</span>
        </button>
      )}
    </aside>
  )
}

function MapView() {
  const [panelOpen, setPanelOpen] = useState(true)
  const [selectedTile, setSelectedTile] = useState(null)

  const completed = mapCells.filter((cell) => cell.completed).length
  const revealed = mapCells.filter((cell) => cell.state === 'frontier').length

  const handleSelect = (tile) => {
    setSelectedTile(tile)
  }

  return (
    <div className={`map-layout ${panelOpen ? '' : 'panel-collapsed-layout'}`}>
      <section className="map-panel">
        <div className="map-toolbar">
          <div>
            <div className="eyebrow"><Gamepad2 size={13} /> ZOOLOGIST EXPEDITION</div>
            <h1>Unknown Territory</h1>
            <p>Explore the revealed frontier. Everything beyond it is still hidden.</p>
          </div>
          <div className="map-legend">
            <span><i className="legend-swatch explored" /> Explored</span>
            <span><i className="legend-swatch frontier" /> Revealed</span>
            <span><i className="legend-swatch fog" /> Fog of war</span>
          </div>
        </div>

        <div className="map-stage">
          <div className="map-axis map-axis-x">X</div>
          <div className="map-axis map-axis-y">Y</div>
          <div className="map-grid" style={{ '--grid-size': '11' }}>
            {mapCells.map((tile) => (
              <MapTile
                key={`${tile.x}:${tile.y}`}
                tile={tile}
                selected={selectedTile && selectedTile.x === tile.x && selectedTile.y === tile.y}
                onSelect={handleSelect}
              />
            ))}
          </div>
          <div className="map-key">
            <div><span className="key-dot key-complete" /> Completed territory</div>
            <div><span className="key-dot key-frontier" /> Current revealed frontier</div>
            <div><span className="key-dot key-fog" /> Unknown</div>
          </div>
          <div className="map-position">0, 0</div>
        </div>

        <div className="map-footer-bar">
          <div><span>EXPLORED</span><strong>{completed}</strong></div>
          <div><span>FRONTIER</span><strong>{revealed}</strong></div>
          <div><span>CREATURES COMPLETED</span><strong>1 / {MASTER_CREATURE_COUNT}</strong></div>
          <div className="footer-note"><Eye size={13} /> The wider map remains hidden.</div>
        </div>
      </section>
      <SidePanel open={panelOpen} setOpen={setPanelOpen} selectedTile={selectedTile} onClear={() => setSelectedTile(null)} />
    </div>
  )
}

function App() {
  const [tab, setTab] = useState('map')

  const page = useMemo(() => {
    if (tab === 'skills') return <SkillsView />
    if (tab === 'quests') return <QuestsView />
    if (tab === 'diaries') return <DiariesView />
    return <MapView />
  }, [tab])

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
          {topTabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <div className="header-progress">
            <div className="progress-label"><span>CREATURES</span><strong>1 / {MASTER_CREATURE_COUNT}</strong></div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${100 / MASTER_CREATURE_COUNT}%` }} /></div>
          </div>
          <button className="account-button"><Users size={16} /> Account</button>
        </div>
      </header>

      <main className="app-main">
        {page}
      </main>

      <footer className="footer">
        <span>ZOOL0GIST • FRONTEND PROTOTYPE</span>
        <span>Square grid • Fog of war • Skills • Quests • Diaries</span>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
