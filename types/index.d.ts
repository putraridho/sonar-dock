export type LogLine = {
  id: string
  at: number
  tool: string
  detail: string
  state: 'run' | 'ok' | 'err'
  kind?: string
  end?: number
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
  ms: number
  ops: number
  errors: number
  fiveHour: number | null
  calls: { s: number; e: number; k: string; f: boolean }[]
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
