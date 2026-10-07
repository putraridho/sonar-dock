// What moves on screen and for how long: each row's entrance, the gauges' glide, and whether
// anything is still moving (so the chat redraws only then).

const AT_LOAD_MS = 2000
/** Settled entrances remembered, so a row scrolled back into view stays still; the oldest go first. */
const SETTLED_KEPT = 5000

export class Motion {
  private readonly loadedAt = Date.now()
  private readonly bornAt = new Map<string, number>()
  private readonly settled = new Set<string>()
  private readonly shown = new Map<string, number>()
  private isDirty = false

  // 0 → 1 over `ms` from the first time `id` was drawn; rows already on screen at load stay still.
  entrance(id: string, ms: number): number {
    if (this.settled.has(id)) return 1
    const t = Date.now()
    let born = this.bornAt.get(id)
    if (born === undefined) {
      if (t - this.loadedAt < AT_LOAD_MS) return this.settle(id)
      born = t
      this.bornAt.set(id, born)
    }
    const p = Math.min(1, (t - born) / ms)
    if (p >= 1) return this.settle(id)
    this.isDirty = true
    return p
  }

  // After a row locks in (p reaches 1): two heartbeat pulses that fade out, 0 when still.
  afterglow(id: string, p: number): number {
    if (p < 1) return 0
    const g = this.entrance(`${id}:glow`, 1500)
    if (g >= 1) return 0
    return Math.max(0, Math.sin(g * Math.PI * 6)) * Math.pow(1 - g, 0.7)
  }

  // A value that glides toward its target instead of jumping.
  glide(name: string, target: number): number {
    const was = this.shown.get(name) ?? 0
    const next = Math.abs(target - was) < 0.4 ? target : was + (target - was) * 0.22
    this.shown.set(name, next)
    if (next !== target) this.isDirty = true
    return next
  }

  // Something on screen is moving without an entrance of its own (a spinner, a stream).
  keepMoving(): void {
    this.isDirty = true
  }

  // Moves a finished entrance out of the running ones, keeping the newest SETTLED_KEPT.
  private settle(id: string): 1 {
    this.bornAt.delete(id)
    this.settled.add(id)
    if (this.settled.size > SETTLED_KEPT) this.settled.delete(this.settled.values().next().value!)
    return 1
  }

  // Whether anything moved since the last call: the chat redraws when it did.
  takeFrame(): boolean {
    const was = this.isDirty
    this.isDirty = false
    return was
  }
}
