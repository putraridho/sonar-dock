import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LogLine, Reserves, Stats, TurnRecord } from '../types'
import {
  CORE_ROWS,
  PALETTES,
  TOOL_STYLE,
  drawCore,
  drawRadar,
  drawMeter,
  drawShimmer,
  drawTimeline,
  drawVoiceprint,
  encodeCells,
  hexOf,
  radarSize,
  seedOf,
  toolHex,
  toolKind,
} from './radar'
import type { Activity, CoreSpan, Mode } from './radar'
import type { Blip } from './radar'

const PANE = 'sonar-dock'
const BOOT_DONE = 99
const FRAME_MS = 33

const log = atom({ plugin: 'sonar-dock', key: 'log' } as const, [])
const stats = atom({ plugin: 'sonar-dock', key: 'stats' } as const, {
  ops: 0,
  edits: 0,
  errors: 0,
  turns: 0,
  files: [],
  turnStartedAt: null,
})
const threat = atom({ plugin: 'sonar-dock', key: 'threat' } as const, 0)
const alert = atom({ plugin: 'sonar-dock', key: 'alert' } as const, null)
const boot = atom({ plugin: 'sonar-dock', key: 'boot' } as const, BOOT_DONE)
const now = atom({ plugin: 'sonar-dock', key: 'now' } as const, 0)
const mode = atom({ plugin: 'sonar-dock', key: 'mode' } as const, 'dark')
const skin = atom({ plugin: 'sonar-dock', key: 'skin' } as const, false)
const turns = atom({ plugin: 'sonar-dock', key: 'turns' } as const, [])
const reserves = atom({ plugin: 'sonar-dock', key: 'reserves' } as const, {
  limits: [],
  contextPercent: null,
  costUsd: null,
})

const BOOT_LINES = [
  'ESTABLISHING UPLINK',
  'CALIBRATING SENSOR ARRAY',
  'LOADING THREAT MATRIX',
  'SYNCING WITH CLAUDE CORE',
  'ARMING TELEMETRY',
]

const THREATS: readonly [RegExp, string][] = [
  [/\brm\s+-[a-z]*(rf|fr)/i, 'RECURSIVE DELETE'],
  [/\bgit\s+push\b.*(--force|\s-f\b)/, 'FORCE PUSH'],
  [/\bgit\s+reset\s+--hard\b/, 'HARD RESET'],
  [/\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/, 'REMOTE CODE EXEC'],
  [/\b(drop|truncate)\s+(table|database)\b/i, 'DATABASE DESTRUCTION'],
  [/\bsudo\b/, 'PRIVILEGE ESCALATION'],
  [/\bchmod\s+(-R\s+)?777\b/, 'PERMISSION BLAST'],
  [/\bgit\s+clean\s+-[a-z]*f/, 'WORKTREE WIPE'],
]

export function detectThreat(command: string): string | null {
  for (const [pattern, name] of THREATS) if (pattern.test(command)) return name
  return null
}

const THREAT_NAMES = ['NOMINAL', 'GUARDED', 'ELEVATED', 'HIGH', 'CRITICAL', 'CRITICAL']
type Panel = {
  screen: string
  ink: string
  mute: string
  accent: string
  track: string
  red: string
  amber: string
  threat: string[]
}

const PANEL: Record<Mode, Panel> = {
  dark: {
    screen: '#0b1411',
    ink: '#d6e8e0',
    mute: '#5f8276',
    accent: '#3dffa2',
    track: '#24382f',
    red: '#ff3b55',
    amber: '#ffd25a',
    threat: ['#3dffa2', '#b6f26b', '#ffd25a', '#ff9a4a', '#ff3b55', '#ff3b55'],
  },
  light: {
    screen: '#f6f8f7',
    ink: '#14211c',
    mute: '#4f665c',
    accent: '#00663f',
    track: '#cfdcd6',
    red: '#c0102c',
    amber: '#8f5a00',
    threat: ['#00663f', '#4a7400', '#8f5a00', '#a84400', '#c0102c', '#c0102c'],
  },
}

const PHOSPHOR_HEX = '#3dffa2'
const SCREEN = '#0b1411'
const INK = '#d6e8e0'
const MUTE = '#5f8276'

const THREAT_COLORS = [PHOSPHOR_HEX, '#b6f26b', '#ffd25a', '#ff9a4a', '#ff3b55', '#ff3b55']

