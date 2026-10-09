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
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.012, duration * 0.25))
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.015)
}

const melodies = {
  reveal: [[520, 680, 0, 0.09], [760, 920, 0.065, 0.11]],
  complete: [[523, 523, 0, 0.12], [659, 659, 0.075, 0.12], [784, 988, 0.15, 0.22]],
  boss: [[392, 392, 0, 0.13], [523, 523, 0.09, 0.13], [659, 659, 0.18, 0.13], [784, 1047, 0.27, 0.32]],
  click: [[620, 500, 0, 0.045]],
}

export function playSfx(name) {
  if (!isSfxEnabled()) return
  const ctx = getAudioContext()
  const notes = melodies[name]
  if (!ctx || !notes) return
  const now = ctx.currentTime + 0.012
  notes.forEach(([frequency, endFrequency, offset, duration], index) => {
    tone(ctx, { frequency, endFrequency, start: now + offset, duration, volume: name === 'click' ? 0.025 : index === notes.length - 1 ? 0.065 : 0.045 })
  })
}
