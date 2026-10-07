// The radar: a pure function from (size, time, contacts, threat) to Raster cells.
// Drawn on a braille dot grid (2x4 dots per cell) so lines stay thin and round.

export type Blip = {
  angle: number
  radius: number
  kind: string
  isFailed: boolean
  glyph: string
  born: number
  isLive: boolean
  tag?: string
}

const DEFAULT = 0x01000000
export type Mode = 'light' | 'dark'

export type Palette = {
  screen: number
  accent: number
  grid: number
  label: number
  red: number
  hi: number
  floor: number
  isClear: boolean
  tools: Record<string, number>
}

export const PALETTES: Record<Mode, Palette> = {
  dark: {
    screen: 0x0b1411,
    accent: 0x3dffa2,
    grid: 0x2a7a5c,
    label: 0x4f8f78,
    red: 0xff3b55,
    hi: 0xffffff,
    floor: 0.3,
    isClear: false,
    tools: {
      bash: 0xffc35a,
      edit: 0xff7ad9,
      read: 0x6fd8ff,
      search: 0x5cf0d0,
      agent: 0xc3a6ff,
      web: 0x7aa8ff,
      mcp: 0xffe27a,
      other: 0xd8e6e0,
    },
  },
  light: {
    screen: 0xf6f8f7,
    accent: 0x00663f,
    grid: 0x6b9484,
    label: 0x3f574d,
    red: 0xc0102c,
    hi: 0x001a10,
    floor: 0.62,
    isClear: true,
    tools: {
      bash: 0xa65c00,
      edit: 0xa8127a,
      read: 0x0a5fa8,
      search: 0x00745f,
      agent: 0x5b2fc0,
      web: 0x1f45b8,
      mcp: 0x7a6200,
      other: 0x3a4a43,
    },
  },
}

export function hexOf(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function toolHex(mode: Mode, kind: string): string {
  return hexOf(PALETTES[mode].tools[kind] ?? PALETTES[mode].tools.other!)
}
const BLIP_LIFE_MS = 60_000
const TAU = Math.PI * 2

export const TOOL_STYLE: Record<string, { glyph: string; color: number; hex: string; label: string }> = {
  bash: { glyph: 'B', color: 0xffc35a, hex: '#ffc35a', label: 'BASH' },
  edit: { glyph: 'E', color: 0xff7ad9, hex: '#ff7ad9', label: 'EDIT' },
  read: { glyph: 'R', color: 0x6fd8ff, hex: '#6fd8ff', label: 'READ' },
  search: { glyph: 'S', color: 0x5cf0d0, hex: '#5cf0d0', label: 'SCAN' },
  agent: { glyph: 'A', color: 0xc3a6ff, hex: '#c3a6ff', label: 'AGNT' },
  web: { glyph: 'W', color: 0x7aa8ff, hex: '#7aa8ff', label: 'WEB ' },
  mcp: { glyph: 'M', color: 0xffe27a, hex: '#ffe27a', label: 'LINK' },
  other: { glyph: 'T', color: 0xd8e6e0, hex: '#d8e6e0', label: 'TOOL' },
}

export function toolKind(tool: string): keyof typeof TOOL_STYLE {
  if (tool === 'Bash') return 'bash'
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return 'edit'
  if (tool === 'Read') return 'read'
  if (tool === 'Grep' || tool === 'Glob') return 'search'
  if (tool === 'Agent' || tool === 'Task') return 'agent'
  if (tool === 'WebFetch' || tool === 'WebSearch') return 'web'
  if (tool.startsWith('mcp__')) return 'mcp'
  return 'other'
}

function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t))
  const ch = (shift: number) => {
    const x = (a >> shift) & 0xff
    const y = (b >> shift) & 0xff
    return Math.round(x + (y - x) * k) << shift
  }
  return ch(16) | ch(8) | ch(0)
}

function hash(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return n - Math.floor(n)
}

function behind(sweep: number, angle: number): number {
  return (((sweep - angle) % TAU) + TAU) % TAU
}

// Braille dot bits by (column, row) inside a cell.
const BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
] as const

export const SCOPE_ROWS = 16
export const SIGNAL_ROWS = 4
export const RADAR_ROWS = SCOPE_ROWS + SIGNAL_ROWS

