// What Claude is doing right now, as the radar and the core show it, on a scene clock that
// slows while idle so the idle animation stays smooth at a lower frame rate.

import { TOOLS } from '../domain/tools'
import { plural } from '../text/format'
import type { ToolKind } from '../domain/tools'
import type { Activity, CoreSpan } from '../raster/core'

const IDLE_SPEED = 0.4
/** The widest core band shows about 8 s of trace; older states have scrolled off. */
const HISTORY_MS = 10_000

export class Scene {
  activity: Activity = 'idle'
  kind: ToolKind = 'other'
  private note = ''
  private usage = ''
  private wallAt = Date.now()
  private sceneAt = this.wallAt
  private readonly history: CoreSpan[] = []

  get isIdle(): boolean {
    return this.activity === 'idle'
  }

  // The scene clock: wall time, slowed to IDLE_SPEED while idle.
  now(): number {
    const t = Date.now()
    this.sceneAt += (t - this.wallAt) * (this.isIdle ? IDLE_SPEED : 1)
    this.wallAt = t
    return this.sceneAt
  }

  think(): void {
    this.activity = 'thinking'
  }

  rest(): void {
    this.activity = 'idle'
  }

  toolStarted(kind: ToolKind, note: string): void {
    this.activity = 'tool'
    this.kind = kind
    this.note = note
  }

  // The last running call finished: back to thinking until the next step.
  toolsSettled(): void {
    if (this.activity === 'tool') this.activity = 'thinking'
  }

  // The spinner says what the engine is doing; tools in flight keep the scene on them.
  follow(spinnerMode: string, isToolRunning: boolean): void {
    if (spinnerMode === 'responding') this.activity = 'responding'
    else if ((spinnerMode === 'thinking' || spinnerMode === 'requesting') && !isToolRunning) this.activity = 'thinking'
  }

  noteUsage(fiveHour: number | null): void {
    this.usage = fiveHour === null ? '' : `5-hour ${Math.round(fiveHour)}%`
  }

  // The core's caption: what is happening, and a note beneath it. Subagents at work take the note.
  caption(workingAgents = 0): [label: string, note: string] {
    const note = workingAgents > 0 ? `${plural(workingAgents, 'agent')} working` : this.usage
    switch (this.activity) {
      case 'thinking':
        return ['Thinking', note]
      case 'responding':
        return ['Replying', note]
      case 'tool':
        return [`Running ${TOOLS[this.kind].noun}`, workingAgents > 0 ? note : this.note]
      case 'idle':
        return ['Standing by', note]
    }
  }

  // The states the core has been in, oldest first, ending with the current one.
  spans(t: number): readonly CoreSpan[] {
    const last = this.history[this.history.length - 1]
    const kind = this.activity === 'tool' ? this.kind : ''
    if (!last || last.activity !== this.activity || last.kind !== kind) this.history.push({ at: t, activity: this.activity, kind })
    while (this.history.length > 1 && this.history[1]!.at <= t - HISTORY_MS) this.history.shift()
    return this.history
  }
}
