// The dashboard's sections, top to bottom: threat, usage gauges, the activity log, the totals.

import type { Inspect, LogLine, Mark, Reserves, Stats } from '../../../types'
import { isCall } from '../../domain/calls'
import { TOOLS, asToolKind } from '../../domain/tools'
import { ALERT_LEVEL, threatName } from '../../domain/threat'
import { untilReset, windowName } from '../../domain/usage'
import { ease } from '../../lib/math'
import { typed } from '../../motion/effects'
import type { Motion } from '../../motion/motion'
import { agentTag } from '../../runtime/agents'
import { clock, noun, sentenceCase } from '../../text/format'
import { gaugeColor, mixHex } from '../../theme/palette'
import type { Mode, Swatch } from '../../theme/palette'
import { LABEL_W } from './kit'
import type { PaneUi, ScreenText } from './kit'

type Section = { ui: PaneUi; C: Swatch; T: ScreenText }

export function ThreatLine({ ui, C, T, level, danger }: Section & { level: number; danger: string | null }) {
  const { Box } = ui
  return (
    <Box flexDirection="row">
      <Box width={LABEL_W} flexShrink={0}>
        <T color={C.mute}>Threat</T>
      </Box>
      <T color={C.threat[level] ?? C.accent} bold={level >= ALERT_LEVEL}>
        {sentenceCase(threatName(level))}
      </T>
      {danger !== null && <T color={C.red}>{`  ·  ${danger.toLowerCase()}`}</T>}
    </Box>
  )
}

type Gauge = { name: string; pct: number; note: string }

export function gaugesOf(res: Reserves, nowMs: number): Gauge[] {
  const windows = res.limits.map(l => ({ name: windowName(l.kind), pct: l.percentUsed, note: untilReset(l.resetsAt, nowMs) }))
  if (res.contextPercent === null) return windows
  return [...windows, { name: 'Context', pct: res.contextPercent, note: res.costUsd !== null ? `$${res.costUsd.toFixed(2)}` : '' }]
}

export function Usage({ ui, C, T, gauges, width, mode, motion }: Section & { gauges: Gauge[]; width: number; mode: Mode; motion: Motion }) {
  const { Box } = ui
  if (gauges.length === 0) return <T color={C.mute}>Waiting for the first reading</T>
  const track = Math.max(8, Math.min(28, width - LABEL_W - 18))
  return (
    <Box flexDirection="column">
      {gauges.map(g => {
        const pct = motion.glide(g.name, g.pct)
        const fill = Math.round((track * Math.min(100, pct)) / 100)
        return (
          <Box flexDirection="row">
            <Box width={LABEL_W} flexShrink={0}>
              <T color={C.mute}>{g.name}</T>
            </Box>
            <T color={gaugeColor(g.pct, mode)}>{'━'.repeat(fill)}</T>
            <T color={C.track}>{'━'.repeat(track - fill)}</T>
            <Box width={6} flexShrink={0} justifyContent="flex-end">
              <T>{`${Math.round(pct)}%`}</T>
            </Box>
            <T color={C.mute}>{g.note ? `   ${g.note}` : ''}</T>
          </Box>
        )
      })}
    </Box>
  )
}

const TIME_W = 7
const MARK_W = 3

// The newest log lines that fit in `rows`; each detail wraps in full, so lines are counted by wrapped rows.
export function linesThatFit(list: readonly LogLine[], rows: number, width: number): LogLine[] {
  const detailW = Math.max(1, width - TIME_W - MARK_W - LABEL_W)
  const shown: LogLine[] = []
  for (let i = list.length - 1, used = 0; i >= 0; i--) {
    const line = list[i]!
    const needs = Math.max(1, Math.ceil((line.detail.length + (line.agent === undefined ? 0 : 5)) / detailW))
    if (shown.length > 0 && used + needs > rows) break
    shown.unshift(line)
    used += needs
  }
  return shown
}

