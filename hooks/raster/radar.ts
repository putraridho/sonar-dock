// The radar: a pure function from (size, time, contacts, threat) to cells. A sweeping beam over
// range rings, a blip per tool call, a lock on the newest, and a signal strip underneath.

import { ALERT_LEVEL } from '../domain/threat'
import { TOOLS } from '../domain/tools'
import type { ToolKind } from '../domain/tools'
import { TAU, noise } from '../lib/math'
import { THEMES, mix, toolColor } from '../theme/palette'
import type { Mode } from '../theme/palette'
import { CellGrid, DEFAULT } from './cells'
import { DotCanvas } from './dots'

export type Blip = {
  angle: number
  radius: number
  kind: ToolKind
  isFailed: boolean
  glyph: string
  born: number
  isLive: boolean
  tag?: string
  /** The subagent that made the call; absent on the main loop. */
  agent?: number
}

const BLIP_LIFE_MS = 60_000
const SWEEP_RAD_PER_S = 1.4
const LEGEND: readonly ToolKind[] = ['bash', 'edit', 'read', 'search', 'agent', 'web']

export const SCOPE_ROWS = 16
export const SIGNAL_ROWS = 4
export const RADAR_ROWS = SCOPE_ROWS + SIGNAL_ROWS

export function radarSize(bodyColumns: number): { columns: number; rows: number } {
  return { columns: Math.max(34, Math.min(80, bodyColumns)), rows: RADAR_ROWS }
}

export function sweepAngle(now: number): number {
  return ((now / 1000) * SWEEP_RAD_PER_S) % TAU
}

// How far behind the beam an angle lies, 0 → TAU.
function behind(sweep: number, angle: number): number {
  return (((sweep - angle) % TAU) + TAU) % TAU
}

function dotNoise(x: number, y: number, seed: number): number {
  return noise(x * 127.1 + y * 311.7 + seed * 74.7)
}

type Spot = { x: number; y: number; blip: Blip; heat: number }

