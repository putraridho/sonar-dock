// The session's subagents: each gets a number the first time one of its calls is seen (A1, A2, ...),
// and counts as working while it has a call in flight or made one in the last few seconds.

const WORKING_FOR_MS = 4000

export class Agents {
  private readonly numbers = new Map<string, number>()
  private readonly inFlight = new Map<number, number>()
  private readonly lastSeen = new Map<number, number>()

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

  callStarted(agent: number | undefined, at: number): void {
    if (agent === undefined) return
    this.inFlight.set(agent, (this.inFlight.get(agent) ?? 0) + 1)
    this.lastSeen.set(agent, at)
  }

  callEnded(agent: number | undefined, at: number): void {
    if (agent === undefined) return
    this.inFlight.set(agent, Math.max(0, (this.inFlight.get(agent) ?? 1) - 1))
    this.lastSeen.set(agent, at)
  }

  workingCount(nowMs: number): number {
    let n = 0
    for (const [agent, seen] of this.lastSeen) if ((this.inFlight.get(agent) ?? 0) > 0 || nowMs - seen < WORKING_FOR_MS) n++
    return n
  }
}

export function agentTag(agent: number): string {
  return `A${agent}`
}