export function ActivityLog({ ui, C, T, lines, width, motion }: Section & { lines: LogLine[]; width: number; motion: Motion }) {
  const { Box } = ui
  if (lines.length === 0) return <T color={C.mute}>Nothing yet</T>
  const marks = { run: { glyph: '◌', color: C.amber }, err: { glyph: '✗', color: C.red }, ok: { glyph: '✓', color: C.accent } }
  return (
    <Box flexDirection="column">
      {lines.map(line => {
        const p = motion.entrance(`log:${line.id}`, 500)
        const enter = ease(p)
        const kind = asToolKind(line.kind)
        // A prompt reads as the person speaking; a call, as its tool (and its subagent, if any).
        const isAsked = !isCall(line)
        const mark = isAsked ? { glyph: '›', color: C.accent } : marks[line.state]
        const label = isAsked ? { word: 'You', color: C.accent } : { word: sentenceCase(TOOLS[kind].noun), color: C.tool(kind) }
        const via = line.agent === undefined ? '' : `${agentTag(line.agent)} › `
        return (
          <Box flexDirection="row" width={width}>
            <Box width={TIME_W} flexShrink={0}>
              <T color={C.mute}>{clock(line.at).slice(0, 5)}</T>
            </Box>
            <Box width={MARK_W} flexShrink={0}>
              <T color={mixHex(C.screen, mark.color, enter)}>{mark.glyph}</T>
            </Box>
            <Box width={LABEL_W} flexShrink={0}>
              <T color={mixHex(C.screen, label.color, enter)}>{label.word}</T>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <T color={isAsked || line.state === 'run' ? C.ink : C.mute}>
                {via && <T color={C.tool('agent')}>{via}</T>}
                {typed(line.detail, p)}
              </T>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/** Rows a total's list takes at most, its "more" line included. */
export const INSPECT_ROWS = 8

// The totals; edits, files and errors are buttons that open their list under the row.
export function Totals({ ui, C, T, stats, open, onToggle }: Section & { stats: Stats; open: Inspect; onToggle: (k: Exclude<Inspect, null>) => void }) {
  const { Box, Button } = ui
  const totals = [
    { k: null, n: stats.ops, word: noun(stats.ops, 'action'), isAlarm: false },
    { k: 'edits', n: stats.edits, word: noun(stats.edits, 'edit'), isAlarm: false },
    { k: 'files', n: stats.files.length, word: noun(stats.files.length, 'file'), isAlarm: false },
    { k: 'errors', n: stats.errors, word: noun(stats.errors, 'error'), isAlarm: stats.errors > 0 },
  ] as const
  return (
    <Box flexDirection="row" flexWrap="wrap">
      {totals.map(t =>
        t.k === null || t.n === 0 ? (
          <Box marginRight={3}>
            <T color={C.ink} bold>
              {String(t.n)}
            </T>
            <T color={C.mute}>{` ${t.word}`}</T>
          </Box>
        ) : (
          <Box marginRight={2}>
            <Button key={`total:${t.k}`} plain onPress={() => onToggle(t.k)}>
              {`${t.n} ${t.word} ${open === t.k ? '▾' : '▸'}`}
            </Button>
            {t.isAlarm && <T color={C.red}>{' !'}</T>}
          </Box>
        ),
      )}
    </Box>
  )
}

// The list a total opens: newest first, cut to INSPECT_ROWS with a line saying how many more.
export function inspected(stats: Stats, open: Inspect): { rows: { time?: number; tool?: string; text: string; reason?: string }[]; more: number } {
  const all =
    open === 'files'
      ? [...stats.files].reverse().map(text => ({ text }))
      : [...((open === 'edits' ? stats.edited : open === 'errors' ? stats.failed : undefined) ?? [])].reverse().map((m: Mark) => ({ time: m.at, tool: m.tool, text: m.detail, reason: m.reason }))
  const room = all.length > INSPECT_ROWS ? INSPECT_ROWS - 1 : INSPECT_ROWS
  return { rows: all.slice(0, room), more: all.length - Math.min(all.length, room) }
}

export function Inspector({ ui, C, T, stats, open, width }: Section & { stats: Stats; open: Inspect; width: number }) {
  const { Box } = ui
  if (open === null) return null
  const { rows, more } = inspected(stats, open)
  if (rows.length === 0) return <T color={C.mute}>Calls from before this update were not recorded</T>
  return (
    <Box flexDirection="column" width={width}>
      {rows.map(r => (
        <Box flexDirection="row" width={width}>
          {r.time !== undefined && (
            <Box width={TIME_W} flexShrink={0}>
              <T color={C.mute}>{clock(r.time).slice(0, 5)}</T>
            </Box>
          )}
          <Box flexGrow={1} flexShrink={1}>
            <T color={open === 'errors' ? C.red : C.ink}>{tailOf(r.text, width - (r.time === undefined ? 0 : TIME_W))}</T>
            {r.reason !== undefined && <T color={C.mute}>{`  ${r.reason}`}</T>}
          </Box>
        </Box>
      ))}
      {more > 0 && <T color={C.mute}>{`+ ${more} more`}</T>}
    </Box>
  )
}

// A path that does not fit keeps its end: the file name matters more than the folders above it.
function tailOf(text: string, width: number): string {
  return text.length <= width || width < 4 ? text : `…${text.slice(text.length - width + 1)}`
}