export function radarSize(bodyColumns: number): { columns: number; rows: number } {
  return { columns: Math.max(34, Math.min(80, bodyColumns)), rows: RADAR_ROWS }
}

export function sweepAngle(now: number): number {
  return ((now / 1000) * 1.4) % TAU
}

export function drawRadar(
  columns: number,
  rows: number,
  now: number,
  blips: readonly Blip[],
  threat: number,
  mode: Mode = 'dark',
): Uint32Array {
  const P = PALETTES[mode]
  const SCREEN = P.screen
  const PHOSPHOR = P.accent
  const GRID = P.grid
  const LABEL = P.label
  const RED = P.red
  const HI = P.hi
  const BG = P.isClear ? DEFAULT : SCREEN
  const colorOf = (b: Blip) => (b.isFailed ? RED : (P.tools[b.kind] ?? P.tools.other!))
  const W = columns * 2
  const H = rows * 4
  const level = new Float32Array(W * H)
  const hue = new Uint32Array(W * H)
  const scopeH = Math.min(H, SCOPE_ROWS * 4)
  const cx = W / 2
  const cy = scopeH / 2
  const R = Math.min(cx - 8, cy - 6)
  const sweep = sweepAngle(now)
  const pulse = (Math.sin(now / 180) + 1) / 2
  const isAlert = threat >= 3
  const beam = isAlert ? mix(PHOSPHOR, RED, 0.75) : PHOSPHOR
  const grid = isAlert ? mix(GRID, RED, 0.3 + 0.5 * pulse) : GRID
  const live = blips.filter(b => now - b.born <= BLIP_LIFE_MS)

  const plot = (x: number, y: number, i: number, color: number) => {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= W || py >= H) return
    const k = py * W + px
    if (i > (level[k] ?? 0)) {
      level[k] = i
      hue[k] = color
    }
  }
  const arc = (ox: number, oy: number, r: number, i: number, color: number, dash = 0, phase = 0) => {
    const steps = Math.max(24, Math.ceil(TAU * r * 1.6))
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * TAU + phase
      if (dash && Math.floor((s / steps) * dash) % 2 === 1) continue
      plot(ox + Math.cos(a) * r, oy + Math.sin(a) * r, i, color)
    }
  }
  const line = (x0: number, y0: number, x1: number, y1: number, i: number, color: number) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)
    for (let s = 0; s <= n; s++) plot(x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n, i, color)
  }

  // Sweep trail: a shimmering phosphor wedge behind the beam, densest at its edge.
  const seed = Math.floor(now / 110)
  for (let y = 0; y < scopeH; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx
      const dy = y - cy
      const r = Math.hypot(dx, dy)
      if (r > R - 0.5 || r < 1) continue
      const d = behind(sweep, Math.atan2(dy, dx))
      if (d > 1.8) continue
      const p = Math.pow(1 - d / 1.8, 2.6)
      if (hash(x, y, seed) < 0.06 + p * 0.85) plot(x, y, 0.1 + 0.7 * p, beam)
    }
  }

  // Grid: rim, range rings, crosshair, bearing ticks, a counter-rotating outer ring.
  arc(cx, cy, R, 0.65, grid)
  arc(cx, cy, R * 0.66, 0.35, grid, 48)
  arc(cx, cy, R * 0.33, 0.35, grid, 24)
  arc(cx, cy, R + 5, 0.22, grid, 12, -now / 2600)
  for (let t = -R; t <= R; t += 3) {
    plot(cx + t, cy, 0.28, grid)
    plot(cx, cy + t, 0.28, grid)
  }
  for (let deg = 0; deg < 360; deg += 30) {
    const a = (deg / 360) * TAU
    const long = deg % 90 === 0 ? 3 : 1.5
    for (let r = R + 1; r <= R + long; r += 0.5) {
      plot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.5, grid)
    }
  }
  plot(cx, cy, 1, mix(beam, HI, 0.5 * pulse))

  // The beam, with a bright leading edge.
  for (let r = 0; r <= R; r += 0.4) {
    plot(cx + Math.cos(sweep) * r, cy + Math.sin(sweep) * r, 1, mix(beam, HI, 0.45))
    plot(cx + Math.cos(sweep - 0.05) * r, cy + Math.sin(sweep - 0.05) * r, 0.75, beam)
  }

  // Contacts.
  const spots: { x: number; y: number; blip: Blip; heat: number }[] = []
  for (const blip of live) {
    const age = now - blip.born
    const bx = cx + Math.cos(blip.angle) * blip.radius * R
    const by = cy + Math.sin(blip.angle) * blip.radius * R
    const fade = 1 - age / BLIP_LIFE_MS
    const d = behind(sweep, blip.angle)
    const flare = d < 1.2 ? Math.pow(1 - d / 1.2, 1.5) : 0
    const throb = blip.isLive ? 0.6 + 0.4 * Math.sin(now / 110) : 0
    const fresh = age < 1500 ? 1 - age / 1500 : 0
    const heat = Math.max(flare, throb, fresh)
    const i = Math.max(0.5, (0.55 + 0.45 * heat) * (0.6 + 0.4 * fade))
    const size = 1.5 + 0.8 * heat
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        if (Math.hypot(ox, oy) <= size) plot(bx + ox, by + oy, i, colorOf(blip))
      }
    }
    if (fresh > 0) arc(bx, by, 2 + 9 * (1 - fresh), 0.25 + 0.6 * fresh, colorOf(blip))
    spots.push({ x: bx, y: by, blip, heat })
  }

  // Target lock: brackets snap in around the newest contact.
  const target = spots[spots.length - 1]
  if (target) {
    const age = now - target.blip.born
    const close = Math.min(1, age / 700)
    const half = 12 - 6.5 * (1 - Math.pow(1 - close, 3))
    const arm = 2.5
    const i = close < 1 ? 1 : 0.55 + 0.45 * pulse
    const c = mix(colorOf(target.blip), HI, 0.3)
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const x = target.x + sx * half
      const y = target.y + sy * half
      line(x, y, x - sx * arm, y, i, c)
      line(x, y, x, y - sy * arm, i, c)
    }
  }

  // The signal strip: activity as a scrolling oscilloscope trace.
  const stripTop = scopeH
  const stripH = H - scopeH
  if (stripH >= 8) {
    const mid = stripTop + stripH / 2
    const amp = stripH / 2 - 1.5
    const span = 30_000
    let prev: number | null = null
    for (let x = 0; x < W; x++) {
      const t = now - ((W - 1 - x) / (W - 1)) * span
      let v = 0.05 * Math.sin(t / 140) + 0.04 * (hash(Math.floor(t / 90), 7, 0) - 0.5)
      for (const b of live) {
        const dt = (t - b.born) / 700
        if (dt > -3 && dt < 3) v += Math.exp(-dt * dt) * Math.sin(t / 22 + b.angle * 9) * (0.75 + 0.25 * b.radius)
      }
      v = Math.max(-1, Math.min(1, v))
      const y = mid - v * amp
      const edge = x / (W - 1)
      const color = mix(GRID, beam, 0.35 + 0.65 * edge)
      if (prev !== null) line(x - 1, prev, x, y, 0.35 + 0.6 * edge, color)
      prev = y
    }
    for (let x = 0; x < W; x += 4) plot(x, mid, 0.2, grid)
  }

  // Fold the dot grid into braille cells.
  const out = new Uint32Array(columns * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      let bits = 0
      let best = 0
      let color = 0
      for (let sx = 0; sx < 2; sx++) {
        for (let sy = 0; sy < 4; sy++) {
          const k = (row * 4 + sy) * W + col * 2 + sx
          const i = level[k] ?? 0
          if (i > 0.05) bits |= BITS[sx]![sy]!
          if (i > best) {
            best = i
            color = hue[k] ?? 0
          }
        }
      }
      const o = (row * columns + col) * 3
      out[o] = bits ? 0x2800 + bits : 0x20
      out[o + 1] = bits ? mix(SCREEN, color, P.floor + (1 - P.floor) * best) : DEFAULT
      out[o + 2] = BG
    }
  }

  const write = (x: number, y: number, text: string, color: number) => {
    for (let k = 0; k < text.length; k++) {
      if (x + k < 0 || x + k >= columns || y < 0 || y >= rows) continue
      const o = (y * columns + x + k) * 3
      out[o] = text.codePointAt(k) ?? 0x20
      out[o + 1] = color
      out[o + 2] = BG
    }
  }

  // Tags beside the three newest contacts.
  for (const spot of spots.slice(-3)) {
    if (!spot.blip.tag) continue
    const col = Math.round(spot.x / 2) + 2
    const row = Math.round(spot.y / 4)
    const tag = spot.blip.tag.slice(0, 14)
    const x = col + tag.length < columns ? col : Math.round(spot.x / 2) - 2 - tag.length
    write(x, row, tag, mix(SCREEN, colorOf(spot.blip), Math.max(P.floor + 0.15, 0.55) + 0.45 * spot.heat))
  }

  // Readouts in the margins, where the scope leaves room.
  const scopeLeft = Math.floor((cx - R - 8) / 2)
  if (scopeLeft >= 9) {
    const bearing = String(Math.round((sweep / TAU) * 360) % 360).padStart(3, '0')
    write(1, 1, 'BEARING', LABEL)
    write(1, 2, `${bearing}°`, PHOSPHOR)
    write(1, 4, 'CONTACTS', LABEL)
    write(1, 5, String(live.length).padStart(2, '0'), PHOSPHOR)
    write(1, 7, 'ACTIVE', LABEL)
    write(1, 8, String(live.filter(b => b.isLive).length).padStart(2, '0'), PHOSPHOR)
    write(1, 10, 'LOCK', LABEL)
    write(
      1,
      11,
      target?.blip.tag ? target.blip.tag.slice(0, scopeLeft - 1) : '——',
      target ? mix(colorOf(target.blip), HI, 0.2) : LABEL,
    )
    write(1, 13, isAlert ? '▲ ALERT' : 'TRACKING', isAlert ? mix(RED, HI, 0.3 * pulse) : LABEL)

    const legend = ['bash', 'edit', 'read', 'search', 'agent', 'web'] as const
    const lx = columns - 7
    legend.forEach((kind, n) => {
      const style = TOOL_STYLE[kind]!
      write(lx, 1 + n * 2, '⣿', P.tools[kind] ?? LABEL)
      write(lx + 2, 1 + n * 2, style.label.trim(), LABEL)
    })
  }
  if (stripH >= 8) write(1, Math.floor(stripTop / 4), 'SIGNAL', LABEL)

  return out
}

