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

// Locally generated UI sounds; no audio files or external requests.
function rewardWhoosh(ctx, start, volume = 0.035) {
  // A subtle airy sweep to accompany the reward artwork appearing.
  const duration = 0.28
  const length = Math.ceil(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate
    const envelope = Math.sin(Math.PI * t / duration) ** 1.4
    data[i] = (Math.random() * 2 - 1) * envelope
  }
  const source = ctx.createBufferSource()
  const highPass = ctx.createBiquadFilter()
  const lowPass = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  source.buffer = buffer
  highPass.type = 'highpass'
  highPass.frequency.setValueAtTime(420, start)
  highPass.frequency.exponentialRampToValueAtTime(1100, start + duration * 0.72)
  lowPass.type = 'lowpass'
  lowPass.frequency.setValueAtTime(1800, start)
  lowPass.frequency.exponentialRampToValueAtTime(3600, start + duration * 0.72)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(volume, start + 0.07)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(highPass)
  highPass.connect(lowPass)
  lowPass.connect(gain)
  gain.connect(ctx.destination)
  source.start(start)
  source.stop(start + duration + 0.01)
}

function cardFlip(ctx, start, volume = 0.055) {
  // A short, dry shuffle: several fast paper/card edge strokes with a soft
  // broadband rasp. The little pulses make it feel like cards sliding past
  // one another rather than a single whoosh or a pitched game sound.
  const duration = 0.19
  const length = Math.ceil(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate
    const fadeIn = Math.min(1, t / 0.012)
    const fadeOut = Math.max(0, 1 - t / duration)
    data[i] = (Math.random() * 2 - 1) * fadeIn * fadeOut
  }

  const source = ctx.createBufferSource()
  const highPass = ctx.createBiquadFilter()
  const body = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  source.buffer = buffer
  highPass.type = 'highpass'
  highPass.frequency.setValueAtTime(700, start)
  body.type = 'bandpass'
  body.frequency.setValueAtTime(2300, start)
  body.frequency.exponentialRampToValueAtTime(1250, start + duration)
  body.Q.setValueAtTime(0.65, start)

  gain.gain.setValueAtTime(0.0001, start)
  // Four quick, uneven strokes imitate the edges of a small stack of cards.
  const pulses = [
    [0.000, 0.52],
    [0.038, 0.92],
    [0.078, 0.68],
    [0.119, 0.78],
    [0.158, 0.34],
  ]
  for (const [offset, strength] of pulses) {
    gain.gain.setValueAtTime(Math.max(0.0001, volume * strength), start + offset)
    gain.gain.setValueAtTime(Math.max(0.0001, volume * strength * 0.58), start + offset + 0.018)
  }
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(highPass)
  highPass.connect(body)
  body.connect(gain)
  gain.connect(ctx.destination)
  source.start(start)
  source.stop(start + duration + 0.005)
}
const melodies = {
  // A clean, short confirmation ding rather than a retro game jingle.
  complete: [
    [1174.66, 1174.66, 0, 0.095, 'sine', 0.055],
    [1567.98, 1567.98, 0.025, 0.12, 'sine', 0.032],
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

export function playSfx(name, count = 1) {
  if (!isSfxEnabled()) return
  const ctx = getAudioContext()
  const notes = melodies[name]
  if (!ctx || (!notes && name !== 'flip' && name !== 'reward')) return

  // Request resume synchronously from the user's interaction. If the browser
  // suspended audio, schedule notes only once the context is actually running.
  const schedule = () => {
    if (!isSfxEnabled() || ctx.state !== 'running') return
    const now = ctx.currentTime + 0.012
    try {
      if (name === 'reward') {
        rewardWhoosh(ctx, now)
      } else if (name === 'flip') {
        // Each revealed card gets its own lightly staggered sound, so a batch
        // of three cards is heard as three overlapping physical flips.
        const voices = Math.max(1, Math.min(12, Math.floor(Number(count) || 1)))
        // Spread each card shuffle across the reveal beat so individual flips
        // are easier to distinguish when several tiles appear together.
        const spacing = voices > 1 ? Math.min(0.105, 0.42 / (voices - 1)) : 0
        for (let i = 0; i < voices; i++) cardFlip(ctx, now + i * spacing, 0.055 / Math.sqrt(Math.max(1, voices * 0.55)))
      } else {
        notes.forEach(([frequency, endFrequency, offset, duration, type, volume]) => {
          tone(ctx, { frequency, endFrequency, start: now + offset, duration, type, volume })
        })
      }
    } catch {
      // A browser may interrupt audio while the page is backgrounded.
    }
  }
  if (ctx.state === 'running') {
    schedule()
    return
  }
  ctx.resume().then(schedule).catch(() => {})
}
