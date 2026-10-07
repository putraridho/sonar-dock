import type { TurnStepChunk, UiOpenResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { alertText, spinWord } from '../hooks/domain/spin'
import { drawMeter } from '../hooks/raster/strips'
import { FlowMeter } from '../hooks/runtime/flow'
import { paceStream } from '../hooks/runtime/live'
import { sweepClock } from '../hooks/text/format'

describe('spinner words', () => {
  test('holds a word for a while, then moves on through the mode list', async () => {
    const first = spinWord('thinking', 'agent:1', 0)
    expect(spinWord('thinking', 'agent:1', 7_000)).toBe(first)
    expect(spinWord('thinking', 'agent:1', 8_000)).not.toBe(first)
  })

  test('falls back for a mode it does not know', async () => {
    expect(spinWord('mystery', 'x', 0)).toBe('Working')
  })

  test('turns an override message into an alert', async () => {
    expect(alertText('Compacting conversation…')).toBe('COMPACTING CONVERSATION')
    expect(alertText('Waiting for permission...')).toBe('WAITING FOR PERMISSION')
  })

  test('reads the sweep clock as T+ minutes and seconds', async () => {
    expect(sweepClock(560_000)).toBe('09:20')
    expect(sweepClock(3_725_000)).toBe('01:02:05')
  })
})

test('the spinner is redrawn as a HUD line while the skin is on', async ($, on) => {
  on('ui.open', async () => ({ value: { isPlaced: true } as UiOpenResult }))
  on('command.run', async () => ({ text: 'engine' }))
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`engine ${e.component}`}</Text>
  })
  const SPIN = {
    plugin: 'sonar-dock',
    surface: 'terminal',
    component: 'Spinner',
    requestId: 'main',
    props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
  } as const

  const plain = await $.ui.mount(SPIN)
  expect(await plain.find({ type: 'Text', text: /engine Spinner/ })).toBeDefined()
  await plain.unmount()

  await $.command.run({ command: 'sonar', args: '' } as Parameters<typeof $.command.run>[0])
  const hud = await $.ui.mount(SPIN)
  expect(await hud.find({ type: 'Raster', key: 'pulse' })).toBeDefined()
  expect(await hud.find({ type: 'Text', text: /T\+\d\d:\d\d/ })).toBeDefined()
  expect(await hud.find({ type: 'Text', text: /THINKING/ })).toBeDefined()
  await hud.unmount()

  const alerting = await $.ui.mount({ ...SPIN, props: { ...SPIN.props, message: 'Compacting conversation…' } })
  expect(await alerting.find({ type: 'Text', text: /⚠/ })).toBeDefined()
  await alerting.unmount()
})

describe('stream meter', () => {
  test('a sample with streamed text rises, a quiet one stays flat', async () => {
    const meter = new FlowMeter(8)
    expect(Math.max(...meter.roll())).toBe(0)
    meter.note(120)
    const busy = meter.roll()
    expect(busy[busy.length - 1]).toBeGreaterThan(0.9)
    const quiet = meter.roll()
    expect(quiet[quiet.length - 1]).toBe(0)
  })

  test('draws one bar per sample, newest on the right', async () => {
    const words = drawMeter(6, [0, 0, 0, 0, 0, 1], 'other', 'dark')
    expect(words.length).toBe(6 * 3)
    expect(words[0]).not.toBe(words[5 * 3])
  })
})

describe('streamed replies', () => {
  const chunks = [
    { kind: 'thinking', index: 0, text: 'hmm' },
    { kind: 'text', index: 1, text: 'Hello ' },
    { kind: 'text', index: 1, text: 'world\n' },
    { kind: 'tool', index: 2, id: 'toolu_1', name: 'Read' },
    { kind: 'input', index: 2, json: '{}' },
    { kind: 'text', index: 3, text: 'Done.' },
  ] as unknown as TurnStepChunk[]

  // A source that logs each pull, so a test sees when chunks leave against when they arrive.
  async function* source(log: string[]) {
    for (const c of chunks) {
      log.push(`in:${c.kind}`)
      yield c
    }
  }

  test('every chunk passes through unchanged and in order, held or not', async () => {
    for (const isHeld of [false, true]) {
      const out: TurnStepChunk[] = []
      for await (const c of paceStream(source([]), { isHeld, clock: () => 0 })) out.push(c)
      expect(out).toEqual(chunks)
    }
  })

  test('held text waits for the hold, and anything else flushes it first', async () => {
    const log: string[] = []
    let tools = 0
    for await (const c of paceStream(source(log), { isHeld: true, onTool: () => tools++, clock: () => 0 })) log.push(`out:${c.kind}`)
    expect(log).toEqual([
      'in:thinking', 'out:thinking',
      'in:text', 'in:text', 'in:tool', 'out:text', 'out:text', 'out:tool',
      'in:input', 'out:input',
      'in:text', 'out:text',
    ])
    expect(tools).toBe(1)
  })

  test('text older than the hold leaves as newer text arrives', async () => {
    let t = 0
    const out: string[] = []
    const texts = [0, 1, 2].map(i => ({ kind: 'text', index: 0, text: `p${i}` }) as unknown as TurnStepChunk)
    async function* slow() {
      for (const c of texts) {
        yield c
        t += 300
      }
    }
    for await (const c of paceStream(slow(), { isHeld: true, clock: () => t })) out.push(`${(c as { text: string }).text}@${t}`)
    expect(out).toEqual(['p0@600', 'p1@900', 'p2@900'])
  })
})
