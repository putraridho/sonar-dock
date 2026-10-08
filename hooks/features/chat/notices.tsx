// The small rows around the chat: /sonar's own readout, the run-in-background hint under a call,
// the notices under the logo, the mode labels in the footer, and the threat beside the prompt hint.

import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { SHOWN_LEVEL, threatName } from '../../domain/threat'
import { plural } from '../../text/format'
import { SWATCHES } from '../../theme/palette'
import type { Context } from '../../runtime/context'
import { INITIAL } from '../../runtime/state'
import { Decrypt, GUTTER, Pill, ROW_GAP, SpeakerRow, pillFlash } from './kit'

// State this file reads or writes.
const mode = atom({ plugin: 'sonar-dock', key: 'mode' } as const, INITIAL.mode)
const skin = atom({ plugin: 'sonar-dock', key: 'skin' } as const, INITIAL.skin)
const threat = atom({ plugin: 'sonar-dock', key: 'threat' } as const, INITIAL.threat)
const stats = atom({ plugin: 'sonar-dock', key: 'stats' } as const, INITIAL.stats)

// `(ctrl+b to run in background)` → the key and what it does; null for any other wording.
export function hintParts(hint: string): { key: string; action: string } | null {
  const m = /^\(?\s*(\S+)\s+to\s+(.+?)\s*\)?$/.exec(hint.trim())
  return m ? { key: m[1]!.toUpperCase(), action: m[2]! } : null
}

export function installNoticeRows(on: On, { motion, surfaces }: Context): void {
  on('ui.render', { component: 'CommandOutput', surface: 'terminal', props: { command: 'sonar' } }, async ($, e, next) => {
    if (e.props.isErrored || e.props.args.trim() === 'off' || !(await read($, skin))) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const m = await read($, mode)
    const C = SWATCHES[m]
    // The readout is what held when the command ran, not what holds as the row is drawn again.
    let readout = surfaces.readouts.get(e.requestId)
    if (readout === undefined) {
      const s = await read($, stats)
      const level = await read($, threat)
      readout = [`PALETTE ${m.toUpperCase()}`, `THREAT ${threatName(level)}`, plural(s.turns, 'turn').toUpperCase(), plural(s.ops, 'action').toUpperCase()]
      if (s.errors > 0) readout.push(`${s.errors} FAILED`)
      surfaces.readouts.set(e.requestId, readout)
    }
    const p = motion.entrance(e.requestId, 1200)
    return (
      <SpeakerRow ui={ui} gap={ROW_GAP} speaker={<Pill ui={ui} word="SONAR" p={Math.min(1, p * 3)} background={pillFlash(C.accent, C.screen, p, motion.afterglow(`${e.requestId}:pill`, p))} ink={C.pillInk} />}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Decrypt ui={ui} text={e.props.text} p={p} color={C.ink} hot={C.accent} screen={C.screen} bold />
          <Text color={C.mute} wrap="wrap">
            {readout.join('  ·  ')}
          </Text>
        </Box>
      </SpeakerRow>
    )
  })

  on('ui.render', { component: 'ToolProgress', surface: 'terminal' }, async ($, e, next) => {
    if (e.props.hint === '' || !(await read($, skin))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const C = SWATCHES[await read($, mode)]
    const parts = hintParts(e.props.hint)
    return (
      <Box marginLeft={GUTTER}>
        <Text color={C.mute}>
          {'▸ '}
          {parts ? (
            <Text>
              <Text color={C.accent} bold>
                {parts.key}
              </Text>
              {`  ${parts.action}`}
            </Text>
          ) : (
            e.props.hint
          )}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'InfoNotice', surface: 'terminal' }, async ($, e, next) => {
    if (!(await read($, skin))) return next(e)
    const { Text } = $.ui.resolve(e)
    const C = SWATCHES[await read($, mode)]
    const command = e.props.command?.replace(/^\//, '')
    return (
      <Text color={C.mute} wrap="wrap">
        <Text color={C.accent}>{'› '}</Text>
        {e.props.text}
        {command ? <Text color={C.accent}>{` /${command}`}</Text> : ''}
      </Text>
    )
  })

  on('ui.render', { component: 'SessionMode', surface: 'terminal' }, async ($, e, next) => {
    if (e.props.modes.length === 0 || !(await read($, skin))) return next(e)
    const { Text } = $.ui.resolve(e)
    const C = SWATCHES[await read($, mode)]
    return <Text color={C.accent}>{e.props.modes.map(label => label.toUpperCase()).join(' · ')}</Text>
  })

  // The engine's hint line stays (its pills are live); a raised threat rides at its end.
  on('ui.render', { component: 'PromptHint', surface: 'terminal' }, async ($, e, next) => {
    if (!(await read($, skin))) return next(e)
    const level = await read($, threat)
    if (level < SHOWN_LEVEL) return next(e)
    return next({ ...e, props: { ...e.props, tail: `⚠ threat ${threatName(level).toLowerCase()}` } })
  })
}
