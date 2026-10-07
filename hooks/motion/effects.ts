// Text effects, each a pure function of its progress `p` (0 → 1) and the frame clock.

import { ease, noise } from '../lib/math'
import { frameOf } from './frame'

const DECODE_NOISE = '▓▒░#%&@$=+*<>/\\|01'
// Glitch noise that is never markdown syntax, so a glitched block keeps its shape.
const GLITCH_NOISE = '▓▒░█01%&@$'

export type Decoded = { done: string; head: string; hot: string; ghost: string; trail?: string }

// The decrypt: each character flickers through noise, then locks in, left to right.
// done: locked text · hot: characters still flickering · trail: the comet's tail · head: the write head · ghost: dim static ahead.
export function decode(text: string, p: number, frame = frameOf()): Decoded {
  if (p >= 1) return { done: text, head: '', hot: '', ghost: '' }
  const n = text.length
  const front = Math.floor(ease(p) * (n + 1))
  const scramble = (i: number) => (text[i] === ' ' || text[i] === '\n' ? text[i]! : DECODE_NOISE[(i * 7 + frame * 13) % DECODE_NOISE.length]!)
  const band = 8
  const done = text.slice(0, Math.max(0, front - band))
  let hot = ''
  for (let i = Math.max(0, front - band); i < Math.min(n, front); i++) hot += scramble(i)
  const tail = Math.min(3, hot.length)
  const trail = front < n && tail > 0 ? '░▒▓'.slice(3 - tail) : ''
  if (trail) hot = hot.slice(0, hot.length - tail)
  const head = front < n ? '█' : ''
  let ghost = ''
  for (let i = front + 1; i < n; i++) ghost += text[i] === '\n' ? '\n' : text[i] === ' ' ? ' ' : (i + frame) % 3 === 0 ? '░' : '·'
  return trail ? { done, head, hot, ghost, trail } : { done, head, hot, ghost }
}

// A short word mid-decode, kept at its own width: a pill's label.
export function decodeWord(word: string, p: number): string {
  const d = decode(word, p)
  return (d.done + d.hot + d.head).padEnd(word.length).slice(0, word.length)
}

export type Segment = { text: string; isHot: boolean }

// A streamed line as runs of settled and still-glitching text. ages[i] is how far character i
// is through its settling (0 just arrived, 1 settled); fresh letters and digits flicker to noise.
export function glitchSegments(text: string, ages: readonly number[], frame = frameOf()): Segment[] {
  const out: Segment[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    const p = Math.min(1, ages[i] ?? 1)
    const r = noise(i * 12.9898 + frame * 78.233)
    const isHot = p < 1 && /[A-Za-z0-9]/.test(c) && r < 0.7 * Math.pow(1 - p, 1.2)
    const ch = isHot ? GLITCH_NOISE[Math.floor(r * 997) % GLITCH_NOISE.length]! : c
    const last = out[out.length - 1]
    if (last && last.isHot === isHot) last.text += ch
    else out.push({ text: ch, isHot })
  }
  return out
}

// A glint: a band of light that crosses a line once.
export function glint(text: string, p: number): [string, string, string] {
  if (p >= 1 || p <= 0) return [text, '', '']
  const width = 6
  const at = Math.round((text.length + width) * p) - width
  const a = Math.max(0, at)
  const b = Math.max(0, Math.min(text.length, at + width))
  return [text.slice(0, a), text.slice(a, b), text.slice(b)]
}

// Typing: the text so far and a cursor.
export function typed(text: string, p: number): string {
  if (p >= 1) return text
  return `${text.slice(0, Math.ceil(text.length * ease(p)))}▍`
}

// The beat that scrambling characters pulse to, 0 → 1 → 0, several times a second.
export function beat(nowMs = Date.now()): number {
  return (Math.sin(nowMs / 85) + 1) / 2
}

// A pill powering on: it strobes, one frame on and one off, before it holds its color.
export function strobe(on: string, off: string, p: number, frame = frameOf()): string {
  if (p >= 0.35) return on
  return frame % 2 === 0 ? on : off
}

// Glitch: while a row decodes it sometimes jumps sideways for a frame.
export function jitter(id: string, p: number, frame = frameOf()): number {
  if (p >= 0.75) return 0
  const r = noise(frame * 12.9898 + id.length * 78.233)
  return r > 0.78 ? (r > 0.93 ? 2 : 1) : 0
}
