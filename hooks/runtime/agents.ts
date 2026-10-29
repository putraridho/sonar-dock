// The session's subagents: each gets a number the first time one of its calls is seen (A1, A2, ...),
// and counts as working while it has a call in flight or made one in the last few seconds.

import type { ToolKind } from '../domain/tools'

const WORKING_FOR_MS = 4000

/** A subagent as the roster lists it: its calls, its latest, and whether it is at work. */
export type RosterRow = { agent: number; calls: number; kind: ToolKind; last: string; isWorking: boolean }

export class Agents {
  private readonly numbers = new Map<string, number>()
  private readonly inFlight = new Map<number, number>()
  private readonly lastSeen = new Map<number, number>()
  private readonly latest = new Map<number, { calls: number; kind: ToolKind; last: string }>()

  // The subagent's number; absent for the main loop.
  numberOf(agentId: string | undefined): number | undefined {
    if (agentId === undefined) return undefined
    let n = this.numbers.get(agentId)
    if (n === undefined) {
      n = this.numbers.size + 1
      this.numbers.set(agentId, n)
    }
    return n
  }

  callStarted(agent: number | undefined, at: number, kind: ToolKind = 'other', detail = ''): void {
    if (agent === undefined) return
    this.inFlight.set(agent, (this.inFlight.get(agent) ?? 0) + 1)
    this.lastSeen.set(agent, at)
    this.latest.set(agent, { calls: (this.latest.get(agent)?.calls ?? 0) + 1, kind, last: detail })
  }

  callEnded(agent: number | undefined, at: number): void {
    if (agent === undefined) return
    this.inFlight.set(agent, Math.max(0, (this.inFlight.get(agent) ?? 1) - 1))
    this.lastSeen.set(agent, at)
  }

  private isWorking(agent: number, nowMs: number): boolean {
    return (this.inFlight.get(agent) ?? 0) > 0 || nowMs - (this.lastSeen.get(agent) ?? -Infinity) < WORKING_FOR_MS
  }

  workingCount(nowMs: number): number {
    let n = 0
    for (const agent of this.lastSeen.keys()) if (this.isWorking(agent, nowMs)) n++
    return n
  }

  // Every subagent seen: the working ones first, then the most recently seen.
  roster(nowMs: number): RosterRow[] {
    return [...this.latest]
      .map(([agent, l]) => ({ agent, ...l, isWorking: this.isWorking(agent, nowMs) }))
      .sort((a, b) => Number(b.isWorking) - Number(a.isWorking) || (this.lastSeen.get(b.agent) ?? 0) - (this.lastSeen.get(a.agent) ?? 0))
  }
}

export function agentTag(agent: number): string {
  return `A${agent}`
}