export function encodeCells(words: Uint32Array): string {
  const bytes = new Uint8Array(words.buffer, words.byteOffset, words.byteLength)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// ── Small rasters for the chat. Solid blocks, never braille: they draw crisp in any font. ──

const BLOCKS = [0x20, 0x2581, 0x2582, 0x2583, 0x2584, 0x2585, 0x2586, 0x2587, 0x2588] // ' ' ▁ … █

function cell(out: Uint32Array, i: number, glyph: number, fg: number, bg = DEFAULT) {
  out[i * 3] = glyph
  out[i * 3 + 1] = fg
  out[i * 3 + 2] = bg
}

// Bars rising from the bottom of a `rows`-tall strip: height in eighths of a cell.
function bar(out: Uint32Array, columns: number, rows: number, x: number, eighths: number, fg: number) {
  for (let r = 0; r < rows; r++) {
    const fromBottom = rows - 1 - r
    const level = Math.max(0, Math.min(8, Math.round(eighths) - fromBottom * 8))
    cell(out, r * columns + x, BLOCKS[level]!, fg)
  }
}

function blank(columns: number, rows: number): Uint32Array {
  const out = new Uint32Array(columns * rows * 3)
  for (let i = 0; i < columns * rows; i++) cell(out, i, 0x20, DEFAULT)
  return out
}

// A small equalizer that runs under a tool call while it works.
export function drawShimmer(columns: number, now: number, kind: string, mode: Mode): Uint32Array {
  const P = PALETTES[mode]
  const color = P.tools[kind] ?? P.tools.other!
  const out = blank(columns, 1)
  for (let x = 0; x < columns; x += 2) {
    const v = 0.15 + 0.85 * Math.abs(Math.sin(x * 0.5 + now / 110) * Math.sin(x * 0.17 - now / 340))
    bar(out, columns, 1, x, 1 + v * 7, mix(P.screen, color, 0.45 + 0.55 * v))
  }
  return out
}

// The spinner's stream meter: one bar per column, one sample each, newest on the right, each 0…1.
export function drawMeter(columns: number, samples: readonly number[], kind: string, mode: Mode): Uint32Array {
  const P = PALETTES[mode]
  const color = P.tools[kind] ?? P.tools.other!
  const out = blank(columns, 1)
  for (let x = 0; x < columns; x++) {
    const v = Math.max(0, Math.min(1, samples[samples.length - columns + x] ?? 0))
    bar(out, columns, 1, x, 1 + v * 7, mix(P.screen, color, 0.35 + 0.65 * v))
  }
  return out
}

export type TimelineCall = { s: number; e: number; k: string; f: boolean }

const LANE_OF: Record<string, number> = { bash: 0, edit: 1, read: 2, search: 2 }

// A turn's flight recorder: four lanes in two rows of half blocks, one bar per call.
export function drawTimeline(columns: number, calls: readonly TimelineCall[], total: number, mode: Mode): Uint32Array {
  const P = PALETTES[mode]
  const lanes: number[][] = [0, 1, 2, 3].map(() => new Array(columns).fill(0))
  const span = Math.max(1, total)
  for (const c of calls) {
    const lane = LANE_OF[c.k] ?? 3
    const color = c.f ? P.red : (P.tools[c.k] ?? P.tools.other!)
    const x0 = Math.max(0, Math.min(columns - 1, Math.floor((c.s / span) * columns)))
    const x1 = Math.max(x0, Math.min(columns - 1, Math.ceil((c.e / span) * columns) - 1))
    for (let x = x0; x <= x1; x++) lanes[lane]![x] = color
  }
  const track = mix(P.screen, P.grid, 0.5)
  const out = blank(columns, 2)
  for (let row = 0; row < 2; row++) {
    for (let x = 0; x < columns; x++) {
      const top = lanes[row * 2]![x]!
      const bottom = lanes[row * 2 + 1]![x]!
      const i = row * columns + x
      if (top && bottom) cell(out, i, 0x2580, top, bottom) // ▀ over a bottom-colored cell
      else if (top) cell(out, i, 0x2580, top)
      else if (bottom) cell(out, i, 0x2584, bottom) // ▄
      else cell(out, i, x % 4 === 0 ? 0x00b7 : 0x20, track) // ·
    }
  }
  return out
}

// ── The AI core: an equalizer above the prompt. Visual only. ──

export type Activity = 'idle' | 'thinking' | 'tool' | 'responding'

export const CORE_ROWS = 3

const CLAUDE_ORANGE: Record<Mode, number> = { dark: 0xe08a68, light: 0xc15f3c }

function smooth(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)
}

