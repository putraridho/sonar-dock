// What Claude does, as the HUD records it: each prompt opens a turn, each tool call becomes a log
// line and a radar contact (and maybe a red alert), and each finished turn leaves a record.

import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { LogLine, Stats, TurnRecord } from '../../types'
import { PROMPT_KIND, describeCall, isCall, isFromPerson, promptLine, tagOf } from '../domain/calls'
import { DANGER_STEP, FAILURE_FLOOR, detectThreat, threatName } from '../domain/threat'
import { TOOLS, toolKind } from '../domain/tools'
import type { ToolKind } from '../domain/tools'
import { fiveHourPercent } from '../domain/usage'
import { fit } from '../text/format'
import type { Context } from '../runtime/context'
import { INITIAL, LOG_LIMIT, TURN_LIMIT } from '../runtime/state'

// State this file reads or writes.
const log = atom({ plugin: 'sonar-dock', key: 'log' } as const, INITIAL.log)
const stats = atom({ plugin: 'sonar-dock', key: 'stats' } as const, INITIAL.stats)
const threat = atom({ plugin: 'sonar-dock', key: 'threat' } as const, INITIAL.threat)
const alert = atom({ plugin: 'sonar-dock', key: 'alert' } as const, INITIAL.alert)
const turns = atom({ plugin: 'sonar-dock', key: 'turns' } as const, INITIAL.turns)
const reserves = atom({ plugin: 'sonar-dock', key: 'reserves' } as const, INITIAL.reserves)

const ALERT_TOAST_MS = 6000
const STATUS_DETAIL = 40
const RECORDED_CALLS = 120

export function installTelemetry(on: On, ctx: Context): void {
  const { scene, hud, surfaces, agents } = ctx

  on('prompt.submit', async ($, e, next) => {
    const at = Date.now()
    await update($, stats, s => ({ ...s, turns: s.turns + 1, turnStartedAt: at }))
    if (isFromPerson(e.origin)) {
      const asked: LogLine = { id: `prompt:${at}`, at, tool: 'YOU', detail: promptLine(e.text), state: 'ok', kind: PROMPT_KIND }
      await update($, log, list => [...list, asked].slice(-LOG_LIMIT))
    }
    ctx.turn.costAtStart = (await read($, reserves)).costUsd
    scene.think()
    $.ui.status(hud.statusText('ENGAGED'))
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const kind = toolKind(e.tool)
    const detail = describeCall(e)
    const tag = tagOf(detail)
    const id = e.tool_use_id
    const agent = agents.numberOf(e.agentId)
    surfaces.callStarted(id, kind)
    agents.callStarted(agent, Date.now())
    scene.toolStarted(kind, tag)
    const blip = hud.addBlip(kind, tag, scene.now(), agent)
    // The command itself, not the description given for it: a calm description can hide a rm -rf.
    if (e.tool === 'Bash') await raiseAlarm($, ctx, e.command)
    await update($, log, list => [...list, { id, at: Date.now(), tool: TOOLS[kind].tag, detail, state: 'run', kind, agent } satisfies LogLine].slice(-LOG_LIMIT))
    $.ui.status(hud.statusText(`${TOOLS[kind].tag} ${fit(detail, STATUS_DETAIL).trim()}`))

    const ran = await next(e).finally(() => {
      surfaces.callEnded(id)
      agents.callEnded(agent, Date.now())
      if (!surfaces.isToolRunning) scene.toolsSettled()
    })

    const isFailed = ran.isError === true || ran.deny !== undefined
    blip.isLive = false
    blip.isFailed = isFailed
    await update($, log, list => list.map((l): LogLine => (l.id === id ? { ...l, state: isFailed ? 'err' : 'ok', end: Date.now() } : l)))
    await update($, stats, s => tally(s, kind, isFailed, (e as { file_path?: unknown }).file_path))
    if (isFailed) await update($, threat, () => hud.setLevel(Math.max(hud.level, FAILURE_FLOOR)))
    return ran
  }).catch((_$, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    scene.rest()
    const s = await read($, stats)
    if (s.turnStartedAt !== null) {
      const started = s.turnStartedAt
      const mine = (await read($, log)).filter(l => l.at >= started && isCall(l))
      if (mine.length > 0) $.ui.toast(`✦ SWEEP COMPLETE ▸ ${Math.round((Date.now() - started) / 1000)}s · ${mine.length} ops · threat ${threatName(hud.level)}`)
      const record = recordOf(e.turnId, mine, started, e.durationMs, fiveHourPercent(await read($, reserves)))
      await update($, turns, all => [...all, record].slice(-TURN_LIMIT))
    }
    await update($, stats, x => ({ ...x, turnStartedAt: null }))
    surfaces.turnEnded()
    $.ui.status(hud.statusText())
    return next(e)
  })
}

// A shell command that matches the threat matrix raises the level and sounds the alarm.
async function raiseAlarm($: EngineInterface, ctx: Context, command: string): Promise<void> {
  const danger = detectThreat(command)
  if (!danger) return
  await update($, threat, () => ctx.hud.setLevel(ctx.hud.level + DANGER_STEP))
  await update($, alert, () => danger)
  $.ui.toast(`⚠ RED ALERT ▸ ${danger} DETECTED`, { timeoutMs: ALERT_TOAST_MS })
}

function tally(s: Stats, kind: ToolKind, isFailed: boolean, path: unknown): Stats {
  const isEdit = kind === 'edit'
  const isNewFile = isEdit && typeof path === 'string' && !s.files.includes(path)
  return {
    ...s,
    ops: s.ops + 1,
    edits: s.edits + (isEdit && !isFailed ? 1 : 0),
    errors: s.errors + (isFailed ? 1 : 0),
    files: isNewFile ? [...s.files, path] : s.files,
  }
}

function recordOf(id: string, lines: readonly LogLine[], started: number, ms: number, fiveHour: number | null): TurnRecord {
  return {
    id,
    ms,
    ops: lines.length,
    errors: lines.filter(l => l.state === 'err').length,
    fiveHour,
    calls: lines.slice(-RECORDED_CALLS).map(l => ({ s: l.at - started, e: (l.end ?? Date.now()) - started, k: l.kind ?? 'other', f: l.state === 'err', a: l.agent })),
  }
}
