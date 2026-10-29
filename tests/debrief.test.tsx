import type { UiOpenResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { debriefLines, watchLength, watchStart } from '../hooks/domain/debrief'
import { fullIn, roughly } from '../hooks/domain/usage'
import { gaugesOf } from '../hooks/features/pane/sections'
import { Pace } from '../hooks/runtime/pace'
import { INITIAL } from '../hooks/runtime/state'

const MIN = 60_000
const window = (percentUsed: number, resetsAt = '2026-10-29T12:00:00Z') => ({ limits: [{ kind: 'five_hour', percentUsed, resetsAt }], contextPercent: null, costUsd: null })
const at = (iso: string) => Date.parse(iso)

describe('usage pace', () => {
  test('a rising window forecasts when it fills; flat, too new, or resetting first does not', async () => {
    const now = at('2026-10-29T10:00:00Z')
    const rising = [{ at: now - 10 * MIN, percent: 40 }, { at: now, percent: 50 }]
    expect(fullIn(rising, '2026-10-29T12:00:00Z', now)).toBe(50 * MIN)
    expect(fullIn(rising, '2026-10-29T10:30:00Z', now)).toBe(null)
    expect(fullIn([{ at: now - 10 * MIN, percent: 50 }, { at: now, percent: 50 }], undefined, now)).toBe(null)
    expect(fullIn([{ at: now - MIN, percent: 40 }, { at: now, percent: 50 }], undefined, now)).toBe(null)
  })

  test('reads loosely: minutes, then hours to the ten minutes', async () => {
    expect(roughly(40 * MIN)).toBe('~40m')
    expect(roughly(127 * MIN)).toBe('~2h 10m')
    expect(roughly(118 * MIN)).toBe('~2h 00m')
  })

  test('warns once per reset period, and starts over when the window resets', async () => {
    const pace = new Pace()
    const t0 = at('2026-10-29T10:00:00Z')
    pace.note(window(60), t0)
    pace.note(window(70), t0 + 10 * MIN)
    expect(pace.soon(window(70), t0 + 10 * MIN)).toEqual([{ kind: 'five_hour', ms: 30 * MIN }])
    expect(pace.soon(window(70), t0 + 10 * MIN)).toEqual([])
    const next = window(5, '2026-10-29T17:00:00Z')
    pace.note(next, t0 + 20 * MIN)
    expect(pace.fullIn('five_hour', t0 + 20 * MIN)).toBe(null)
  })

  test('the gauge says when it fills in place of the reset, while the pace says so', async () => {
    const now = at('2026-10-29T10:00:00Z')
    expect(gaugesOf(window(70), now, () => 30 * MIN)[0]).toEqual({ name: '5-hour', pct: 70, note: 'full ~30m', isForecast: true })
    expect(gaugesOf(window(70), now, () => null)[0]!.note).toBe('2h 00m')
  })
})

describe('the debrief', () => {
  test('counts the session, its calls by kind, the peak threat and the cost', async () => {
    const stats = { ...INITIAL.stats, turns: 3, ops: 9, edits: 2, errors: 1, files: ['a.ts', 'b.ts'], kinds: { bash: 4, read: 3, edit: 2 }, peak: 3 }
    expect(debriefLines(stats, 1.5, 47 * MIN)).toEqual([
      'DEBRIEF ▸ 47m on watch',
      '3 turns · 9 actions · 2 edits · 2 files touched · 1 error',
      'shell 4 · read 3 · edit 2',
      'peak threat high · $1.50',
    ])
    expect(debriefLines(INITIAL.stats, null, 0)).toEqual(['DEBRIEF ▸ 0m on watch', 'No contacts this session.'])
    expect(watchLength(125 * MIN)).toBe('2h 05m')
  })

  test('the watch runs from the session start kept in stats, or the oldest record if that is earlier', async () => {
    const log = [{ at: 5000 }, { at: 9000 }]
    expect(watchStart({ ...INITIAL.stats, startedAt: 1000 }, log, 99_000)).toBe(1000)
    // A start kept late, at a reload, gives way to the records before it.
    expect(watchStart({ ...INITIAL.stats, startedAt: 90_000 }, log, 99_000)).toBe(5000)
    expect(watchStart({ ...INITIAL.stats, failed: [{ at: 3000, tool: 'BASH', detail: 'x' }] }, log, 99_000)).toBe(3000)
    expect(watchStart(INITIAL.stats, [], 99_000)).toBe(99_000)
  })

  test('/sonar debrief answers with it, and the skin draws its lines under the headline', async ($, on) => {
    on('ui.open', async () => ({ value: { isPlaced: true } as UiOpenResult }))
    on('command.run', async () => ({ text: 'engine' }))
    on('store.set', async () => ({ value: undefined }) as never)
    on('ui.close', async () => ({ value: undefined }) as never)
    on('tool.call', async () => ({ result: { stdout: '', stderr: '' } }) as never)
    await $.command.run({ command: 'sonar', args: '' } as Parameters<typeof $.command.run>[0])
    await $.tool.call({ tool: 'Bash', tool_use_id: 'toolu_rm', command: 'rm -rf build', description: 'Clean' } as never)
    const answer = (await $.command.run({ command: 'sonar', args: 'debrief' } as Parameters<typeof $.command.run>[0])) as { text: string }
    expect(answer.text).toMatch(/^DEBRIEF ▸ /)
    expect(answer.text).toContain('shell 1')
    expect(answer.text).toContain('peak threat high')

    const row = await $.ui.mount({ plugin: 'sonar-dock', surface: 'terminal', component: 'CommandOutput', requestId: 'debrief', props: { command: 'sonar', args: 'debrief', text: answer.text, isErrored: false } } as never)
    expect(await row.find({ type: 'Text', text: /shell 1/ })).toBeDefined()
    expect(await row.find({ type: 'Text', text: /PALETTE/ })).toBeUndefined()
    await row.unmount()

    const off = (await $.command.run({ command: 'sonar', args: 'off' } as Parameters<typeof $.command.run>[0])) as { text: string }
    expect(off.text).toMatch(/^Sonar Dock standing down\. Chat restored\.\nDEBRIEF ▸ /)
  })
})
