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
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {})
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
  // A quick wooden/card flick followed by a tiny click.
  flip: [
    [420, 250, 0, 0.075, 'triangle', 0.035],
    [780, 560, 0.025, 0.045, 'square', 0.018],
  ],
  // Coin-like ka-ching: bright register, metallic ping, then a small falling coin tone.
  complete: [
    [1318, 1760, 0, 0.105, 'sine', 0.045],
    [1976, 1568, 0.035, 0.16, 'sine', 0.035],
    [1046, 784, 0.105, 0.12, 'triangle', 0.025],
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
  const now = ctx.currentTime + 0.012
  notes.forEach(([frequency, endFrequency, offset, duration, type, volume]) => {
    tone(ctx, { frequency, endFrequency, start: now + offset, duration, type, volume })
  })
}
