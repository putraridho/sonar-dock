// The threat matrix: calls worth an alert, and how far each raises the level. Shell commands are
// read as written, edits by the file they touch, connector calls by whether they send something out.

/** A matched signature: its name, and how many levels it raises. */
export type Threat = { name: string; step: number }

type Signature = readonly [RegExp, string, number]

/** How far a dangerous command raises the level; lesser signatures raise it less. */
export const DANGER_STEP = 3
const CAUTION_STEP = 2
const NOTICE_STEP = 1

const COMMANDS: readonly Signature[] = [
  [/\brm\s+(-[a-z]*r[a-z]*\b|--recursive\b)/i, 'RECURSIVE DELETE', DANGER_STEP],
  [/\bgit\s+push\b.*(--force|\s-f\b)/, 'FORCE PUSH', DANGER_STEP],
  [/\bgit\s+reset\s+--hard\b/, 'HARD RESET', DANGER_STEP],
  [/\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/, 'REMOTE CODE EXEC', DANGER_STEP],
  [/\b(drop|truncate)\s+(table|database)\b/i, 'DATABASE DESTRUCTION', DANGER_STEP],
  [/\bmkfs(\.\w+)?\b|\bdd\b.*\bof=\/dev\/|>\s*\/dev\/(sd|disk|nvme)/, 'DISK OVERWRITE', DANGER_STEP],
  [/\bsudo\b/, 'PRIVILEGE ESCALATION', DANGER_STEP],
  [/\bchmod\s+(-R\s+)?777\b/, 'PERMISSION BLAST', DANGER_STEP],
  [/\bgit\s+clean\s+-[a-z]*f/, 'WORKTREE WIPE', DANGER_STEP],
  [/\b(npm|pnpm|yarn|cargo|gem|twine)\s+(publish|upload|push)\b/, 'PACKAGE PUBLISH', CAUTION_STEP],
  [/\bgit\s+push\b.*\s(origin\s+)?(HEAD:)?(main|master)\b/, 'PUSH TO MAIN', CAUTION_STEP],
]

const FILES: readonly Signature[] = [
  [/(^|\/)\.ssh\/|(^|\/)id_(rsa|ed25519|ecdsa)\b|\.(pem|key|p12)$/, 'KEY TAMPER', DANGER_STEP],
  [/(^|\/)\.env(\.[\w.-]+)?$|(^|\/)\.aws\/credentials$|(^|\/)\.(npmrc|netrc|pypirc)$/, 'SECRETS TOUCHED', CAUTION_STEP],
  [/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Gemfile\.lock|go\.sum)$/, 'LOCKFILE EDIT', NOTICE_STEP],
]

// A connector call that sends something on someone's behalf: a message, a post, a reply.
const OUTBOUND = /(^|_)(send|post|reply|forward|publish|schedule)(_|$)/i

function match(signatures: readonly Signature[], text: string): Threat | null {
  const hit = signatures.find(([pattern]) => pattern.test(text))
  return hit ? { name: hit[1], step: hit[2] } : null
}

export function detectThreat(command: string): string | null {
  return match(COMMANDS, command)?.name ?? null
}

// What a call threatens: its command, the file it writes, or a message it sends out.
export function threatOf(tool: string, input: unknown): Threat | null {
  const field = (key: string) => {
    const v = input !== null && typeof input === 'object' ? (input as Record<string, unknown>)[key] : undefined
    return typeof v === 'string' ? v : undefined
  }
  if (tool === 'Bash') return match(COMMANDS, field('command') ?? '')
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return match(FILES, field('file_path') ?? field('notebook_path') ?? '')
  if (tool.startsWith('mcp__')) {
    const name = tool.split('__')[2] ?? ''
    return OUTBOUND.test(name) && !/draft/i.test(name) ? { name: 'OUTBOUND MESSAGE', step: NOTICE_STEP } : null
  }
  return null
}

const LEVELS = ['NOMINAL', 'GUARDED', 'ELEVATED', 'HIGH', 'CRITICAL', 'CRITICAL'] as const

export const MAX_THREAT = LEVELS.length - 1
/** The floor a failed call sets. */
export const FAILURE_FLOOR = 1
/** From this level the radar turns red. */
export const ALERT_LEVEL = 3
/** From this level the status line names the threat. */
export const SHOWN_LEVEL = 2

export function threatName(level: number): string {
  return LEVELS[level] ?? LEVELS[0]
}

export function clampThreat(level: number): number {
  return Math.max(0, Math.min(MAX_THREAT, level))
}
