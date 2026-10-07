// The HUD's own state: the threat level, the radar's contacts, and the status line's words.

import { SHOWN_LEVEL, clampThreat, threatName } from '../domain/threat'
import { TOOLS } from '../domain/tools'
import type { ToolKind } from '../domain/tools'
import type { Blip } from '../raster/radar'

export const PANE = 'sonar-dock'

export const BOOT_LINES = [
  'ESTABLISHING UPLINK',
  'CALIBRATING SENSOR ARRAY',
  'LOADING THREAT MATRIX',
  'SYNCING WITH CLAUDE CORE',
  'ARMING TELEMETRY',
] as const

const MAX_BLIPS = 40

export class Hud {
  readonly blips: Blip[] = []
  private threat = 0

  get level(): number {
    return this.threat
  }

  // Sets the threat level, kept within the matrix; returns the level set.
  setLevel(level: number): number {
    this.threat = clampThreat(level)
    return this.threat
  }

  // A contact for a tool call, somewhere on the scope.
  addBlip(kind: ToolKind, tag: string, born: number): Blip {
    const blip: Blip = {
      angle: Math.random() * Math.PI * 2,
      radius: 0.2 + Math.random() * 0.72,
      kind,
      isFailed: false,
      glyph: TOOLS[kind].glyph,
      born,
      isLive: true,
      tag,
    }
    this.blips.push(blip)
    if (this.blips.length > MAX_BLIPS) this.blips.shift()
    return blip
  }

  statusText(text = 'STANDBY'): string {
    const named = this.threat >= SHOWN_LEVEL ? ` · THREAT ${threatName(this.threat)}` : ''
    return `◉ SONAR DOCK ▸ ${text}${named}`
  }
}
