// Where Sonar Dock is drawing right now, so its clocks know what to redraw: the radar in the
// pane, the core band, the spinners' meters, and the shimmer under each running call.

import type { ToolKind } from '../domain/tools'

export type Size = { columns: number; rows: number }

export class Surfaces {
  radar: Size | null = null
  band: { id: string; columns: number } | null = null
  readonly spinners = new Set<string>()
  readonly spinnerSeenAt = new Map<string, number>()
  /** The kind the spinners' meters are colored by. */
  meterKind: ToolKind = 'other'
  /** Tool calls in flight, by id. */
  readonly running = new Map<string, ToolKind>()
  /** Running calls whose row shows a shimmer. */
  readonly shimmers = new Set<string>()
  /** Each DONE row's turn record, by row: claimed once, so two turns of like length never swap. */
  readonly doneRows = new Map<string, string>()
  /** Each /sonar row's readout, by row: what held when it was first drawn. */
  readonly readouts = new Map<string, string[]>()

  get isToolRunning(): boolean {
    return this.running.size > 0
  }

  callStarted(id: string, kind: ToolKind): void {
    this.running.set(id, kind)
  }

  callEnded(id: string): void {
    this.running.delete(id)
    this.shimmers.delete(id)
  }

  // A turn's spinners are gone with it.
  turnEnded(): void {
    this.spinnerSeenAt.clear()
  }
}
