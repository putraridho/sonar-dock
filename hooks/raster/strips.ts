// Small rasters for the chat. Solid blocks, never braille: they draw crisp in any font.

import { noise } from '../lib/math'
import { THEMES, mix, toolColor } from '../theme/palette'
import type { Mode } from '../theme/palette'
import { CellGrid } from './cells'

// A row of bars, one per column, each 0 → 1 tall, colored from dim to full.
function bars(columns: number, heights: (x: number) => number, color: number, floor: number, mode: Mode, step = 1): Uint32Array {
  const P = THEMES[mode]
  const cells = new CellGrid(columns, 1)
  for (let x = 0; x < columns; x += step) {
    const v = heights(x)
    cells.bar(x, 1 + v * 7, mix(P.screen, color, floor + (1 - floor) * v))
  }
  return cells.words
}

// A small equalizer that runs under a tool call while it works.
export function drawShimmer(columns: number, now: number, kind: string, mode: Mode): Uint32Array {
  const height = (x: number) => 0.15 + 0.85 * Math.abs(Math.sin(x * 0.5 + now / 110) * Math.sin(x * 0.17 - now / 340))
  return bars(columns, height, toolColor(THEMES[mode], kind), 0.45, mode, 2)
}

// The spinner's stream meter: one bar per sample, newest on the right, each 0 → 1.
export function drawMeter(columns: number, samples: readonly number[], kind: string, mode: Mode): Uint32Array {
  const height = (x: number) => Math.max(0, Math.min(1, samples[samples.length - columns + x] ?? 0))
  return bars(columns, height, toolColor(THEMES[mode], kind), 0.35, mode)
}

// A reply's voiceprint: a short bar signature drawn from its own text.
export function drawVoiceprint(columns: number, seed: number, mode: Mode): Uint32Array {
  const height = (x: number) => (0.35 + 0.65 * Math.sin(((x + 0.5) / columns) * Math.PI)) * (0.3 + 0.7 * noise(x * 127.1 + seed * 997 * 311.7 + 11 * 74.7))
  return bars(columns, height, THEMES[mode].claude, 0.5, mode)
}

export type TimelineCall = { s: number; e: number; k: string; f: boolean; a?: number }

/** A lane of the flight recorder: one for each main-thread kind, one per subagent. */
export type TimelineLane = { noun: string; kind: string; agent?: number }

const KIND_LANES: readonly TimelineLane[] = [
  { noun: 'shell', kind: 'bash' },
  { noun: 'edit', kind: 'edit' },
  { noun: 'read', kind: 'read' },
  { noun: 'other', kind: 'agent' },
]
const KIND_LANE_OF: Readonly<Record<string, number>> = { bash: 0, edit: 1, read: 2, search: 2 }
const MAX_AGENT_LANES = 4

// The lanes a turn's calls need: the four main-thread lanes, then one per subagent seen.
export function timelineLanes(calls: readonly TimelineCall[]): TimelineLane[] {
  const agents = [...new Set(calls.flatMap(c => (c.a === undefined ? [] : [c.a])))].sort((x, y) => x - y).slice(0, MAX_AGENT_LANES)
  return [...KIND_LANES, ...agents.map(a => ({ noun: `A${a}`, kind: 'agent', agent: a }))]
}

function laneOf(lanes: readonly TimelineLane[], call: TimelineCall): number | undefined {
  if (call.a === undefined) return KIND_LANE_OF[call.k] ?? KIND_LANES.length - 1
  const i = lanes.findIndex(l => l.agent === call.a)
  return i === -1 ? undefined : i
}

const UPPER_HALF = 0x2580 // ▀
const LOWER_HALF = 0x2584 // ▄
const DOT = 0x00b7 // ·

// A turn's flight recorder: its lanes in pairs, two to a row of half blocks, one bar per call.
export function drawTimeline(
  columns: number,
  calls: readonly TimelineCall[],
  total: number,
  mode: Mode,
  lanes: readonly TimelineLane[] = timelineLanes(calls),
): Uint32Array {
  const P = THEMES[mode]
  const bars: number[][] = lanes.map(() => new Array(columns).fill(0))
  const span = Math.max(1, total)
  for (const c of calls) {
    const lane = laneOf(lanes, c)
    if (lane === undefined) continue
    const color = c.f ? P.red : toolColor(P, c.k)
    const x0 = Math.max(0, Math.min(columns - 1, Math.floor((c.s / span) * columns)))
    const x1 = Math.max(x0, Math.min(columns - 1, Math.ceil((c.e / span) * columns) - 1))
    for (let x = x0; x <= x1; x++) bars[lane]![x] = color
  }
  const track = mix(P.screen, P.grid, 0.5)
  const rows = Math.ceil(lanes.length / 2)
  const cells = new CellGrid(columns, rows)
  for (let row = 0; row < rows; row++) {
    for (let x = 0; x < columns; x++) {
      const top = bars[row * 2]?.[x] ?? 0
      const bottom = bars[row * 2 + 1]?.[x] ?? 0
      const i = cells.at(x, row)
      if (top && bottom) cells.set(i, UPPER_HALF, top, bottom)
      else if (top) cells.set(i, UPPER_HALF, top)
      else if (bottom) cells.set(i, LOWER_HALF, bottom)
      else cells.set(i, x % 4 === 0 ? DOT : 0x20, track)
    }
  }
  return cells.words
}
