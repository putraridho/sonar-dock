import type { TurnStepChunk, UiOpenResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { isRepeatPrompt } from '../hooks/domain/calls'
import { Motion } from '../hooks/motion/motion'
import { Agents } from '../hooks/runtime/agents'
import { FlowMeter } from '../hooks/runtime/flow'
import { LiveFeed, onArrival, paceStream } from '../hooks/runtime/live'
import { drawTimeline, timelineLanes } from '../hooks/raster/strips'

const PANE = {
  plugin: 'sonar-dock',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'sonar-dock',
  props: { title: 'Sonar Dock', isFocused: false, bodyColumns: 64, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  viewport: { columns: 140, rows: 80 },
} as const

describe('the threat matrix reads the command', () => {
  test('a dangerous command raises the alarm even under a calm description', async ($, on) => {
    on('tool.call', async () => ({ result: { stdout: '', stderr: '' } }) as never)
    await $.tool.call({ tool: 'Bash', tool_use_id: 'toolu_rm', command: 'rm -rf build', description: 'Clean the build output' } as never)
    const ui = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0])
    expect(await ui.find({ type: 'Text', text: /^High$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /recursive delete/ })).toBeDefined()
    await ui.unmount()
  })
})

test('the activity log shows prompts and which subagent made a call', async ($, on) => {
  on('ui.open', async () => ({ value: { isPlaced: true } as UiOpenResult }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }) as never)
  on('tool.call', async () => ({ result: { stdout: 'ok\n', stderr: '' } }) as never)
  await $.prompt.submit({ text: 'fix the\nlogin bug', origin: { kind: 'composer' } } as never)
  await $.prompt.submit({ text: '<agent-message from="a1">report</agent-message>', origin: { kind: 'task-notification' } } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'toolu_main', command: 'npm test', description: 'Run the tests' } as never)
  await $.tool.call({ tool: 'Read', tool_use_id: 'toolu_sub', file_path: '/repo/src/auth.ts', agentId: 'agent-xyz' } as never)
  const ui = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0])
  expect(await ui.find({ type: 'Text', text: /fix the login bug/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^You$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /agent-message/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /A1 › / })).toBeDefined()
  await ui.unmount()
})

describe('subagents', () => {
  test('are numbered in the order they first appear, and work while a call is in flight', async () => {
    const agents = new Agents()
    expect(agents.numberOf(undefined)).toBe(undefined)
    expect(agents.numberOf('b')).toBe(1)
    expect(agents.numberOf('a')).toBe(2)
    expect(agents.numberOf('b')).toBe(1)
    agents.callStarted(1, 0)
    expect(agents.workingCount(60_000)).toBe(1)
    agents.callEnded(1, 1000)
    expect(agents.workingCount(2000)).toBe(1)
    expect(agents.workingCount(60_000)).toBe(0)
  })

  test('get a timeline lane each, after the four main-thread lanes', async () => {
    const calls = [
      { s: 0, e: 500, k: 'bash', f: false },
      { s: 100, e: 900, k: 'read', f: false, a: 2 },
      { s: 200, e: 800, k: 'edit', f: true, a: 1 },
    ]
    const lanes = timelineLanes(calls)
    expect(lanes.map(l => l.noun)).toEqual(['shell', 'edit', 'read', 'other', 'A1', 'A2'])
    expect(drawTimeline(30, calls, 1000, 'dark').length).toBe(30 * 3 * 3)
    expect(drawTimeline(30, calls.slice(0, 1), 1000, 'dark', lanes).length).toBe(30 * 3 * 3)
  })
})

test('held text still reaches the transcript when the stream breaks', async () => {
  const pieces = [
    { kind: 'text', index: 0, text: 'Hello ' },
    { kind: 'text', index: 0, text: 'world' },
  ] as unknown as TurnStepChunk[]
  async function* breaking() {
    for (const c of pieces) yield c
    throw new Error('interrupted')
  }
  const out: TurnStepChunk[] = []
  let caught: unknown
  try {
    for await (const c of paceStream(breaking(), { isHeld: true, clock: () => 0 })) out.push(c)
  } catch (error) {
    caught = error
  }
  expect(out).toEqual(pieces)
  expect((caught as Error).message).toBe('interrupted')
})

describe('the band follows the stream', () => {
  test('held text joins the feed and marks the band as moving; other text only counts', async () => {
    const live = new LiveFeed()
    const flow = new FlowMeter(8)
    const motion = new Motion()
    const text = { kind: 'text', index: 0, text: 'Hello' } as unknown as TurnStepChunk
    onArrival({ live, flow, motion }, false)(text, 0)
    expect(live.isEmpty).toBe(true)
    expect(motion.takeFrame()).toBe(false)
    onArrival({ live, flow, motion }, true)(text, 0)
    expect(live.isEmpty).toBe(false)
    expect(motion.takeFrame()).toBe(true)
    expect(Math.max(...flow.roll())).toBeGreaterThan(0)
  })
})

test('a prompt seen twice in quick succession is logged once', async () => {
  const lines = [{ kind: 'prompt', detail: 'who is roman', at: 1000 }]
  expect(isRepeatPrompt(lines, 'who is roman', 3000)).toBe(true)
  expect(isRepeatPrompt(lines, 'who is roman', 20_000)).toBe(false)
  expect(isRepeatPrompt(lines, 'something else', 3000)).toBe(false)
  expect(isRepeatPrompt([], 'who is roman', 3000)).toBe(false)
})
