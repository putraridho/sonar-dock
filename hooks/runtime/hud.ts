// The HUD's own state: the threat level, the radar's contacts, and the status line's words.

import { SHOWN_LEVEL, clampThreat, threatName } from '../domain/threat'
import { TOOLS } from '../domain/tools'
import type { ToolKind } from '../domain/tools'
import { TAU } from '../lib/math'
import type { Blip } from '../raster/radar'
import { agentTag } from './agents'

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

  // A contact for a tool call: the main loop's anywhere on the scope, each subagent's clustered
  // at a bearing of its own and tagged with its number.
  addBlip(kind: ToolKind, tag: string, born: number, agent?: number): Blip {
    const blip: Blip = {
      ...(agent === undefined ? scattered() : clustered(agent)),
      kind,
      isFailed: false,
      glyph: TOOLS[kind].glyph,
      born,
      isLive: true,
      tag: agent === undefined ? tag : `${agentTag(agent)} ${tag}`,
      agent,
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

const GOLDEN = 0.618034

function scattered(): Pick<Blip, 'angle' | 'radius'> {
  return { angle: Math.random() * TAU, radius: 0.2 + Math.random() * 0.72 }
}

// Subagent n's bearing, spread by the golden ratio so neighbours sit far apart.
function clustered(agent: number): Pick<Blip, 'angle' | 'radius'> {
  return { angle: ((agent * GOLDEN) % 1) * TAU + (Math.random() - 0.5) * 0.5, radius: 0.55 + Math.random() * 0.35 }
}
