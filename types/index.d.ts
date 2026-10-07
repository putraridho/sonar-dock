export type LogLine = {
  id: string
  at: number
  tool: string
  detail: string
  state: 'run' | 'ok' | 'err'
  /** A tool kind, or 'prompt' for a line that records what the person asked. */
  kind?: string
  end?: number
  /** The subagent that made the call, by its number in the session (1, 2, ...); absent on the main loop. */
  agent?: number
}

export type Stats = {
  ops: number
  edits: number
  errors: number
  turns: number
  files: string[]
  turnStartedAt: number | null
}

export type Reserves = {
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  contextPercent: number | null
  costUsd: number | null
}

export type TurnRecord = {
  /** The turn's id, as turn.complete gave it. */
  id?: string
  ms: number
  ops: number
  errors: number
  fiveHour: number | null
  /** Each call: start and end (ms into the turn), kind, failed, and the subagent that made it. */
  calls: { s: number; e: number; k: string; f: boolean; a?: number }[]
}

declare module 'claude-code' {
  interface PluginState {
    'sonar-dock': {
      log: LogLine[]
      stats: Stats
      threat: number
      alert: string | null
      boot: number
      now: number
      reserves: Reserves
      skin: boolean
      mode: 'light' | 'dark'
      turns: TurnRecord[]
    }
  }
}