export function cleanCommand(command: string): string {
  return command
    .split('\n')[0]!
    .replace(/^\s*(\w+=("[^"]*"|'[^']*'|\S+)\s+)+/, '')
    .replace(/^\s*cd\s+\S+\s*(&&|;)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function detailOf(e: unknown): string {
  const input = e as Record<string, unknown>
  const pick = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : undefined)
  const path = pick('file_path') ?? pick('notebook_path')
  if (path) return path.split('/').slice(-2).join('/')
  const command = pick('command')
  if (command !== undefined) return pick('description') ?? cleanCommand(command)
  const skill = pick('skill')
  if (skill) return `/${skill}`
  return (pick('pattern') ?? pick('url') ?? pick('query') ?? pick('description') ?? pick('prompt') ?? pick('tool') ?? '').replace(
    /\s+/g,
    ' ',
  )
}

type UsageReading = {
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]
  context: { percent?: number }
  cost?: { usd: number }
}

function toReserves(u: UsageReading): Reserves {
  return {
    limits: u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    contextPercent: u.context.percent ?? null,
    costUsd: u.cost?.usd ?? null,
  }
}

const LIMIT_NAMES: Record<string, string> = { five_hour: '5H', seven_day: 'WEEK', spend_limit: 'SPEND' }

export function limitName(kind: string): string {
  return LIMIT_NAMES[kind] ?? kind.toUpperCase().slice(0, 5)
}

export function untilReset(resetsAt: string | undefined, nowMs: number): string {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - nowMs
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'resetting'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

export function gaugeColor(percent: number, m: Mode = 'dark'): string {
  const c = PANEL[m]
  return percent >= 90 ? c.red : percent >= 70 ? c.amber : c.accent
}

// Toasts once per window as it crosses each line.
const warned = new Map<string, number>()

function warnLimits($: EngineInterface, r: Reserves) {
  for (const l of r.limits) {
    const line = l.percentUsed >= 95 ? 95 : l.percentUsed >= 80 ? 80 : 0
    if (line > (warned.get(l.kind) ?? 0)) {
      $.ui.toast(`${l.kind === 'five_hour' ? '5-hour' : l.kind === 'seven_day' ? 'Weekly' : limitName(l.kind)} usage at ${Math.round(l.percentUsed)}%`, { timeoutMs: 6000 })
    }
    warned.set(l.kind, line)
  }
}

const SPIN_WORDS: Record<string, readonly string[]> = {
  thinking: ['Plotting course', 'Calculating trajectory', 'Scanning sector', 'Running simulations', 'Consulting star charts'],
  requesting: ['Establishing uplink', 'Hailing ground control', 'Aligning antenna', 'Acquiring signal'],
  responding: ['Transmitting', 'Downlinking', 'Relaying telemetry', 'Beaming data'],
  'tool-input': ['Arming', 'Loading payload', 'Priming systems'],
  'tool-use': ['Engaging', 'Executing maneuver', 'Firing thrusters', 'Deploying'],
}

const SPIN_TAG: Record<string, string> = {
  thinking: 'THINKING',
  requesting: 'UPLINK',
  responding: 'DOWNLINK',
  'tool-input': 'ARMING',
  'tool-use': 'ENGAGED',
}

const SPIN_SUFFIX = ['▸', '▹']
const SPIN_WORD_MS = 8000
const PULSE_COLUMNS = 8
const FLOW_SAMPLE_MS = 200
const FLOW_SAMPLES = PULSE_COLUMNS

// What the model streams (answer, thinking, tool arguments), in characters per sample.
const flow: number[] = new Array(FLOW_SAMPLES).fill(0)
let flowPending = 0
let flowPeak = 40

export function noteFlow(chars: number) {
  flowPending += chars
}

// Closes a sample: each bar is its count against the recent peak, so slow and fast models both fill the meter.
export function rollFlow(): readonly number[] {
  flowPeak = Math.max(40, flowPeak * 0.97, flowPending)
  flow.push(flowPending / flowPeak)
  flowPending = 0
  while (flow.length > FLOW_SAMPLES) flow.shift()
  return flow
}

// One word per mode, held for a few seconds, then the next from the list.
export function spinWord(mode: string, seed: string, sinceStart: number): string {
  const list = SPIN_WORDS[mode] ?? ['Working']
  const base = Math.floor(seedOf(seed) * list.length)
  return list[(base + Math.floor(sinceStart / SPIN_WORD_MS)) % list.length]!
}

// The engine's override messages (compacting, waiting…) as a HUD alert.
export function alertText(message: string): string {
  return message.replace(/(…|\.\.\.)\s*$/, '').trim().toUpperCase()
}

export function sweepClock(ms: number): string {
  const full = elapsed(ms)
  return ms >= 3_600_000 ? full : full.slice(3)
}

function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

function lineCount(text: string): number {
  return text.split('\n').filter(l => l.trim() !== '').length
}

// What a finished call says on the right: a count worth reading, or nothing.
export function metricOf(tool: string, output: unknown): string {
  const stdout = field(output, 'stdout')
  if (typeof stdout === 'string') {
    const n = lineCount(stdout)
    return n === 0 ? '' : `${n} ${n === 1 ? 'line' : 'lines'}`
  }
  const numLines = field(field(output, 'file'), 'numLines') ?? field(output, 'numLines')
  if (typeof numLines === 'number') return `${numLines} lines`
  const numFiles = field(output, 'numFiles')
  if (typeof numFiles === 'number') return `${numFiles} ${numFiles === 1 ? 'file' : 'files'}`
  const filenames = field(output, 'filenames')
  if (Array.isArray(filenames)) return `${filenames.length} files`
  return ''
}

export function previewLines(output: unknown): string[] {
  const stdout = field(output, 'stdout')
  const stderr = field(output, 'stderr')
  const text = [typeof stdout === 'string' ? stdout : '', typeof stderr === 'string' ? stderr : '']
    .join('\n')
    .split('\n')
    .filter(l => l.trim() !== '')
  return text.length <= 3 ? text : [...text.slice(-3), `… ${text.length - 3} more lines`]
}

// ── Motion: every row makes an entrance, once. ──

const loadedAt = Date.now()
const bornAt = new Map<string, number>()
let isAnimating = false

// 0 → 1 over `ms` from the first time `id` was drawn; rows already on screen at load stay still.
function entrance(id: string, ms: number): number {
  const t = Date.now()
  let born = bornAt.get(id)
  if (born === undefined) {
    born = t - loadedAt < 2000 ? 0 : t
    bornAt.set(id, born)
  }
  if (born === 0) return 1
  const p = Math.min(1, (t - born) / ms)
  if (p < 1) isAnimating = true
  return p
}

function ease(p: number): number {
  return 1 - Math.pow(1 - p, 3)
}

function typed(text: string, p: number): string {
  if (p >= 1) return text
  const n = Math.ceil(text.length * ease(p))
  return `${text.slice(0, n)}▍`
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const k = Math.max(0, Math.min(1, t))
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) + (((pb >> shift) & 255) - ((pa >> shift) & 255)) * k)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}

// Gauges glide toward their readings instead of jumping.
const shownPct = new Map<string, number>()

function glide(name: string, target: number): number {
  const was = shownPct.get(name) ?? 0
  const next = Math.abs(target - was) < 0.4 ? target : was + (target - was) * 0.22
  shownPct.set(name, next)
  if (next !== target) isAnimating = true
  return next
}

// The decrypt: each character flickers through noise, then locks in, left to right.
const NOISE = '▓▒░#%&@$=+*<>/\\|01'

export type Decoded = { done: string; head: string; hot: string; ghost: string; trail?: string }

// done: locked text · head: the write head · hot: characters still flickering · ghost: dim static ahead.
export function decode(text: string, p: number): Decoded {
  if (p >= 1) return { done: text, head: '', hot: '', ghost: '' }
  const n = text.length
  const front = Math.floor(ease(p) * (n + 1))
  const frame = Math.floor(Date.now() / 60)
  const noise = (i: number) => (text[i] === ' ' || text[i] === '\n' ? text[i]! : NOISE[(i * 7 + frame * 13) % NOISE.length]!)
  const band = 8
  const done = text.slice(0, Math.max(0, front - band))
  let hot = ''
  for (let i = Math.max(0, front - band); i < Math.min(n, front); i++) hot += noise(i)
  // The comet: the last scrambled characters burn down to the head.
  const tail = Math.min(3, hot.length)
  const trail = front < n && tail > 0 ? '░▒▓'.slice(3 - tail) : ''
  if (trail) hot = hot.slice(0, hot.length - tail)
  const head = front < n ? '█' : ''
  let ghost = ''
  for (let i = front + 1; i < n; i++) ghost += text[i] === '\n' ? '\n' : text[i] === ' ' ? ' ' : (i + frame) % 3 === 0 ? '░' : '·'
  return trail ? { done, head, hot, ghost, trail } : { done, head, hot, ghost }
}

// The beat that scrambling characters pulse to, 0 → 1 → 0, several times a second.
function beat(): number {
  return (Math.sin(Date.now() / 85) + 1) / 2
}

// After a row locks in: two heartbeat pulses that fade out, 0 when still.
function afterglow(id: string, p: number): number {
  if (p < 1) return 0
  const g = entrance(`${id}:glow`, 1500)
  if (g >= 1) return 0
  return Math.max(0, Math.sin(g * Math.PI * 6)) * Math.pow(1 - g, 0.7)
}

// Glitch: while a row decodes it sometimes jumps sideways for a frame.
function jitter(id: string, p: number): number {
  if (p >= 0.75) return 0
  const frame = Math.floor(Date.now() / 70)
  const n = Math.sin(frame * 12.9898 + id.length * 78.233) * 43758.5453
  const r = n - Math.floor(n)
  return r > 0.78 ? (r > 0.93 ? 2 : 1) : 0
}

// A pill powering on: it strobes before it holds its color.
function strobe(on: string, off: string, p: number): string {
  if (p >= 0.35) return on
  return Math.floor(Date.now() / 70) % 2 === 0 ? on : off
}

// A glint: a band of light that crosses a line once, as `p` runs 0 → 1.
export function glint(text: string, p: number): [string, string, string] {
  if (p >= 1 || p <= 0) return [text, '', '']
  const width = 6
  const at = Math.round((text.length + width) * p) - width
  const a = Math.max(0, at)
  const b = Math.max(0, Math.min(text.length, at + width))
  return [text.slice(0, a), text.slice(a, b), text.slice(b)]
}

const CLAUDE_HEX: Record<Mode, string> = { dark: '#e08a68', light: '#c15f3c' }

// Blank rows above each chat row: a new speaker or tool call, and a reply's later blocks.
const ROW_GAP = 2
const BLOCK_GAP = 1

// The screenplay's speaker column.
const GUTTER = 9
const PILL_WORD: Record<string, string> = {
  bash: 'RUN',
  edit: 'EDIT',
  read: 'READ',
  search: 'FIND',
  agent: 'AGENT',
  web: 'WEB',
  mcp: 'LINK',
  other: 'TOOL',
}

type TextTag = (props: Record<string, unknown>) => unknown

function Decrypt(props: {
  T: TextTag
  text: string
  p: number
  color: string
  hot: string
  screen: string
  glow?: number
  bold?: boolean
}) {
  const { T, text, p, color, hot, screen, bold } = props
  const glow = props.glow ?? 0
  const d = decode(text, p)
  const b = beat()
  const Tag = T as unknown as (props: Record<string, unknown>) => never
  return (
    <Tag bold={bold} wrap="wrap">
      <Tag
        color={glow > 0 ? mixHex(color, screen, 0.85 * glow) : color}
        backgroundColor={glow > 0 ? mixHex(screen, hot, 0.85 * glow) : undefined}
        bold={bold}
      >
        {d.done}
      </Tag>
      <Tag color={b > 0.5 ? screen : hot} backgroundColor={b > 0.5 ? hot : undefined} bold>
        {d.hot}
      </Tag>
      <Tag color={hot} bold>
        {d.trail ?? ''}
      </Tag>
      <Tag color={mixHex(hot, screen, 0.5 * b)} bold>
        {d.head}
      </Tag>
      <Tag color={hot} dimColor>
        {d.ghost}
      </Tag>
    </Tag>
  )
}

function pillInk(m: Mode): string {
  return m === 'light' ? '#ffffff' : '#0b1411'
}

// An MCP call as words: "Linear · get issue · ENG-142".
export function mcpLine(tool: string, input: unknown): string {
  const [, server = '', name = ''] = tool.split('__')
  const pretty = (w: string) => w.replace(/_/g, ' ').trim()
  // "claude_ai_Linear" → Linear; "plugin_slack_slack" → Slack
  const base = server.replace(/^claude_ai_/, '').replace(/^plugin_([^_]+)_.*$/, '$1')
  const serverName = pretty(base).replace(/^\w/, c => c.toUpperCase())
  const toolName = name.toLowerCase().startsWith(`${base.toLowerCase()}_`) ? name.slice(base.length + 1) : name
  const args = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const keys = ['id', 'issueId', 'query', 'title', 'name', 'channel', 'subject', 'url', 'path', 'text']
  const key = keys.find(k => typeof args[k] === 'string' && (args[k] as string).trim() !== '')
  const firstString = Object.values(args).find(v => typeof v === 'string' && v.trim() !== '') as string | undefined
  const arg = (key ? (args[key] as string) : firstString ?? '').replace(/\s+/g, ' ')
  return [serverName, pretty(toolName), arg].filter(Boolean).join('  ·  ')
}

// A GitHub-style table: a pipe row followed by a |---|---| separator row.
export function hasMarkdownTable(text: string): boolean {
  return /^\s*\|.*\|\s*\n\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/m.test(text)
}

export function tagOf(detail: string): string {
  const text = detail.trim()
  if (/^[\w.-]*\/[\w./-]+$/.test(text)) return text.split('/').pop() ?? text
  const words = text.split(' ').slice(0, 3).join(' ')
  return words.length > 18 ? `${words.slice(0, 17)}…` : words
}

function clock(ms: number): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`
}

function fit(text: string, width: number): string {
  if (width <= 1) return ''
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width)
}

// Animation state lives in the module: a reload starts the radar afresh.
const blips: Blip[] = []
let size = { columns: 0, rows: 0 }
let isMounted = false
let threatLevel = 0

async function openPane($: EngineInterface) {
  await update($, boot, () => 0)
  const opened = await $.ui.open({ id: PANE, title: 'Sonar Dock', columns: 66, rows: 40 })
  for (let step = 1; step <= BOOT_LINES.length + 1; step++) {
    $.clock.after(280 * step, () => void update($, boot, () => step))
  }
  $.clock.after(280 * (BOOT_LINES.length + 3), () => void update($, boot, () => BOOT_DONE))
  return opened
}

let currentMode: Mode = 'dark'

// Tool calls running now, by id, and those whose row draws a shimmer.
const running = new Map<string, string>()
const shimmering = new Set<string>()
const SHIMMER_COLUMNS = 28

// The AI core above the prompt: what it shows, and where it is mounted.
let activity: Activity = 'idle'
let lastNow = 0

// The radar and the core run on a scene clock that slows to 0.4× while idle.
const IDLE_SPEED = 0.4
let sceneAt = Date.now()
let sceneT = sceneAt
function sceneNow(): number {
  const t = Date.now()
  sceneT += (t - sceneAt) * (activity === 'idle' ? IDLE_SPEED : 1)
  sceneAt = t
  return sceneT
}

// What the core has been doing, so the trace keeps past states as it scrolls.
const coreHistory: CoreSpan[] = []
function coreSpans(t: number): readonly CoreSpan[] {
  const last = coreHistory[coreHistory.length - 1]
  const kind = activity === 'tool' ? activityKind : ''
  if (!last || last.activity !== activity || last.kind !== kind) coreHistory.push({ at: t, activity, kind })
  // The widest band shows about 8 s of trace; older states have scrolled off.
  while (coreHistory.length > 1 && coreHistory[1]!.at <= t - 10_000) coreHistory.shift()
  return coreHistory
}
let activityKind = 'other'
let activityNote = ''
let usageNote = ''
let bandId: string | null = null
let bandColumns = 0

// The turn's spinner lines, pulsed by their own clock; the session's cost when the turn began.
const spinners = new Set<string>()
const spinnerSeenAt = new Map<string, number>()
let spinnerKind = 'other'
let costAtStart: number | null = null

const KIND_WORD: Record<string, string> = {
  bash: 'shell',
  edit: 'edit',
  read: 'read',
  search: 'search',
  agent: 'agent',
  web: 'web',
  mcp: 'connector',
  other: 'tool',
}

function coreLabel(): [string, string] {
  if (activity === 'thinking') return ['Thinking', usageNote]
  if (activity === 'responding') return ['Replying', usageNote]
  if (activity === 'tool') return [`Running ${KIND_WORD[activityKind] ?? 'tool'}`, activityNote]
  return ['Standing by', usageNote]
}

function noteUsage(r: Reserves) {
  const five = r.limits.find(l => l.kind === 'five_hour')
  usageNote = five ? `5-hour ${Math.round(five.percentUsed)}%` : ''
}

// The person's override (/sonar light|dark), else the Claude Code theme, else macOS.
async function resolveMode($: EngineInterface): Promise<Mode> {
  const pref = await $.store.get('theme')
  if (pref === 'light' || pref === 'dark') return pref
  const row = (await $.config.list()).find(r => r.key === 'theme')
  const theme = typeof row?.value === 'string' ? row.value : 'auto'
  if (theme.includes('light')) return 'light'
  if (theme.includes('dark')) return 'dark'
  try {
    const r = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle'], { timeoutMs: 3000 })
    return r.exitCode === 0 && r.stdout.includes('Dark') ? 'dark' : 'light'
  } catch {
    return 'dark'
  }
}

async function applyMode($: EngineInterface) {
  const next = await resolveMode($)
  if (next !== currentMode || (await read($, mode)) !== next) {
    currentMode = next
    await update($, mode, () => next)
  }
}

async function setThreat($: EngineInterface, level: number) {
  threatLevel = Math.max(0, Math.min(5, level))
  await update($, threat, () => threatLevel)
}

function showStatus($: EngineInterface, text?: string) {
  const name = THREAT_NAMES[threatLevel] ?? 'NOMINAL'
  $.ui.status(`◉ SONAR DOCK ▸ ${text ?? 'STANDBY'}${threatLevel >= 2 ? ` · THREAT ${name}` : ''}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sonar',
      description: 'Open the Sonar Dock HUD: radar, threat level and live telemetry',
    })
    await update($, now, () => Date.now())
    await applyMode($)
    $.clock.every(60_000, () => void applyMode($))
    // The skin stays as the person last left it, across sessions, until /sonar off.
    if ((await $.store.get('skin')) === true) await update($, skin, () => true)
    const first = toReserves(await $.session.usage())
    noteUsage(first)
    await update($, reserves, () => first)

    // The radar and the core draw at 30 fps; idle, at 7.5 fps with the scene slowed to match.
    let radarTick = 0
    $.clock.every(FRAME_MS, () => {
      if (!isMounted || size.columns === 0) return
      if (activity === 'idle' && ++radarTick % 4 !== 0) return
      const cells = encodeCells(drawRadar(size.columns, size.rows, sceneNow(), blips, threatLevel, currentMode))
      void $.ui.blit({ requestId: PANE, key: 'radar', cells }).then(r => {
        if (r.deny) isMounted = false
      })
    })

    // Idle, the pane shows only hours and minutes: redraw it once a minute, not every second.
    $.clock.every(1000, () => {
      const t = Date.now()
      if (activity === 'idle' && Math.floor(t / 60_000) === Math.floor(lastNow / 60_000)) return
      lastNow = t
      void update($, now, () => t)
    })

    let coreTick = 0
    $.clock.every(FRAME_MS, () => {
      if (bandId === null || bandColumns === 0) return
      if (activity === 'idle' && ++coreTick % 4 !== 0) return
      const [label, note] = coreLabel()
      const t = sceneNow()
      const cells = encodeCells(drawCore(bandColumns, t, activity, activityKind, currentMode, label, note, coreSpans(t)))
      void $.ui.blit({ requestId: bandId, key: 'core', cells }).then(r => {
        if (r.deny) bandId = null
      })
    })

    // The chat redraws at 30 fps, and only while something on it animates.
    $.clock.every(FRAME_MS, () => {
      if (!isAnimating) return
      isAnimating = false
      $.ui.invalidate('ui.render')
    })

    // The stream meter only changes when a sample lands, so it redraws then.
    $.clock.every(FLOW_SAMPLE_MS, () => {
      rollFlow()
      if (spinners.size === 0) return
      const cells = encodeCells(drawMeter(PULSE_COLUMNS, flow, spinnerKind, currentMode))
      for (const id of spinners) {
        void $.ui.blit({ requestId: id, key: 'pulse', cells }).then(r => {
          if (r.deny) spinners.delete(id)
        })
      }
    })

    $.clock.every(FRAME_MS, () => {
      for (const id of shimmering) {
        const cells = encodeCells(drawShimmer(SHIMMER_COLUMNS, Date.now(), running.get(id) ?? 'other', currentMode))
        void $.ui.blit({ requestId: id, key: 'shimmer', cells }).then(r => {
          if (r.deny) shimmering.delete(id)
        })
      }
    })

    // Threat cools down by one level every 20 seconds.
    $.clock.every(20_000, () => {
      if (threatLevel > 0) {
        void setThreat($, threatLevel - 1)
        if (threatLevel < 3) void update($, alert, () => null)
      }
    })

    showStatus($)
    void openPane($)

    return next(e)
  })

  on('command.run', { command: 'sonar' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'light' || arg === 'dark' || arg === 'auto') {
      await $.store.set('theme', arg)
      await applyMode($)
      return { text: `Sonar Dock palette: ${arg === 'auto' ? `auto (${currentMode})` : arg}.` }
    }
    if (arg === 'off') {
      await update($, skin, () => false)
      await $.store.set('skin', false)
      await $.ui.close({ id: PANE })
      return { text: 'Sonar Dock standing down. Chat restored.' }
    }
    await update($, skin, () => true)
    await $.store.set('skin', true)
    const opened = await openPane($)
    return {
      text: opened.isPlaced
        ? 'Sonar Dock online.'
        : 'Sonar Dock is armed: widen the terminal to seat the HUD.',
    }
  })

  on('session.measure', async ($, e, next) => {
    const r = toReserves(e)
    noteUsage(r)
    await update($, reserves, () => r)
    warnLimits($, r)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const at = Date.now()
    await update($, stats, s => ({ ...s, turns: s.turns + 1, turnStartedAt: at }))
    costAtStart = (await read($, reserves)).costUsd
    activity = 'thinking'
    showStatus($, 'ENGAGED')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const kind = toolKind(e.tool)
    const style = TOOL_STYLE[kind] ?? TOOL_STYLE.other!
    const detail = detailOf(e)
    const id = e.tool_use_id
    const line: LogLine = { id, at: Date.now(), tool: style.label, detail, state: 'run', kind }
    running.set(id, kind)
    activity = 'tool'
    activityKind = kind
    activityNote = tagOf(detail)

    const blip: Blip = {
      angle: Math.random() * Math.PI * 2,
      radius: 0.2 + Math.random() * 0.72,
      kind,
      isFailed: false,
      glyph: style.glyph,
      born: sceneNow(),
      isLive: true,
      tag: tagOf(detail),
    }
    blips.push(blip)
    if (blips.length > 40) blips.shift()

    if (kind === 'bash') {
      const danger = detectThreat(detail)
      if (danger) {
        await setThreat($, threatLevel + 3)
        await update($, alert, () => danger)
        $.ui.toast(`⚠ RED ALERT ▸ ${danger} DETECTED`, { timeoutMs: 6000 })
      }
    }

    await update($, log, list => [...list, line].slice(-60))
    showStatus($, `${style.label.trim()} ${fit(detail, 40).trim()}`)

    const ran = await next(e).finally(() => {
      running.delete(id)
      shimmering.delete(id)
      if (running.size === 0 && activity === 'tool') activity = 'thinking'
    })
    blip.isLive = false

    const failed = ran.isError === true || ran.deny !== undefined
    await update($, log, list =>
      list.map(one => (one.id === id ? { ...one, state: failed ? 'err' : 'ok', end: Date.now() } : one)),
    )
    await update($, stats, (s): Stats => {
      const path = (e as unknown as Record<string, unknown>).file_path
      const files =
        kind === 'edit' && typeof path === 'string' && !s.files.includes(path)
          ? [...s.files, path]
          : s.files
      return {
        ...s,
        ops: s.ops + 1,
        edits: s.edits + (kind === 'edit' && !failed ? 1 : 0),
        errors: s.errors + (failed ? 1 : 0),
        files,
      }
    })
    if (failed) {
      blip.isFailed = true
      await setThreat($, Math.max(threatLevel, 1))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    activity = 'idle'
    const s = await read($, stats)
    if (s.turnStartedAt !== null) {
      const secs = Math.round((Date.now() - s.turnStartedAt) / 1000)
      const list = await read($, log)
      const ops = list.filter(l => l.at >= (s.turnStartedAt ?? 0)).length
      if (ops > 0) {
        $.ui.toast(`✦ SWEEP COMPLETE ▸ ${secs}s · ${ops} ops · threat ${THREAT_NAMES[threatLevel]}`)
      }
    }
    if (s.turnStartedAt !== null) {
      const list = await read($, log)
      const mine = list.filter(l => l.at >= (s.turnStartedAt ?? 0))
      const five = (await read($, reserves)).limits.find(l => l.kind === 'five_hour')
      const record: TurnRecord = {
        ms: e.durationMs,
        ops: mine.length,
        errors: mine.filter(l => l.state === 'err').length,
        fiveHour: five ? five.percentUsed : null,
        calls: mine.slice(-120).map(l => ({
          s: l.at - (s.turnStartedAt ?? l.at),
          e: (l.end ?? Date.now()) - (s.turnStartedAt ?? l.at),
          k: l.kind ?? 'other',
          f: l.state === 'err',
        })),
      }
      await update($, turns, all => [...all, record].slice(-200))
    }
    await update($, stats, x => ({ ...x, turnStartedAt: null }))
    showStatus($)
    return next(e)
  })

  // ── The chat skin: on while /sonar is, off with /sonar off. ──

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || !(await read($, skin))) {
      bandId = null
      return next(e)
    }
    const { Raster } = $.ui.resolve(e)
    bandId = e.requestId
    bandColumns = Math.max(30, Math.min(160, e.props.bodyColumns))
    const [label, note] = coreLabel()
    const t = sceneNow()
    const cells = encodeCells(drawCore(bandColumns, t, activity, activityKind, await read($, mode), label, note, coreSpans(t)))
    return <Raster key="core" columns={bandColumns} rows={CORE_ROWS} cells={cells} />
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.origin.kind !== 'composer' || !(await read($, skin))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, mode)
    const C = PANEL[m]
    const p = entrance(e.requestId, Math.min(2400, 1100 + e.props.text.length * 12))
    return (
      <Box flexDirection="row" marginTop={ROW_GAP} marginLeft={jitter(e.requestId, p)}>
        <Box width={GUTTER} flexShrink={0}>
          <Text
            backgroundColor={p < 0.35 ? strobe(C.accent, C.screen, p) : mixHex(C.ink, C.accent, afterglow(`${e.requestId}:pill`, p))}
            color={C.screen}
            bold
          >
            {` ${(() => {
              const d = decode('YOU', Math.min(1, p * 3))
              return (d.done + d.hot + d.head).padEnd(3).slice(0, 3)
            })()} `}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Decrypt
            T={Text as unknown as TextTag}
            text={e.props.text}
            p={p}
            color={C.ink}
            hot={C.accent}
            screen={C.screen}
            glow={afterglow(e.requestId, p)}
            bold
          />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isSummary || !(await read($, skin))) return next(e)
    // Tables are laid out for the full width; inside the narrower screenplay column they
    // wrap and their borders break. Let the engine draw any block that holds one.
    if (hasMarkdownTable(e.props.text)) return next(e)
    const { Box, Text, Markdown, Raster } = $.ui.resolve(e)
    const m = await read($, mode)
    return (
      <Box
        flexDirection="row"
        marginTop={e.props.isFirstOfReply ? ROW_GAP : BLOCK_GAP}
      >
        <Box width={GUTTER} flexShrink={0} flexDirection="column">
          {e.props.isFirstOfReply && (
            <Text
              backgroundColor={(() => {
                const q = entrance(e.requestId, 900)
                if (q < 0.35) return strobe(CLAUDE_HEX[m], PANEL[m].screen, q)
                return mixHex(CLAUDE_HEX[m], PANEL[m].screen, 0.55 * afterglow(`${e.requestId}:pill`, q))
              })()}
              color={pillInk(m)}
              bold
            >
              {` ${(() => {
                const d = decode('CLAUDE', entrance(e.requestId, 900))
                return (d.done + d.hot + d.head).padEnd(6).slice(0, 6)
              })()} `}
            </Text>
          )}
          {e.props.isFirstOfReply && (
            <Raster key="voiceprint" columns={8} rows={1} cells={encodeCells(drawVoiceprint(8, seedOf(e.props.text), m))} />
          )}
        </Box>
        {/* The engine streamed this text live, so it lands as it is: no second typing pass. */}
        <Box flexGrow={1} flexShrink={1} flexDirection="column">
          <Markdown text={e.props.text} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await read($, skin))) return next(e)
    const { Box, Text, Raster } = $.ui.resolve(e)
    const m = await read($, mode)
    const C = PANEL[m]
    const p = e.props
    const kind = toolKind(p.tool)
    const spin = '◐◓◑◒'[Math.floor(Date.now() / 120) % 4]!
    if (p.isRunning) isAnimating = true
    const mark = p.isRunning
      ? { glyph: spin, color: C.amber, metric: '' }
      : p.isInterrupted
        ? { glyph: '–', color: C.mute, metric: 'stopped' }
        : p.isErrored
          ? { glyph: '✗', color: C.red, metric: 'failed' }
          : { glyph: '✓', color: C.accent, metric: metricOf(p.tool, p.output) }
    const name = p.tool.startsWith('mcp__') ? mcpLine(p.tool, p.input) : ''
    const enter = entrance(p.tool_use_id, 1700)
    const settle = p.isRunning ? 1 : entrance(`${p.tool_use_id}:done`, 900)
    const word = PILL_WORD[kind] ?? 'TOOL'
    const label = decode(word, Math.min(1, enter * 2.2))
    const detail = name || detailOf(p.input ?? {}) || p.tool
    const [before, shine, after] = enter < 1 ? [detail, '', ''] : glint(detail, settle)
    const row = (
      <Box flexDirection="row" marginTop={ROW_GAP} marginLeft={jitter(p.tool_use_id, enter)}>
        <Box width={GUTTER} flexShrink={0}>
          <Text
            backgroundColor={
              enter < 0.35
                ? strobe(toolHex(m, kind), C.screen, enter)
                : !p.isRunning && afterglow(`${p.tool_use_id}:pill`, settle) > 0
                  ? mixHex(toolHex(m, kind), C.screen, 0.55 * afterglow(`${p.tool_use_id}:pill`, settle))
                  : p.isRunning
                  ? mixHex(toolHex(m, kind), C.screen, 0.45 * ((Math.sin(Date.now() / 220) + 1) / 2))
                  : toolHex(m, kind)
            }
            color={pillInk(m)}
            bold
          >
            {` ${(label.done + label.hot + label.head).padEnd(word.length).slice(0, word.length)} `}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          {enter < 1 ? (
            <Decrypt T={Text as unknown as TextTag} text={detail} p={enter} color={C.ink} hot={toolHex(m, kind)} screen={C.screen} />
          ) : (
            <Text color={C.ink}>
              {before}
              <Text backgroundColor={mixHex(C.screen, mark.color, 0.35)} color={C.ink} bold>
                {shine}
              </Text>
              {after}
            </Text>
          )}
        </Box>
        <Box flexShrink={0} marginLeft={2}>
          <Text color={mixHex(C.screen, p.isErrored ? C.red : C.mute, ease(settle))}>{mark.metric ? `${mark.metric}  ` : ''}</Text>
          <Text color={mixHex(C.screen, mark.color, ease(settle))} bold={settle < 1}>
            {mark.glyph}
          </Text>
        </Box>
      </Box>
    )
    if (!p.isRunning) return row
    shimmering.add(p.tool_use_id)
    running.set(p.tool_use_id, running.get(p.tool_use_id) ?? kind)
    const cells = encodeCells(drawShimmer(SHIMMER_COLUMNS, Date.now(), kind, m))
    return (
      <Box flexDirection="column">
        {row}
        <Box marginLeft={GUTTER}>
          <Raster key="shimmer" columns={SHIMMER_COLUMNS} rows={1} cells={cells} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await read($, skin))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const kind = toolKind(e.props.tool)
    // Diffs and errors keep the engine's own drawing, in the content column.
    if (kind === 'edit' || e.props.isErrored) {
      const native = await next(e)
      return <Box marginLeft={GUTTER}>{native}</Box>
    }
    if (kind !== 'bash') return <Box />
    const C = PANEL[await read($, mode)]
    const lines = previewLines(e.props.output)
    if (lines.length === 0) return <Box />
    const q = entrance(`${e.requestId}:out`, 900 + lines.length * 250)
    return (
      <Box flexDirection="column" marginLeft={GUTTER}>
        {lines.map((line, i) => {
          const text = line.startsWith('… ') && i === lines.length - 1 ? `  ${line}` : `│ ${line}`
          const own = Math.max(0, Math.min(1, q * (lines.length + 1) - i))
          if (own >= 1) return <Text color={C.mute} wrap="truncate-end">{text}</Text>
          const d = decode(text, own)
          return (
            <Text color={C.mute} wrap="truncate-end">
              {d.done}
              <Text color={beat() > 0.5 ? C.screen : C.accent} backgroundColor={beat() > 0.5 ? C.accent : undefined}>
                {d.hot}
              </Text>
              <Text color={C.accent}>{(d.trail ?? '') + d.head}</Text>
              <Text color={C.mute} dimColor>
                {d.ghost}
              </Text>
            </Text>
          )
        })}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await read($, skin)) || e.props.isExpanded) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, mode)
    const C = PANEL[m]
    const calls = e.props.calls
    const busy = calls.some(c => c.isRunning)
    const targets = [...new Set(calls.map(c => {
      const d = detailOf(c.input ?? {})
      return /^[\w.-]*\/[\w./-]+$/.test(d) ? tagOf(d) : d
    }).filter(Boolean))]
    const kinds = calls.map(c => toolKind(c.tool))
    const enter = entrance(e.requestId, 1700)
    const groupKind = kinds.every(k => k === kinds[0]) ? (kinds[0] ?? 'search') : 'search'
    return (
      <Box flexDirection="row" marginTop={ROW_GAP}>
        <Box width={GUTTER} flexShrink={0}>
          <Text backgroundColor={enter < 0.35 ? strobe(toolHex(m, groupKind), C.screen, enter) : mixHex(toolHex(m, groupKind), C.screen, 0.55 * afterglow(`${e.requestId}:pill`, enter))} color={pillInk(m)} bold>
            {` ${(() => {
              const w = PILL_WORD[groupKind] ?? 'FIND'
              const d = decode(w, Math.min(1, enter * 2.2))
              return (d.done + d.hot + d.head).padEnd(w.length).slice(0, w.length)
            })()} `}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <Text color={C.ink}>{`${calls.length} ${groupKind === 'bash' ? (calls.length === 1 ? 'command' : 'commands') : calls.length === 1 ? 'lookup' : 'lookups'}`}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} marginLeft={2}>
          <Text color={C.mute}>
            {(() => {
              const d = decode(targets.join('  ·  '), enter)
              return d.done + d.hot + d.head
            })()}
          </Text>
        </Box>
        <Box flexShrink={0} marginLeft={2}>
          <Text color={busy ? C.amber : C.accent}>{busy ? '◌' : '✓'}</Text>
        </Box>
      </Box>
    )
  })

  // Passes every chunk through untouched; only counts what arrives, for the meter.
  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    for await (const c of stream) {
      if (c.kind === 'text' || c.kind === 'thinking') noteFlow(c.text.length)
      else if (c.kind === 'input') noteFlow(c.json.length)
      yield c
    }
    return await stream.result
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const sm = e.props.mode
    if (sm === 'responding') activity = 'responding'
    else if ((sm === 'thinking' || sm === 'requesting') && running.size === 0) activity = 'thinking'
    if (!(await read($, skin))) return next(e)
    // Reading `now` redraws the line each second; the time itself is the wall clock's.
    await read($, now)
    const t = Date.now()
    const s = await read($, stats)
    if (!spinnerSeenAt.has(e.requestId)) spinnerSeenAt.set(e.requestId, t)
    const started = s.turnStartedAt ?? spinnerSeenAt.get(e.requestId)!
    const word = spinWord(sm, `${e.requestId}:${started}`, t - started)
    const message = e.props.message === null ? null : alertText(e.props.message)
    const suffix = SPIN_SUFFIX[Math.floor(t / 1000) % SPIN_SUFFIX.length]!
    if (e.surface !== 'terminal') {
      return next({ ...e, props: { ...e.props, word, message, suffix: ` ${suffix}` } })
    }

    const { Box, Text, Raster } = $.ui.resolve(e)
    const m = await read($, mode)
    const C = PANEL[m]
    const res = await read($, reserves)
    const label = message ?? word.toUpperCase()
    const d = decode(label, entrance(`${e.requestId}:${label}`, 600))
    const parts = [`T+${sweepClock(Math.max(0, t - started))}`]
    if (res.costUsd !== null && costAtStart !== null && res.costUsd > costAtStart) {
      parts.push(`+$${(res.costUsd - costAtStart).toFixed(2)}`)
    }
    if (res.contextPercent !== null) parts.push(`CTX ${Math.round(res.contextPercent)}%`)
    parts.push(SPIN_TAG[sm] ?? 'WORKING')

    spinners.add(e.requestId)
    spinnerKind = sm === 'tool-use' ? activityKind : 'other'
    const cells = encodeCells(drawMeter(PULSE_COLUMNS, flow, spinnerKind, m))
    return (
      <Box flexDirection="row" marginTop={1}>
        <Raster key="pulse" columns={PULSE_COLUMNS} rows={1} cells={cells} />
        <Text color={message ? C.amber : C.accent} bold>
          {` ${message ? '⚠ ' : ''}${d.done}`}
          <Text color={C.ink}>{d.hot + d.head}</Text>
        </Text>
        <Text color={C.accent}>{` ${suffix} `}</Text>
        <Text color={C.mute} wrap="truncate-end">
          {parts.join('  ·  ')}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!(await read($, skin))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, mode)
    const C = PANEL[m]
    const record = (await read($, turns)).find(r => Math.abs(r.ms - e.props.durationMs) < 1500)
    const reveal = entrance(e.requestId, 2200)
    const k = ease(reveal)
    const parts = [duration(e.props.durationMs * k)]
    if (record) {
      if (record.ops > 0) parts.push(`${Math.round(record.ops * k)} ${record.ops === 1 ? 'action' : 'actions'}`)
      if (record.errors > 0) parts.push(`${record.errors} failed`)
      if (record.fiveHour !== null) parts.push(`5-hour ${Math.round(record.fiveHour)}%`)
    }
    const failed = (record?.errors ?? 0) > 0
    const head = (
      <Box flexDirection="row" marginTop={ROW_GAP}>
        <Box width={GUTTER} flexShrink={0}>
          <Text backgroundColor={reveal < 0.35 ? strobe(failed ? C.amber : C.accent, C.screen, reveal) : mixHex(failed ? C.amber : C.accent, C.screen, 0.55 * afterglow(`${e.requestId}:pill`, reveal))} color={pillInk(m)} bold>
            {` ${(() => {
              const d = decode('DONE', Math.min(1, reveal * 3))
              return (d.done + d.hot + d.head).padEnd(4).slice(0, 4)
            })()} `}
          </Text>
        </Box>
        <Text color={C.mute}>{parts.join('  ·  ')}</Text>
      </Box>
    )
    if (e.surface !== 'terminal' || !record || !(record.calls?.length > 0)) return head

    const { Raster } = $.ui.resolve(e)
    const columns = Math.max(20, Math.min(64, (e.viewport?.columns ?? 100) - GUTTER - 26))
    const edge = e.props.durationMs * k
    const shown = record.calls.filter(c => c.s <= edge).map(c => ({ ...c, e: Math.min(c.e, edge) }))
    const cells = encodeCells(drawTimeline(columns, shown, e.props.durationMs, m))
    const lanes: [string, string][] = [
      ['shell', 'bash'],
      ['edit', 'edit'],
      ['read', 'read'],
      ['other', 'agent'],
    ]
    return (
      <Box flexDirection="column">
        {head}
        <Box flexDirection="row" marginLeft={GUTTER}>
          <Raster key="timeline" columns={columns} rows={2} cells={cells} />
          <Box flexDirection="column" marginLeft={2}>
            {[lanes.slice(0, 2), lanes.slice(2)].map(pair => (
              <Text>
                {pair.map(([word, kind]) => (
                  <Text>
                    <Text color={toolHex(m, kind)}>━ </Text>
                    <Text color={C.mute}>{word.padEnd(7)}</Text>
                  </Text>
                ))}
              </Text>
            ))}
          </Box>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, mode)
    const C = PANEL[m]
    const width = Math.max(24, e.props.bodyColumns - 4)
    const step = await read($, boot)
    const t = await read($, now)
    const LABEL_W = 10

    const T = (props: { color?: string; bold?: boolean; children?: unknown; wrap?: 'truncate-end' }) => (
      <Text backgroundColor={C.screen} color={props.color ?? C.ink} bold={props.bold} wrap={props.wrap}>
        {props.children as string}
      </Text>
    )
    const blank = <T> </T>
    const rule = <T color={C.track}>{'─'.repeat(width)}</T>
    const section = (name: string) => <T color={C.mute} bold>{name}</T>

    if (step !== BOOT_DONE) {
      isMounted = false
      return (
        <Box flexDirection="column" backgroundColor={C.screen} paddingX={2} paddingY={1}>
          <T bold>Sonar Dock</T>
          {rule}
          {blank}
          {BOOT_LINES.slice(0, step).map(name => (
            <Box flexDirection="row" width={Math.min(width, 44)}>
              <Box flexGrow={1}>
                <T color={C.mute}>{name.charAt(0) + name.slice(1).toLowerCase()}</T>
              </Box>
              <T color={C.accent}>✓</T>
            </Box>
          ))}
          {step <= BOOT_LINES.length && <T color={C.accent}>▍</T>}
          {step > BOOT_LINES.length && <T color={C.accent}>Ready</T>}
        </Box>
      )
    }

    const s = await read($, stats)
    const level = await read($, threat)
    const danger = await read($, alert)
    const list = await read($, log)
    const res = await read($, reserves)

    size = radarSize(width)
    isMounted = true
    let radar = <T color={C.mute}>The radar draws in the terminal.</T>
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      const cells = encodeCells(drawRadar(size.columns, size.rows, sceneNow(), blips, level, m))
      radar = <Raster key="radar" columns={size.columns} rows={size.rows} cells={cells} />
    }

    const isEngaged = s.turnStartedAt !== null
    const room = Math.max(3, (e.viewport?.rows ?? 40) - size.rows - 21)
    // Details wrap in full, so fill the room by wrapped rows, newest first.
    const detailW = Math.max(1, width - 7 - 3 - LABEL_W)
    const shown: LogLine[] = []
    for (let i = list.length - 1, used = 0; i >= 0; i--) {
      const rows = Math.max(1, Math.ceil(list[i]!.detail.length / detailW))
      if (shown.length > 0 && used + rows > room) break
      shown.unshift(list[i]!)
      used += rows
    }
    const gw = Math.max(8, Math.min(28, width - LABEL_W - 18))
    const gauges = [
      ...res.limits.map(l => ({
        name: l.kind === 'five_hour' ? '5-hour' : l.kind === 'seven_day' ? 'Weekly' : limitName(l.kind),
        pct: l.percentUsed,
        note: untilReset(l.resetsAt, t),
      })),
      ...(res.contextPercent !== null
        ? [{ name: 'Context', pct: res.contextPercent, note: res.costUsd !== null ? `$${res.costUsd.toFixed(2)}` : '' }]
        : []),
    ]
    const totals: [number, string][] = [
      [s.ops, s.ops === 1 ? 'action' : 'actions'],
      [s.edits, s.edits === 1 ? 'edit' : 'edits'],
      [s.files.length, s.files.length === 1 ? 'file' : 'files'],
      [s.errors, s.errors === 1 ? 'error' : 'errors'],
    ]

    return (
      <Box flexDirection="column" backgroundColor={C.screen} paddingX={2} paddingY={1}>
        <Box flexDirection="row" width={width}>
          <Box flexGrow={1}>
            <T bold>Sonar Dock</T>
          </Box>
          <T color={isEngaged ? C.accent : C.mute}>{isEngaged ? '● Engaged' : '○ Standby'}</T>
          <T color={C.mute}>{`  ${isEngaged ? elapsed(t - (s.turnStartedAt ?? t)) : clock(t).slice(0, 5)}`}</T>
        </Box>
        {rule}
        {blank}
        <Box flexDirection="row">
          <Box width={LABEL_W} flexShrink={0}>
            <T color={C.mute}>Threat</T>
          </Box>
          <T color={C.threat[level] ?? C.accent} bold={level >= 3}>
            {(THREAT_NAMES[level] ?? 'NOMINAL').charAt(0) + (THREAT_NAMES[level] ?? 'NOMINAL').slice(1).toLowerCase()}
          </T>
          {danger !== null && <T color={C.red}>{`  ·  ${danger.toLowerCase()}`}</T>}
        </Box>
        {blank}
        {section('Usage')}
        {gauges.length === 0 && <T color={C.mute}>Waiting for the first reading</T>}
        {gauges.map(g => {
          const pct = glide(g.name, g.pct)
          const fill = Math.round((gw * Math.min(100, pct)) / 100)
          return (
            <Box flexDirection="row">
              <Box width={LABEL_W} flexShrink={0}>
                <T color={C.mute}>{g.name}</T>
              </Box>
              <T color={gaugeColor(g.pct, m)}>{'━'.repeat(fill)}</T>
              <T color={C.track}>{'━'.repeat(gw - fill)}</T>
              <Box width={6} flexShrink={0} justifyContent="flex-end">
                <T>{`${Math.round(pct)}%`}</T>
              </Box>
              <T color={C.mute}>{g.note ? `   ${g.note}` : ''}</T>
            </Box>
          )
        })}
        {blank}
        {radar}
        {blank}
        {section('Activity')}
        {list.length === 0 && <T color={C.mute}>Nothing yet</T>}
        {shown.map(line => {
          const enter = entrance(`log:${line.id}`, 500)
          const mark =
            line.state === 'run'
              ? { glyph: '◌', color: C.amber }
              : line.state === 'err'
                ? { glyph: '✗', color: C.red }
                : { glyph: '✓', color: C.accent }
          return (
            <Box flexDirection="row" width={width}>
              <Box width={7} flexShrink={0}>
                <T color={C.mute}>{clock(line.at).slice(0, 5)}</T>
              </Box>
              <Box width={3} flexShrink={0}>
                <T color={mixHex(C.screen, mark.color, ease(enter))}>{mark.glyph}</T>
              </Box>
              <Box width={LABEL_W} flexShrink={0}>
                <T color={mixHex(C.screen, labelColor(line.tool, m) ?? C.mute, ease(enter))}>{toolWord(line.tool)}</T>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <T color={line.state === 'run' ? C.ink : C.mute}>
                  {typed(line.detail, enter)}
                </T>
              </Box>
            </Box>
          )
        })}
        {blank}
        {rule}
        <Box flexDirection="row">
          {totals.map(([n, word], i) => (
            <Box marginRight={3}>
              <T color={i === 3 && n > 0 ? C.red : C.ink} bold>
                {String(n)}
              </T>
              <T color={C.mute}>{` ${word}`}</T>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}

function toolWord(label: string): string {
  const words: Record<string, string> = {
    BASH: 'Shell',
    EDIT: 'Edit',
    READ: 'Read',
    SCAN: 'Search',
    AGNT: 'Agent',
    WEB: 'Web',
    LINK: 'Connector',
    TOOL: 'Tool',
  }
  return words[label.trim()] ?? label
}

function labelColor(label: string, m: Mode): string | undefined {
  for (const [kind, style] of Object.entries(TOOL_STYLE)) if (style.label === label) return toolHex(m, kind)
  return undefined
}