// The trace moves 1 sample per this many ms, so sample x entered on the right this long ago.
const CORE_MS_PER_SAMPLE = 25

// The trace's height at sample `x` of `n`, -1 to 1, at time `t`: the panel's SIGNAL, per state.
export function coreSignal(x: number, n: number, t: number, activity: Activity): number {
  const u = x + t / CORE_MS_PER_SAMPLE // the trace scrolls right to left
  const edge = smooth(x / (n * 0.04)) * smooth((n - 1 - x) / (n * 0.04))
  let v: number
  if (activity === 'thinking') {
    v = 0.62 * Math.sin(u * 0.07) + 0.33 * Math.sin(u * 0.17 + 1.3) * Math.sin(u * 0.023)
  } else if (activity === 'responding') {
    const syllable = Math.max(0, Math.sin(u * 0.045)) * (0.6 + 0.4 * Math.sin(u * 0.011))
    v = syllable * Math.sin(u * 0.62) * 0.95
  } else if (activity === 'tool') {
    v = 0.04 * Math.sin(u * 0.3)
    const burst = (((u % 70) + 70) % 70) - 35
    v += Math.exp(-(burst * burst) / 10) * Math.sin(u * 0.9) * 1.1
  } else {
    // A slow heartbeat that rides the trace like the other states.
    const beat = (((u % 160) + 160) % 160) - 80
    const d = beat / (n * 0.035)
    v = 0.04 * Math.sin(u * 0.09) + Math.exp(-d * d) * Math.sin(u * 0.5) * 0.45
  }
  return Math.max(-1, Math.min(1, v)) * edge
}

