// How fast each usage window fills: its recent readings, kept per reset period, and the windows
// whose pace says they will fill soon (warned once per window per reset period).

import type { Reserves } from '../../types'
import { PACE_WINDOW_MS, fullIn } from '../domain/usage'
import type { UsagePoint } from '../domain/usage'

/** A window that will fill sooner than this, before it resets, is worth a warning. */
export const SOON_MS = 45 * 60_000

export class Pace {
  private readonly points = new Map<string, UsagePoint[]>()
  private readonly periods = new Map<string, string | undefined>()
  private readonly warned = new Set<string>()

  note(r: Reserves, at: number): void {
    for (const l of r.limits) {
      // A new reset time is a new period: the pace starts over.
      if (this.periods.get(l.kind) !== l.resetsAt) {
        this.periods.set(l.kind, l.resetsAt)
        this.points.set(l.kind, [])
      }
      const list = this.points.get(l.kind)!
      list.push({ at, percent: l.percentUsed })
      while (list.length > 1 && at - list[0]!.at > PACE_WINDOW_MS) list.shift()
    }
  }

  // Ms until the window fills at its pace, or null.
  fullIn(kind: string, nowMs: number): number | null {
    return fullIn(this.points.get(kind) ?? [], this.periods.get(kind), nowMs)
  }

  // The windows that just began to forecast full within SOON_MS, with when.
  soon(r: Reserves, nowMs: number): { kind: string; ms: number }[] {
    const out: { kind: string; ms: number }[] = []
    for (const l of r.limits) {
      const ms = this.fullIn(l.kind, nowMs)
      const key = `${l.kind}@${l.resetsAt ?? ''}`
      if (ms === null || ms > SOON_MS || l.percentUsed >= 95 || this.warned.has(key)) continue
      this.warned.add(key)
      out.push({ kind: l.kind, ms })
    }
    return out
  }
}
