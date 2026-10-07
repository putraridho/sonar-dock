// The threat matrix: commands worth a red alert, and the level they raise.

const SIGNATURES: readonly (readonly [RegExp, string])[] = [
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
  return SIGNATURES.find(([pattern]) => pattern.test(command))?.[1] ?? null
}

const LEVELS = ['NOMINAL', 'GUARDED', 'ELEVATED', 'HIGH', 'CRITICAL', 'CRITICAL'] as const

export const MAX_THREAT = LEVELS.length - 1
/** How far a dangerous command raises the level, and the floor a failed call sets. */
export const DANGER_STEP = 3
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