// A state the core was in from `at` on, in the same clock as drawCore's `now`.
export type CoreSpan = { at: number; activity: Activity; kind: string }

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
  const P = PALETTES[mode]
  const rows = CORE_ROWS
  const colorOf = (a: Activity, k: string) =>
    a === 'tool' ? (P.tools[k] ?? P.tools.other!) : a === 'idle' ? P.accent : CLAUDE_ORANGE[mode]
  const color = colorOf(activity, kind)
  const labelWidth = Math.max(label.length, note.length) + 3
  const room = Math.max(8, columns - labelWidth)
  const W = room * 2
  const H = rows * 4
  const level = new Float32Array(W * H)
  const plot = (x: number, y: number, i: number) => {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= W || py >= H) return
    const k = py * W + px
    if (i > (level[k] ?? 0)) level[k] = i
  }
  const mid = (H - 1) / 2
  const amp = H / 2 - 0.6
  for (let x = 0; x < W; x += 4) plot(x, mid, 0.18) // the zero line, faint
  // Each sample keeps the state it was drawn in as it scrolls left; new states enter on the right.
  // `history` runs oldest first and ends with the current state; without it the whole trace is the current one.
  const spans: readonly CoreSpan[] = history.length > 0 ? history : [{ at: -Infinity, activity, kind }]
  const hue = new Uint32Array(W)
  let span = 0
  let prev: number | null = null
  for (let x = 0; x < W; x++) {
    const entered = now - (W - 1 - x) * CORE_MS_PER_SAMPLE
    while (span < spans.length - 1 && spans[span + 1]!.at <= entered) span++
    const s = spans[span]!
    hue[x] = colorOf(s.activity, s.kind)
    const y = mid - coreSignal(x, W, now, s.activity) * amp
    const fresh = 0.35 + 0.65 * (x / (W - 1)) // newest at the right, brightest
    if (prev !== null) {
      const steps = Math.max(1, Math.ceil(Math.abs(y - prev) * 2))
      for (let s = 0; s <= steps; s++) plot(x - 1 + s / steps, prev + ((y - prev) * s) / steps, fresh)
    } else plot(x, y, fresh)
    prev = y
  }
  const out = new Uint32Array(columns * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      let bits = 0
      let best = 0
      if (col < room) {
        for (let sx = 0; sx < 2; sx++) {
          for (let sy = 0; sy < 4; sy++) {
            const i = level[(row * 4 + sy) * W + col * 2 + sx] ?? 0
            if (i > 0.05) bits |= BITS[sx]![sy]!
            best = Math.max(best, i)
          }
        }
      }
      const o = (row * columns + col) * 3
      out[o] = bits ? 0x2800 + bits : 0x20
      const c = col < room ? hue[col * 2 + 1]! : color
      out[o + 1] = bits ? (best < 0.2 ? mix(P.screen, P.grid, 0.7) : mix(P.screen, c, P.floor + (1 - P.floor) * best)) : DEFAULT
      out[o + 2] = DEFAULT
    }
  }
  const put = (y: number, text: string, fg: number) => {
    for (let k = 0; k < text.length && room + 3 + k < columns; k++) {
      const o = (y * columns + room + 3 + k) * 3
      out[o] = text.codePointAt(k) ?? 0x20
      out[o + 1] = fg
      out[o + 2] = DEFAULT
    }
  }
  put(0, label, color)
  put(1, note, P.label)
  return out
}

export function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

// A reply's voiceprint: a short bar signature drawn from its own text.
export function drawVoiceprint(columns: number, seed: number, mode: Mode): Uint32Array {
  const P = PALETTES[mode]
  const color = CLAUDE_ORANGE[mode]
  const out = blank(columns, 1)
  for (let x = 0; x < columns; x++) {
    const shape = 0.35 + 0.65 * Math.sin(((x + 0.5) / columns) * Math.PI)
    const v = shape * (0.3 + 0.7 * hash(x, seed * 997, 11))
    bar(out, columns, 1, x, 1 + v * 7, mix(P.screen, color, 0.5 + 0.5 * v))
  }
  return out
}