export function drawRadar(columns: number, rows: number, now: number, blips: readonly Blip[], threat: number, mode: Mode = 'dark'): Uint32Array {
  const P = THEMES[mode]
  const bg = P.isClear ? DEFAULT : P.screen
  const colorOf = (b: Blip) => (b.isFailed ? P.red : toolColor(P, b.kind))
  const dots = new DotCanvas(columns, rows)
  const W = dots.width
  const H = dots.height
  const scopeH = Math.min(H, SCOPE_ROWS * 4)
  const cx = W / 2
  const cy = scopeH / 2
  const R = Math.min(cx - 8, cy - 6)
  const sweep = sweepAngle(now)
  const pulse = (Math.sin(now / 180) + 1) / 2
  const isAlert = threat >= ALERT_LEVEL
  const beam = isAlert ? mix(P.accent, P.red, 0.75) : P.accent
  const grid = isAlert ? mix(P.grid, P.red, 0.3 + 0.5 * pulse) : P.grid
  const live = blips.filter(b => now - b.born <= BLIP_LIFE_MS)

  // Sweep trail: a shimmering phosphor wedge behind the beam, densest at its edge.
  const seed = Math.floor(now / 110)
  for (let y = 0; y < scopeH; y++) {
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x - cx, y - cy)
      if (r > R - 0.5 || r < 1) continue
      const d = behind(sweep, Math.atan2(y - cy, x - cx))
      if (d > 1.8) continue
      const p = Math.pow(1 - d / 1.8, 2.6)
      if (dotNoise(x, y, seed) < 0.06 + p * 0.85) dots.plot(x, y, 0.1 + 0.7 * p, beam)
    }
  }

  // Grid: rim, range rings, crosshair, bearing ticks, a counter-rotating outer ring.
  dots.arc(cx, cy, R, 0.65, grid)
  dots.arc(cx, cy, R * 0.66, 0.35, grid, 48)
  dots.arc(cx, cy, R * 0.33, 0.35, grid, 24)
  dots.arc(cx, cy, R + 5, 0.22, grid, 12, -now / 2600)
  for (let t = -R; t <= R; t += 3) {
    dots.plot(cx + t, cy, 0.28, grid)
    dots.plot(cx, cy + t, 0.28, grid)
  }
  for (let deg = 0; deg < 360; deg += 30) {
    const a = (deg / 360) * TAU
    const long = deg % 90 === 0 ? 3 : 1.5
    for (let r = R + 1; r <= R + long; r += 0.5) dots.plot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.5, grid)
  }
  dots.plot(cx, cy, 1, mix(beam, P.hi, 0.5 * pulse))

  // The beam, with a bright leading edge.
  for (let r = 0; r <= R; r += 0.4) {
    dots.plot(cx + Math.cos(sweep) * r, cy + Math.sin(sweep) * r, 1, mix(beam, P.hi, 0.45))
    dots.plot(cx + Math.cos(sweep - 0.05) * r, cy + Math.sin(sweep - 0.05) * r, 0.75, beam)
  }

  // Contacts: brightest as the beam passes, while their call runs, and when new.
  const spots: Spot[] = live.map(blip => {
    const age = now - blip.born
    const x = cx + Math.cos(blip.angle) * blip.radius * R
    const y = cy + Math.sin(blip.angle) * blip.radius * R
    const fade = 1 - age / BLIP_LIFE_MS
    const d = behind(sweep, blip.angle)
    const flare = d < 1.2 ? Math.pow(1 - d / 1.2, 1.5) : 0
    const throb = blip.isLive ? 0.6 + 0.4 * Math.sin(now / 110) : 0
    const fresh = age < 1500 ? 1 - age / 1500 : 0
    const heat = Math.max(flare, throb, fresh)
    const i = Math.max(0.5, (0.55 + 0.45 * heat) * (0.6 + 0.4 * fade))
    const size = 1.5 + 0.8 * heat
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) if (Math.hypot(ox, oy) <= size) dots.plot(x + ox, y + oy, i, colorOf(blip))
    }
    if (fresh > 0) dots.arc(x, y, 2 + 9 * (1 - fresh), 0.25 + 0.6 * fresh, colorOf(blip))
    return { x, y, blip, heat }
  })

  // Target lock: brackets snap in around the newest contact.
  const target = spots[spots.length - 1]
  if (target) {
    const close = Math.min(1, (now - target.blip.born) / 700)
    const half = 12 - 6.5 * (1 - Math.pow(1 - close, 3))
    const arm = 2.5
    const i = close < 1 ? 1 : 0.55 + 0.45 * pulse
    const c = mix(colorOf(target.blip), P.hi, 0.3)
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const x = target.x + sx * half
      const y = target.y + sy * half
      dots.line(x, y, x - sx * arm, y, i, c)
      dots.line(x, y, x, y - sy * arm, i, c)
    }
  }

  // The signal strip: activity as a scrolling oscilloscope trace.
  const stripTop = scopeH
  const stripH = H - scopeH
  const hasStrip = stripH >= 8
  if (hasStrip) {
    const mid = stripTop + stripH / 2
    const amp = stripH / 2 - 1.5
    const span = 30_000
    let prev: number | null = null
    for (let x = 0; x < W; x++) {
      const t = now - ((W - 1 - x) / (W - 1)) * span
      let v = 0.05 * Math.sin(t / 140) + 0.04 * (dotNoise(Math.floor(t / 90), 7, 0) - 0.5)
      for (const b of live) {
        const dt = (t - b.born) / 700
        if (dt > -3 && dt < 3) v += Math.exp(-dt * dt) * Math.sin(t / 22 + b.angle * 9) * (0.75 + 0.25 * b.radius)
      }
      const y = mid - Math.max(-1, Math.min(1, v)) * amp
      const edge = x / (W - 1)
      if (prev !== null) dots.line(x - 1, prev, x, y, 0.35 + 0.6 * edge, mix(P.grid, beam, 0.35 + 0.65 * edge))
      prev = y
    }
    for (let x = 0; x < W; x += 4) dots.plot(x, mid, 0.2, grid)
  }

  const cells = new CellGrid(columns, rows, bg)
  dots.fold(cells, ({ best, color }) => [mix(P.screen, color, P.floor + (1 - P.floor) * best), bg])
  const write = (x: number, y: number, text: string, fg: number) => cells.write(x, y, text, fg, bg)

  // Tags beside the three newest contacts.
  for (const spot of spots.slice(-3)) {
    if (!spot.blip.tag) continue
    const col = Math.round(spot.x / 2) + 2
    const tag = spot.blip.tag.slice(0, 14)
    const x = col + tag.length < columns ? col : Math.round(spot.x / 2) - 2 - tag.length
    write(x, Math.round(spot.y / 4), tag, mix(P.screen, colorOf(spot.blip), Math.max(P.floor + 0.15, 0.55) + 0.45 * spot.heat))
  }

  // Readouts in the margins, where the scope leaves room.
  const scopeLeft = Math.floor((cx - R - 8) / 2)
  if (scopeLeft >= 9) {
    const count = (n: number) => String(n).padStart(2, '0')
    write(1, 1, 'BEARING', P.label)
    write(1, 2, `${String(Math.round((sweep / TAU) * 360) % 360).padStart(3, '0')}°`, P.accent)
    write(1, 4, 'CONTACTS', P.label)
    write(1, 5, count(live.length), P.accent)
    write(1, 7, 'ACTIVE', P.label)
    write(1, 8, count(live.filter(b => b.isLive).length), P.accent)
    write(1, 10, 'LOCK', P.label)
    write(1, 11, target?.blip.tag ? target.blip.tag.slice(0, scopeLeft - 1) : '——', target ? mix(colorOf(target.blip), P.hi, 0.2) : P.label)
    write(1, 13, isAlert ? '▲ ALERT' : 'TRACKING', isAlert ? mix(P.red, P.hi, 0.3 * pulse) : P.label)
    const lx = columns - 7
    LEGEND.forEach((kind, n) => {
      write(lx, 1 + n * 2, '⣿', P.tools[kind])
      write(lx + 2, 1 + n * 2, TOOLS[kind].tag, P.label)
    })
  }
  if (hasStrip) write(1, Math.floor(stripTop / 4), 'SIGNAL', P.label)

  return cells.words
}
