// What moves on screen and for how long: each row's entrance, the gauges' glide, and whether
// anything is still moving (so the chat redraws only then).

const AT_LOAD_MS = 2000

export class Motion {
  private readonly loadedAt = Date.now()
  private readonly bornAt = new Map<string, number>()
  private readonly shown = new Map<string, number>()
  private isDirty = false

  // 0 → 1 over `ms` from the first time `id` was drawn; rows already on screen at load stay still.
  entrance(id: string, ms: number): number {
    const t = Date.now()
    let born = this.bornAt.get(id)
    if (born === undefined) {
      born = t - this.loadedAt < AT_LOAD_MS ? 0 : t
      this.bornAt.set(id, born)
    }
    if (born === 0) return 1
    const p = Math.min(1, (t - born) / ms)
    if (p < 1) this.isDirty = true
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

  // Whether anything moved since the last call: the chat redraws when it did.
  takeFrame(): boolean {
    const was = this.isDirty
    this.isDirty = false
    return was
  }
}
