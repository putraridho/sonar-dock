import type { UiOpenResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { drawMeter } from '../hooks/radar'
import { alertText, sweepClock, noteFlow, rollFlow, spinWord } from '../hooks/register'

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
    for (let i = 0; i < 6; i++) rollFlow()
    expect(Math.max(...rollFlow())).toBe(0)
    noteFlow(120)
    const busy = rollFlow()
    expect(busy[busy.length - 1]).toBeGreaterThan(0.9)
    const quiet = rollFlow()
    expect(quiet[quiet.length - 1]).toBe(0)
  })

  test('draws one bar per sample, newest on the right', async () => {
    const words = drawMeter(6, [0, 0, 0, 0, 0, 1], 'other', 'dark')
    expect(words.length).toBe(6 * 3)
    expect(words[0]).not.toBe(words[5 * 3])
  })
})
