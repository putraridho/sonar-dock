// How a tool call reads: what it was asked to do, and what it came back with.

import { plural, unwrapPastes } from '../text/format'

export function cleanCommand(command: string): string {
  return command
    .split('\n')[0]!
    .replace(/^\s*(\w+=("[^"]*"|'[^']*'|\S+)\s+)+/, '')
    .replace(/^\s*cd\s+\S+\s*(&&|;)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function fieldOf(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

function stringOf(value: unknown, key: string): string | undefined {
  const v = fieldOf(value, key)
  return typeof v === 'string' ? v : undefined
}

// One line for what a call does: its file, its command (or the description given for it), its query.
export function describeCall(input: unknown): string {
  const path = stringOf(input, 'file_path') ?? stringOf(input, 'notebook_path')
  if (path) return path.split('/').slice(-2).join('/')
  const command = stringOf(input, 'command')
  if (command !== undefined) return stringOf(input, 'description') ?? cleanCommand(command)
  const skill = stringOf(input, 'skill')
  if (skill) return `/${skill}`
  const keys = ['pattern', 'url', 'query', 'description', 'prompt', 'tool']
  const found = keys.map(k => stringOf(input, k)).find(v => v !== undefined) ?? ''
  return found.replace(/\s+/g, ' ')
}

// A prompt as one log line: its text with runs of space and newlines folded.
export function promptLine(text: string): string {
  return unwrapPastes(text).replace(/\s+/g, ' ').trim()
}

export const PROMPT_KIND = 'prompt'

// Whether the person sent a prompt themselves: typed at the terminal, or through Remote Control.
// Task notifications, subagent reports, scheduled prompts and peers' messages arrive as prompts too.
export function isFromPerson(origin: { kind: string }): boolean {
  return origin.kind === 'composer' || origin.kind === 'bridge'
}

/** The same prompt again within this long is the same submission, seen twice. */
const REPEAT_WINDOW_MS = 10_000

// Whether `text` was just logged as a prompt: a hook that runs twice for one submission logs it once.
export function isRepeatPrompt(lines: readonly { kind?: string; detail: string; at: number }[], text: string, at: number): boolean {
  const last = [...lines].reverse().find(l => l.kind === PROMPT_KIND)
  return last !== undefined && last.detail === text && at - last.at < REPEAT_WINDOW_MS
}

// A log line that records a tool call, not a prompt.
export function isCall(line: { kind?: string }): boolean {
  return line.kind !== PROMPT_KIND
}

export function isPath(text: string): boolean {
  return /^[\w.-]*\/[\w./-]+$/.test(text)
}

// A short tag for the radar: a path's file name, or a phrase's first words.
export function tagOf(detail: string): string {
  const text = detail.trim()
  if (isPath(text)) return text.split('/').pop() ?? text
  const words = text.split(' ').slice(0, 3).join(' ')
  return words.length > 18 ? `${words.slice(0, 17)}…` : words
}

// The arguments that best say what an MCP call is about, most telling first.
const MCP_ARG_KEYS = ['id', 'issueId', 'query', 'title', 'name', 'channel', 'subject', 'url', 'path', 'text']

const words = (snake: string) => snake.replace(/_/g, ' ').trim()

// "claude_ai_Linear" → "Linear"; "plugin_slack_slack" → "slack", the name tools repeat.
function serverOf(server: string): string {
  return server.replace(/^claude_ai_/, '').replace(/^plugin_([^_]+)_.*$/, '$1')
}

// The call's most telling argument: a known key first, else its first non-empty string.
function mainArgument(input: unknown): string {
  const present = (key: string) => {
    const v = stringOf(input, key)
    return v !== undefined && v.trim() !== '' ? v : undefined
  }
  const keys = input !== null && typeof input === 'object' ? Object.keys(input) : []
  return (MCP_ARG_KEYS.map(present).find(Boolean) ?? keys.map(present).find(Boolean) ?? '').replace(/\s+/g, ' ')
}

// An MCP call as words: "Linear · get issue · ENG-142".
export function mcpLine(tool: string, input: unknown): string {
  const [, server = '', name = ''] = tool.split('__')
  const base = serverOf(server)
  const serverName = words(base).replace(/^\w/, c => c.toUpperCase())
  const toolName = name.toLowerCase().startsWith(`${base.toLowerCase()}_`) ? name.slice(base.length + 1) : name
  return [serverName, words(toolName), mainArgument(input)].filter(Boolean).join('  ·  ')
}

function nonEmptyLines(text: string): string[] {
  return text.split('\n').filter(l => l.trim() !== '')
}

// What a finished call says on the right: a count worth reading, or nothing.
export function metricOf(output: unknown): string {
  const stdout = stringOf(output, 'stdout')
  if (stdout !== undefined) {
    const n = nonEmptyLines(stdout).length
    return n === 0 ? '' : plural(n, 'line')
  }
  const numLines = fieldOf(fieldOf(output, 'file'), 'numLines') ?? fieldOf(output, 'numLines')
  if (typeof numLines === 'number') return plural(numLines, 'line')
  const numFiles = fieldOf(output, 'numFiles')
  if (typeof numFiles === 'number') return plural(numFiles, 'file')
  const filenames = fieldOf(output, 'filenames')
  if (Array.isArray(filenames)) return plural(filenames.length, 'file')
  return ''
}

const PREVIEW_LINES = 3

// A shell call's last few lines of output, and how many more there were.
export function previewLines(output: unknown): string[] {
  const lines = nonEmptyLines([stringOf(output, 'stdout') ?? '', stringOf(output, 'stderr') ?? ''].join('\n'))
  if (lines.length <= PREVIEW_LINES) return lines
  return [...lines.slice(-PREVIEW_LINES), `… ${lines.length - PREVIEW_LINES} more lines`]
}
