// The AI core above the prompt: an oscilloscope trace whose shape and color say what Claude is
// doing, scrolling right to left. Each sample keeps the state it was drawn in as it scrolls.

import { smooth } from '../lib/math'
import { THEMES, mix, toolColor } from '../theme/palette'
import type { Mode } from '../theme/palette'
import { CellGrid } from './cells'
import { DotCanvas } from './dots'

export type Activity = 'idle' | 'thinking' | 'tool' | 'responding'

// A state the core was in from `at` on, in the same clock as drawCore's `now`.
export type CoreSpan = { at: number; activity: Activity; kind: string }

export const CORE_ROWS = 3

// The trace moves one sample per this many ms, so sample x entered on the right this long ago.
const MS_PER_SAMPLE = 25

const wrap = (u: number, period: number) => (((u % period) + period) % period) - period / 2

// The trace's height at sample `x` of `n`, -1 to 1, at time `t`, per state.
export function coreSignal(x: number, n: number, t: number, activity: Activity): number {
  const u = x + t / MS_PER_SAMPLE
  const edge = smooth(x / (n * 0.04)) * smooth((n - 1 - x) / (n * 0.04))
  return Math.max(-1, Math.min(1, WAVES[activity](u, n))) * edge
}

const WAVES: Readonly<Record<Activity, (u: number, n: number) => number>> = {
  // A slow, rolling thought.
  thinking: u => 0.62 * Math.sin(u * 0.07) + 0.33 * Math.sin(u * 0.17 + 1.3) * Math.sin(u * 0.023),
  // Syllables: bursts of fast oscillation.
  responding: u => Math.max(0, Math.sin(u * 0.045)) * (0.6 + 0.4 * Math.sin(u * 0.011)) * Math.sin(u * 0.62) * 0.95,
  // A flat line with a sharp spike per call.
  tool: u => {
    const burst = wrap(u, 70)
    return 0.04 * Math.sin(u * 0.3) + Math.exp(-(burst * burst) / 10) * Math.sin(u * 0.9) * 1.1
  },
  // A slow heartbeat.
  idle: (u, n) => {
    const d = wrap(u, 160) / (n * 0.035)
    return 0.04 * Math.sin(u * 0.09) + Math.exp(-d * d) * Math.sin(u * 0.5) * 0.45
  },
}

// `history` runs oldest first and ends with the current state; without it the whole trace is the current one.
export function drawCore(
  columns: number,
  now: number,
  activity: Activity,
  kind: string,
  mode: Mode,
  label: string,
  note: string,
  history: readonly CoreSpan[] = [],
): Uint32Array {
  const P = THEMES[mode]
  const colorOf = (a: Activity, k: string) => (a === 'tool' ? toolColor(P, k) : a === 'idle' ? P.accent : P.claude)
  const room = Math.max(8, columns - Math.max(label.length, note.length) - 3)
  const dots = new DotCanvas(room, CORE_ROWS)
  const W = dots.width
  const mid = (dots.height - 1) / 2
  const amp = dots.height / 2 - 0.6
  for (let x = 0; x < W; x += 4) dots.plot(x, mid, 0.18) // the zero line, faint

  const spans: readonly CoreSpan[] = history.length > 0 ? history : [{ at: -Infinity, activity, kind }]
  const hue = new Uint32Array(W)
  let span = 0
  let prev: number | null = null
  for (let x = 0; x < W; x++) {
    const entered = now - (W - 1 - x) * MS_PER_SAMPLE
    while (span < spans.length - 1 && spans[span + 1]!.at <= entered) span++
    const s = spans[span]!
    hue[x] = colorOf(s.activity, s.kind)
    const y = mid - coreSignal(x, W, now, s.activity) * amp
    const fresh = 0.35 + 0.65 * (x / (W - 1)) // newest at the right, brightest
    if (prev !== null) {
      const steps = Math.max(1, Math.ceil(Math.abs(y - prev) * 2))
      for (let k = 0; k <= steps; k++) dots.plot(x - 1 + k / steps, prev + ((y - prev) * k) / steps, fresh)
    } else dots.plot(x, y, fresh)
    prev = y
  }

  const cells = new CellGrid(columns, CORE_ROWS)
  dots.fold(cells, ({ column, best }) => [
    best < 0.2 ? mix(P.screen, P.grid, 0.7) : mix(P.screen, hue[column * 2 + 1]!, P.floor + (1 - P.floor) * best),
    cells.fill,
  ])
  cells.write(room + 3, 0, label, colorOf(activity, kind))
  cells.write(room + 3, 1, note, P.label)
  return cells.words
}
