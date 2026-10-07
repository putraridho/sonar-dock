// Tool calls in the chat: a pill per call that decrypts in and glints when the call settles, a
// shimmer under it while it runs, the last lines of a shell call's output, and grouped lookups.

import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { describeCall, isPath, mcpLine, metricOf, previewLines, tagOf } from '../../domain/calls'
import { TOOLS, toolKind } from '../../domain/tools'
import { ease } from '../../lib/math'
import { glint, jitter } from '../../motion/effects'
import { encodeCells } from '../../raster/cells'
import { drawShimmer } from '../../raster/strips'
import { plural } from '../../text/format'
import { SWATCHES, mixHex } from '../../theme/palette'
import type { Swatch } from '../../theme/palette'
import type { Context } from '../../runtime/context'
import { INITIAL } from '../../runtime/state'
import { SHIMMER_COLUMNS } from '../loops'
import { Decrypt, GUTTER, Pill, ROW_GAP, SpeakerRow, pillFlash } from './kit'

// State this file reads or writes.
const mode = atom({ plugin: 'sonar-dock', key: 'mode' } as const, INITIAL.mode)
const skin = atom({ plugin: 'sonar-dock', key: 'skin' } as const, INITIAL.skin)

const SPINNER = '◐◓◑◒'
const PILL_DECODE_RATE = 2.2

type CallState = { isRunning: boolean; isInterrupted?: boolean; isErrored: boolean }

// The mark at a call's right edge, and the count beside it once it is done.
function markOf(call: CallState, C: Swatch, output: unknown): { glyph: string; color: string; metric: string } {
  if (call.isRunning) return { glyph: SPINNER[Math.floor(Date.now() / 120) % SPINNER.length]!, color: C.amber, metric: '' }
  if (call.isInterrupted) return { glyph: '–', color: C.mute, metric: 'stopped' }
  if (call.isErrored) return { glyph: '✗', color: C.red, metric: 'failed' }
  return { glyph: '✓', color: C.accent, metric: metricOf(output) }
}

export function installToolRows(on: On, { motion, surfaces }: Context): void {
  on('ui.render', { component: 'ToolUse', surface: 'terminal' }, async ($, e, next) => {
    if (!(await read($, skin))) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text, Raster } = ui
    const m = await read($, mode)
    const C = SWATCHES[m]
    const call = e.props
    const id = call.tool_use_id
    const kind = toolKind(call.tool)
    const color = C.tool(kind)
    if (call.isRunning) motion.keepMoving()
    const mark = markOf(call, C, call.output)
    const enter = motion.entrance(id, 1700)
    const settle = call.isRunning ? 1 : motion.entrance(`${id}:done`, 900)
    // A running call's pill breathes; a finished one glows twice as it settles.
    const background =
      call.isRunning && enter >= 0.35
        ? mixHex(color, C.screen, 0.45 * ((Math.sin(Date.now() / 220) + 1) / 2))
        : pillFlash(color, C.screen, enter, call.isRunning ? 0 : motion.afterglow(`${id}:pill`, settle))
    const detail = (call.tool.startsWith('mcp__') && mcpLine(call.tool, call.input)) || describeCall(call.input ?? {}) || call.tool
    const [before, shine, after] = enter < 1 ? [detail, '', ''] : glint(detail, settle)
    const row = (
      <SpeakerRow ui={ui} gap={ROW_GAP} shift={jitter(id, enter)} speaker={<Pill ui={ui} word={TOOLS[kind].pill} p={Math.min(1, enter * PILL_DECODE_RATE)} background={background} ink={C.pillInk} />}>
        <Box flexGrow={1} flexShrink={1}>
          {enter < 1 ? (
            <Decrypt ui={ui} text={detail} p={enter} color={C.ink} hot={color} screen={C.screen} />
          ) : (
            <Text color={C.ink}>
              {before}
              <Text backgroundColor={mixHex(C.screen, mark.color, 0.35)} color={C.ink} bold>
                {shine}
              </Text>
              {after}
            </Text>
          )}
        </Box>
        <Box flexShrink={0} marginLeft={2}>
          <Text color={mixHex(C.screen, call.isErrored ? C.red : C.mute, ease(settle))}>{mark.metric ? `${mark.metric}  ` : ''}</Text>
          <Text color={mixHex(C.screen, mark.color, ease(settle))} bold={settle < 1}>
            {mark.glyph}
          </Text>
        </Box>
      </SpeakerRow>
    )
    if (!call.isRunning) return row
    surfaces.shimmers.add(id)
    if (!surfaces.running.has(id)) surfaces.callStarted(id, kind)
    return (
      <Box flexDirection="column">
        {row}
        <Box marginLeft={GUTTER}>
          <Raster key="shimmer" columns={SHIMMER_COLUMNS} rows={1} cells={encodeCells(drawShimmer(SHIMMER_COLUMNS, Date.now(), kind, m))} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult', surface: 'terminal' }, async ($, e, next) => {
    if (!(await read($, skin))) return next(e)
    const ui = $.ui.resolve(e)
    const { Box } = ui
    const kind = toolKind(e.props.tool)
    // Diffs and errors keep the engine's own drawing, in the content column.
    if (kind === 'edit' || e.props.isErrored) return <Box marginLeft={GUTTER}>{await next(e)}</Box>
    const lines = kind === 'bash' ? previewLines(e.props.output) : []
    if (lines.length === 0) return <Box />
    const C = SWATCHES[await read($, mode)]
    const q = motion.entrance(`${e.requestId}:out`, 900 + lines.length * 250)
    return (
      <Box flexDirection="column" marginLeft={GUTTER}>
        {lines.map((line, i) => {
          const isMore = line.startsWith('… ') && i === lines.length - 1
          const own = Math.max(0, Math.min(1, q * (lines.length + 1) - i))
          return <Decrypt ui={ui} text={`${isMore ? '  ' : '│ '}${line}`} p={own} color={C.mute} hot={C.accent} screen={C.screen} wrap="truncate-end" />
        })}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolGroup', surface: 'terminal' }, async ($, e, next) => {
    if (e.props.isExpanded || !(await read($, skin))) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const C = SWATCHES[await read($, mode)]
    const calls = e.props.calls
    const kinds = calls.map(c => toolKind(c.tool))
    const kind = kinds.every(k => k === kinds[0]) ? (kinds[0] ?? 'search') : 'search'
    const targets = [...new Set(calls.map(c => describeCall(c.input ?? {})).map(d => (isPath(d) ? tagOf(d) : d)).filter(Boolean))]
    const isBusy = calls.some(c => c.isRunning)
    const enter = motion.entrance(e.requestId, 1700)
    const count = kind === 'bash' ? plural(calls.length, 'command') : plural(calls.length, 'lookup')
    return (
      <SpeakerRow
        ui={ui}
        gap={ROW_GAP}
        speaker={<Pill ui={ui} word={TOOLS[kind].pill} p={Math.min(1, enter * PILL_DECODE_RATE)} background={pillFlash(C.tool(kind), C.screen, enter, motion.afterglow(`${e.requestId}:pill`, enter))} ink={C.pillInk} />}
      >
        <Box flexShrink={0}>
          <Text color={C.ink}>{count}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} marginLeft={2}>
          <Decrypt ui={ui} text={targets.join('  ·  ')} p={enter} color={C.mute} hot={C.mute} screen={C.screen} />
        </Box>
        <Box flexShrink={0} marginLeft={2}>
          <Text color={isBusy ? C.amber : C.accent}>{isBusy ? '◌' : '✓'}</Text>
        </Box>
      </SpeakerRow>
    )
  })
}
