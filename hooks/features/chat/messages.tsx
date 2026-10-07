// The two speakers: YOU, decrypting what you typed, and CLAUDE, whose reply lands as it
// streamed (it already glitched in the band) beside a pill and a voiceprint of its own.

import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { seedOf } from '../../lib/math'
import { jitter, strobe } from '../../motion/effects'
import { encodeCells } from '../../raster/cells'
import { drawVoiceprint } from '../../raster/strips'
import { hasMarkdownTable } from '../../text/format'
import { SWATCHES, mixHex } from '../../theme/palette'
import type { Context } from '../../runtime/context'
import { INITIAL } from '../../runtime/state'
import { BLOCK_GAP, Decrypt, Pill, ROW_GAP, SpeakerRow, WideRow, pillFlash } from './kit'

// State this file reads or writes.
const mode = atom({ plugin: 'sonar-dock', key: 'mode' } as const, INITIAL.mode)
const skin = atom({ plugin: 'sonar-dock', key: 'skin' } as const, INITIAL.skin)

const VOICEPRINT_COLUMNS = 8

export function installMessages(on: On, { motion }: Context): void {
  on('ui.render', { component: 'UserMessage', surface: 'terminal', props: { origin: { kind: 'composer' } } }, async ($, e, next) => {
    if (!(await read($, skin))) return next(e)
    const ui = $.ui.resolve(e)
    const { Box } = ui
    const C = SWATCHES[await read($, mode)]
    const id = e.requestId
    const p = motion.entrance(id, Math.min(2400, 1100 + e.props.text.length * 12))
    const background = p < 0.35 ? strobe(C.accent, C.screen, p) : mixHex(C.ink, C.accent, motion.afterglow(`${id}:pill`, p))
    return (
      <SpeakerRow ui={ui} gap={ROW_GAP} shift={jitter(id, p)} speaker={<Pill ui={ui} word="YOU" p={Math.min(1, p * 3)} background={background} ink={C.screen} />}>
        <Box flexGrow={1} flexShrink={1}>
          <Decrypt ui={ui} text={e.props.text} p={p} color={C.ink} hot={C.accent} screen={C.screen} glow={motion.afterglow(id, p)} bold />
        </Box>
      </SpeakerRow>
    )
  })

  on('ui.render', { component: 'AssistantMessage', surface: 'terminal' }, async ($, e, next) => {
    if (e.props.isSummary || !(await read($, skin))) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Markdown, Raster } = ui
    const m = await read($, mode)
    const C = SWATCHES[m]
    const id = e.requestId
    const p = motion.entrance(id, 900)
    const pill = <Pill ui={ui} word="CLAUDE" p={p} background={pillFlash(C.claude, C.screen, p, motion.afterglow(`${id}:pill`, p))} ink={C.pillInk} />
    const voiceprint = <Raster key="voiceprint" columns={VOICEPRINT_COLUMNS} rows={1} cells={encodeCells(drawVoiceprint(VOICEPRINT_COLUMNS, seedOf(e.props.text), m))} />
    const gap = e.props.isFirstOfReply ? ROW_GAP : BLOCK_GAP
    // A table needs the full width (beside the gutter its borders would break): the speaker
    // takes a row of its own, and the block runs full width beneath it.
    if (hasMarkdownTable(e.props.text)) {
      return (
        <WideRow ui={ui} gap={gap} speaker={e.props.isFirstOfReply && [pill, voiceprint]}>
          <Markdown text={e.props.text} />
        </WideRow>
      )
    }
    return (
      <SpeakerRow ui={ui} gap={gap} speaker={e.props.isFirstOfReply && [pill, voiceprint]}>
        <Box flexGrow={1} flexShrink={1} flexDirection="column">
          <Markdown text={e.props.text} />
        </Box>
      </SpeakerRow>
    )
  })
}
