// The turn's own rows: the spinner as a HUD line (stream meter, mission word, T+ clock, cost and
// context), and DONE with the turn's flight recorder once it ends.

import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import type { TurnRecord } from '../../../types'

import { alertText, spinSuffix, spinTag, spinWord } from '../../domain/spin'
import { ease } from '../../lib/math'
import { decode } from '../../motion/effects'
import { encodeCells } from '../../raster/cells'
import { drawMeter, drawTimeline, timelineLanes } from '../../raster/strips'
import { duration, plural, sweepClock } from '../../text/format'
import { SWATCHES } from '../../theme/palette'
import type { Context } from '../../runtime/context'
import { METER_COLUMNS } from '../../runtime/context'
import { INITIAL } from '../../runtime/state'
import { GUTTER, Pill, ROW_GAP, SpeakerRow, pillFlash } from './kit'
import type { Ui } from './kit'

// State this file reads or writes.
const stats = atom({ plugin: 'sonar-dock', key: 'stats' } as const, INITIAL.stats)
const now = atom({ plugin: 'sonar-dock', key: 'now' } as const, INITIAL.now)
const mode = atom({ plugin: 'sonar-dock', key: 'mode' } as const, INITIAL.mode)
const skin = atom({ plugin: 'sonar-dock', key: 'skin' } as const, INITIAL.skin)
const turns = atom({ plugin: 'sonar-dock', key: 'turns' } as const, INITIAL.turns)
const reserves = atom({ plugin: 'sonar-dock', key: 'reserves' } as const, INITIAL.reserves)

/** A turn's record matches its DONE row when their durations agree this closely. */
const RECORD_MATCH_MS = 1500

// The record a DONE row draws: the one it claimed before, else the closest unclaimed one in time.
function claimRecord(records: readonly TurnRecord[], claims: Map<string, string>, row: string, durationMs: number): TurnRecord | undefined {
  const claimed = claims.get(row)
  if (claimed !== undefined) return records.find(r => r.id === claimed)
  const taken = new Set(claims.values())
  const best = records
    .filter(r => r.id !== undefined && !taken.has(r.id) && Math.abs(r.ms - durationMs) < RECORD_MATCH_MS)
    .sort((a, b) => Math.abs(a.ms - durationMs) - Math.abs(b.ms - durationMs))[0]
  if (best?.id !== undefined) claims.set(row, best.id)
  return best
}

export function installStatusRows(on: On, { motion, scene, surfaces, flow, turn }: Context): void {
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const sm = e.props.mode
    scene.follow(sm, surfaces.isToolRunning)
    if (!(await read($, skin))) return next(e)
    // Reading `now` redraws the line each second; the time itself is the wall clock's.
    await read($, now)
    const t = Date.now()
    const s = await read($, stats)
    if (!surfaces.spinnerSeenAt.has(e.requestId)) surfaces.spinnerSeenAt.set(e.requestId, t)
    const started = s.turnStartedAt ?? surfaces.spinnerSeenAt.get(e.requestId)!
    const word = spinWord(sm, `${e.requestId}:${started}`, t - started)
    const message = e.props.message === null ? null : alertText(e.props.message)
    if (e.surface !== 'terminal') return next({ ...e, props: { ...e.props, word, message, suffix: ` ${spinSuffix(t)}` } })

    const { Box, Text, Raster } = $.ui.resolve(e)
    const m = await read($, mode)
    const C = SWATCHES[m]
    const res = await read($, reserves)
    const label = message ?? word.toUpperCase()
    const d = decode(label, motion.entrance(`${e.requestId}:${label}`, 600))
    const parts = [`T+${sweepClock(Math.max(0, t - started))}`]
    if (res.costUsd !== null && turn.costAtStart !== null && res.costUsd > turn.costAtStart) parts.push(`+$${(res.costUsd - turn.costAtStart).toFixed(2)}`)
    if (res.contextPercent !== null) parts.push(`CTX ${Math.round(res.contextPercent)}%`)
    parts.push(spinTag(sm))

    surfaces.spinners.add(e.requestId)
    surfaces.meterKind = sm === 'tool-use' ? scene.kind : 'other'
    return (
      <Box flexDirection="row" marginTop={1}>
        <Raster key="pulse" columns={METER_COLUMNS} rows={1} cells={encodeCells(drawMeter(METER_COLUMNS, flow.readings, surfaces.meterKind, m))} />
        <Text color={message ? C.amber : C.accent} bold>
          {` ${message ? '⚠ ' : ''}${d.done}`}
          <Text color={C.ink}>{d.hot + d.head}</Text>
        </Text>
        <Text color={C.accent}>{` ${spinSuffix(t)} `}</Text>
        <Text color={C.mute} wrap="truncate-end">
          {parts.join('  ·  ')}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!(await read($, skin))) return next(e)
    const ui = $.ui.resolve(e) as unknown as Ui
    const { Box, Text, Raster } = ui
    const m = await read($, mode)
    const C = SWATCHES[m]
    const record = claimRecord(await read($, turns), surfaces.doneRows, e.requestId, e.props.durationMs)
    const reveal = motion.entrance(e.requestId, 2200)
    const k = ease(reveal)
    const parts = [duration(e.props.durationMs * k)]
    if (record) {
      if (record.ops > 0) parts.push(plural(Math.round(record.ops * k), 'action'))
      if (record.errors > 0) parts.push(`${record.errors} failed`)
      if (record.fiveHour !== null) parts.push(`5-hour ${Math.round(record.fiveHour)}%`)
    }
    const color = (record?.errors ?? 0) > 0 ? C.amber : C.accent
    const head = (
      <SpeakerRow ui={ui} gap={ROW_GAP} speaker={<Pill ui={ui} word="DONE" p={Math.min(1, reveal * 3)} background={pillFlash(color, C.screen, reveal, motion.afterglow(`${e.requestId}:pill`, reveal))} ink={C.pillInk} />}>
        <Text color={C.mute}>{parts.join('  ·  ')}</Text>
      </SpeakerRow>
    )
    if (e.surface !== 'terminal' || !record || !(record.calls?.length > 0)) return head

    // The flight recorder draws in as the duration counts up.
    const columns = Math.max(20, Math.min(64, (e.viewport?.columns ?? 100) - GUTTER - 26))
    const edge = e.props.durationMs * k
    const shown = record.calls.filter(c => c.s <= edge).map(c => ({ ...c, e: Math.min(c.e, edge) }))
    // The lanes come from every call of the turn, so they hold still while the bars draw in.
    const lanes = timelineLanes(record.calls)
    return (
      <Box flexDirection="column">
        {head}
        <Box flexDirection="row" marginLeft={GUTTER}>
          <Raster key="timeline" columns={columns} rows={Math.ceil(lanes.length / 2)} cells={encodeCells(drawTimeline(columns, shown, e.props.durationMs, m, lanes))} />
          <Box flexDirection="column" marginLeft={2}>
            {pairsOf(lanes).map(pair => (
              <Text>
                {pair.map(lane => (
                  <Text>
                    <Text color={C.tool(lane.kind)}>━ </Text>
                    <Text color={C.mute}>{lane.noun.padEnd(7)}</Text>
                  </Text>
                ))}
              </Text>
            ))}
          </Box>
        </Box>
      </Box>
    )
  })
}

// The legend beside the timeline: its lanes two to a row, as the half blocks stack them.
function pairsOf<T>(items: readonly T[]): T[][] {
  const pairs: T[][] = []
  for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2))
  return pairs
}
