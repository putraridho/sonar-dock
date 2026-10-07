// The model's response on its way to the transcript: counted for the stream meter, and, for the
// main thread with the skin on, held a moment so it can glitch in the band first.

import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import type { Context } from '../runtime/context'
import { charsOf, paceStream } from '../runtime/live'
import { INITIAL } from '../runtime/state'

// State this file reads or writes.
const skin = atom({ plugin: 'sonar-dock', key: 'skin' } as const, INITIAL.skin)

export function installStream(on: On, ctx: Context): void {
  const { live, flow } = ctx

  on('turn.step', async function* ($, e, next) {
    const isHeld = e.agentId === undefined && (await read($, skin))
    const clearBand = () => {
      if (live.clear()) $.ui.invalidate('ui.render')
    }
    const stream = next(e)
    try {
      yield* paceStream(stream, {
        isHeld,
        onArrive: (chunk, at) => {
          flow.note(charsOf(chunk))
          if (isHeld && chunk.kind === 'text') live.add(chunk.index, chunk.text, at)
        },
        onTool: clearBand,
      })
    } finally {
      if (isHeld) clearBand()
    }
    return await stream.result
  })
}
