// The values the drawings read, held by the host so they survive a reload of the module, and
// declared in types/index.d.ts. Each file that reads or writes one declares its own atom for it
// (the engine lists every file's state from those declarations); their starting values live here.

import type { PluginState } from 'claude-code'

import { EMPTY_RESERVES } from '../domain/usage'

type State = PluginState['sonar-dock']

/** The boot sequence's last step: the pane shows the dashboard from here. */
export const BOOT_DONE = 99

export const INITIAL: { readonly [K in keyof State]: State[K] } = {
  log: [],
  stats: { ops: 0, edits: 0, errors: 0, turns: 0, files: [], turnStartedAt: null },
  threat: 0,
  alert: null,
  boot: BOOT_DONE,
  now: 0,
  mode: 'dark',
  skin: false,
  turns: [],
  reserves: EMPTY_RESERVES,
}

/** How many entries the activity log and the turn records keep. */
export const LOG_LIMIT = 60
export const TURN_LIMIT = 200
