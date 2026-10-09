const STORAGE_KEY = 'zoologist-sfx-enabled'

export function isSfxEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'false' } catch { return true }
}

export function setSfxEnabled(enabled) {
  try { localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false') } catch {}
}

let audioContext
function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  if (!audioContext) audioContext = new AudioContextClass()
  return audioContext
}

function tone(ctx, { frequency, endFrequency = frequency, start, duration, type = 'square', volume = 0.07 }) {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.008, duration * 0.2))
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.015)
}

// Short, soft retro sounds generated locally; no audio files or external requests.
const melodies = {
  // Clearly audible card flip: a quick descending swish with a crisp card-edge tick.
  flip: [
    [680, 210, 0, 0.16, 'sawtooth', 0.065],
    [980, 420, 0.018, 0.105, 'triangle', 0.055],
    [1450, 720, 0.045, 0.055, 'square', 0.025],
    [260, 180, 0.075, 0.12, 'triangle', 0.045],
  ],
  // A more rewarding coin pickup: a low coin clink, rising double chime, and bright final sparkle.
  complete: [
    [520, 390, 0, 0.075, 'triangle', 0.045],
    [1046, 1318, 0.045, 0.12, 'sine', 0.055],
    [1568, 2093, 0.105, 0.19, 'sine', 0.05],
    [1318, 1760, 0.19, 0.22, 'triangle', 0.035],
  ],
  // Achievement diary bonus reveal: a distinct, uplifting unlock sparkle.
  diary: [
    [659, 784, 0, 0.11, 'triangle', 0.04],
    [988, 1175, 0.075, 0.14, 'sine', 0.045],
    [1318, 1568, 0.16, 0.2, 'sine', 0.05],
    [1760, 1760, 0.26, 0.23, 'sine', 0.035],
  ],
  boss: [
    [392, 392, 0, 0.13, 'triangle', 0.04],
    [523, 523, 0.09, 0.13, 'triangle', 0.04],
    [659, 659, 0.18, 0.13, 'triangle', 0.04],
    [784, 1047, 0.27, 0.32, 'sine', 0.045],
  ],
  click: [[620, 500, 0, 0.045, 'triangle', 0.02]],
}

export function playSfx(name) {
  if (!isSfxEnabled()) return
  const ctx = getAudioContext()
  const notes = melodies[name]
  if (!ctx || !notes) return

  // Some browsers create the audio context suspended. Schedule sounds only once
  // the context is running, otherwise the first card flip can be silent.
  const play = () => {
    if (!isSfxEnabled() || ctx.state !== 'running') return
    const now = ctx.currentTime + 0.012
    notes.forEach(([frequency, endFrequency, offset, duration, type, volume]) => {
      tone(ctx, { frequency, endFrequency, start: now + offset, duration, type, volume })
    })
  }
  if (ctx.state === 'running') {
    play()
  } else {
    // Browsers can report other non-running states (for example, interrupted),
    // not just suspended. Always attempt to resume from the user interaction.
    ctx.resume().then(play).catch(() => {})
  }
}
