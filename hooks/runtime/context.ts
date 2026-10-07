// Everything the features share, made once per module load and handed to each.

import { Motion } from '../motion/motion'
import { Agents } from './agents'
import { Appearance } from './appearance'
import { FlowMeter } from './flow'
import { Hud } from './hud'
import { LimitWarnings } from './limits'
import { LiveFeed } from './live'
import { Scene } from './scene'
import { Surfaces } from './surfaces'

/** Columns of the spinner's stream meter, one sample each. */
export const METER_COLUMNS = 8

export type Context = {
  readonly motion: Motion
  readonly scene: Scene
  readonly live: LiveFeed
  readonly flow: FlowMeter
  readonly hud: Hud
  readonly surfaces: Surfaces
  readonly appearance: Appearance
  readonly limits: LimitWarnings
  readonly agents: Agents
  /** The session's cost when the current turn began. */
  turn: { costAtStart: number | null }
}

export function createContext(): Context {
  return {
    motion: new Motion(),
    scene: new Scene(),
    live: new LiveFeed(),
    flow: new FlowMeter(METER_COLUMNS),
    hud: new Hud(),
    surfaces: new Surfaces(),
    appearance: new Appearance(),
    limits: new LimitWarnings(),
    agents: new Agents(),
    turn: { costAtStart: null },
  }
}
