// Which usage windows just crossed a warning line (80%, then 95%), once per window per crossing.

import type { Reserves } from '../../types'
import { warningLine } from '../domain/usage'

export class LimitWarnings {
  private readonly lines = new Map<string, number>()

  // The windows that crossed a new line since the last reading.
  crossed(r: Reserves): Reserves['limits'] {
    return r.limits.filter(l => {
      const line = warningLine(l.percentUsed)
      const isNew = line > (this.lines.get(l.kind) ?? 0)
      this.lines.set(l.kind, line)
      return isNew
    })
  }
}
