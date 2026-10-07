// The band above the prompt: the AI core, and beneath it while a reply streams, the reply's
// newest lines glitching as they settle.

import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { beat, glitchSegments } from '../../motion/effects'
import { encodeCells } from '../../raster/cells'
import { CORE_ROWS, drawCore } from '../../raster/core'
import { SWATCHES } from '../../theme/palette'
import type { Context } from '../../runtime/context'
import { INITIAL } from '../../runtime/state'

// State this file reads or writes.
const mode = atom({ plugin: 'sonar-dock', key: 'mode' } as const, INITIAL.mode)
const skin = atom({ plugin: 'sonar-dock', key: 'skin' } as const, INITIAL.skin)

const LIVE_LINES = 2
const MIN_COLUMNS = 30
const MAX_COLUMNS = 160

export function installBand(on: On, { motion, scene, surfaces, live }: Context): void {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || !(await read($, skin))) {
      surfaces.band = null
      return next(e)
    }
    const { Box, Text, Raster } = $.ui.resolve(e)
    const columns = Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, e.props.bodyColumns))
    surfaces.band = { id: e.requestId, columns }
    const m = await read($, mode)
    const C = SWATCHES[m]
    const t = scene.now()
    const [label, note] = scene.caption()
    const core = <Raster key="core" columns={columns} rows={CORE_ROWS} cells={encodeCells(drawCore(columns, t, scene.activity, scene.kind, m, label, note, scene.spans(t)))} />
    if (live.isEmpty) return core

    motion.keepMoving()
    const lines = live.tail(LIVE_LINES, columns - 4, Date.now())
    return (
      <Box flexDirection="column">
        {core}
        {lines.map((line, k) => {
          const isNewest = k === lines.length - 1
          return (
            <Text color={C.ink} wrap="truncate-end">
              <Text color={C.mute}>{isNewest ? '▸ ' : '  '}</Text>
              {glitchSegments(line.text, line.settled).map(seg => (seg.isHot ? <Text color={C.claude} bold>{seg.text}</Text> : seg.text))}
              {isNewest && <Text color={C.claude}>{beat() > 0.5 ? '█' : ' '}</Text>}
            </Text>
          )
        })}
      </Box>
    )
  })
}
