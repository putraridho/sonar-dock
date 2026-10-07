// The band above the prompt: the AI core, and beneath it while a reply streams, CLAUDE speaking:
// its pill from the first word, and the reply's newest lines, plain and glitching as they settle.

import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { beat, glitchSegments } from '../../motion/effects'
import { encodeCells } from '../../raster/cells'
import { CORE_ROWS, drawCore } from '../../raster/core'
import { SWATCHES } from '../../theme/palette'
import type { Context } from '../../runtime/context'
import { INITIAL } from '../../runtime/state'
import { GUTTER, Pill, SpeakerRow, pillFlash } from './kit'

// State this file reads or writes.
const mode = atom({ plugin: 'sonar-dock', key: 'mode' } as const, INITIAL.mode)
const skin = atom({ plugin: 'sonar-dock', key: 'skin' } as const, INITIAL.skin)

const LIVE_LINES = 2
const MIN_COLUMNS = 30
const MAX_COLUMNS = 160

export function installBand(on: On, { motion, scene, surfaces, live, agents }: Context): void {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || !(await read($, skin))) {
      surfaces.band = null
      return next(e)
    }
    const ui = $.ui.resolve(e)
    const { Box, Text, Raster } = ui
    const columns = Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, e.props.bodyColumns))
    surfaces.band = { id: e.requestId, columns }
    const m = await read($, mode)
    const C = SWATCHES[m]
    const t = scene.now()
    const [label, note] = scene.caption(agents.workingCount(Date.now()))
    const core = <Raster key="core" columns={columns} rows={CORE_ROWS} cells={encodeCells(drawCore(columns, t, scene.activity, scene.kind, m, label, note, scene.spans(t)))} />
    if (live.isEmpty) return core

    // The reply speaks from its first word: CLAUDE powers on in the gutter, its newest lines beside it.
    motion.keepMoving()
    const id = `live:${live.startedAt}`
    const p = motion.entrance(id, 900)
    const lines = live.tail(LIVE_LINES, columns - GUTTER - 1, Date.now())
    const pill = <Pill ui={ui} word="CLAUDE" p={p} background={pillFlash(C.claude, C.screen, p, motion.afterglow(`${id}:pill`, p))} ink={C.pillInk} />
    return (
      <Box flexDirection="column">
        {core}
        <SpeakerRow ui={ui} gap={0} speaker={pill}>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            {lines.map((line, k) => (
              <Text color={C.ink} wrap="truncate-end">
                {glitchSegments(line.text, line.settled).map(seg => (seg.isHot ? <Text color={C.claude} bold>{seg.text}</Text> : seg.text))}
                {k === lines.length - 1 && <Text color={C.claude}>{beat() > 0.5 ? '█' : ' '}</Text>}
              </Text>
            ))}
          </Box>
        </SpeakerRow>
      </Box>
    )
  })
}
