import type { TurnStepChunk, UiOpenResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { isRepeatPrompt } from '../hooks/domain/calls'
import { warmed } from '../hooks/domain/heat'
import { heatRows } from '../hooks/features/pane/sections'
import { Motion } from '../hooks/motion/motion'
import { Agents } from '../hooks/runtime/agents'
import { FlowMeter } from '../hooks/runtime/flow'
import { LiveFeed, onArrival, paceStream } from '../hooks/runtime/live'
import { INITIAL } from '../hooks/runtime/state'
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

  test('an edit to a key file raises it too; a message sent out only nudges it', async ($, on) => {
    on('tool.call', async () => ({ result: {} }) as never)
    await $.tool.call({ tool: 'mcp__plugin_slack_slack__slack_send_message', tool_use_id: 'toolu_s', channel_id: 'C1', message: 'hi' } as never)
    const nudged = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0])
    expect(await nudged.find({ type: 'Text', text: /^Guarded$/ })).toBeDefined()
    expect(await nudged.find({ type: 'Text', text: /outbound message/ })).toBeDefined()
    await nudged.unmount()
    await $.tool.call({ tool: 'Write', tool_use_id: 'toolu_w', file_path: '/home/me/.ssh/config', content: '' } as never)
    const raised = await $.ui.mount({ ...PANE, requestId: 'sonar-dock' } as Parameters<typeof $.ui.mount>[0])
    expect(await raised.find({ type: 'Text', text: /^Critical$/ })).toBeDefined()
    expect(await raised.find({ type: 'Text', text: /key tamper/ })).toBeDefined()
    await raised.unmount()
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
  test('the roster lists each with its calls and latest, the working ones first', async () => {
    const agents = new Agents()
    agents.callStarted(1, 0, 'read', 'src/auth.ts')
    agents.callEnded(1, 100)
    agents.callStarted(2, 50, 'bash', 'npm test')
    agents.callStarted(1, 200, 'edit', 'src/login.ts')
    agents.callEnded(1, 300)
    expect(agents.roster(60_000)).toEqual([
      { agent: 2, calls: 1, kind: 'bash', last: 'npm test', isWorking: true },
      { agent: 1, calls: 2, kind: 'edit', last: 'src/login.ts', isWorking: false },
    ])
  })

  test('the pane shows the roster once a subagent has called', async ($, on) => {
    on('tool.call', async () => ({ result: {} }) as never)
    const calm = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0])
    expect(await calm.find({ type: 'Text', text: /^Agents$/ })).toBeUndefined()
    await calm.unmount()
    await $.tool.call({ tool: 'Read', tool_use_id: 'toolu_a', file_path: '/repo/src/auth.ts', agentId: 'agent-1' } as never)
    const busy = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0])
    expect(await busy.find({ type: 'Text', text: /^Agents$/ })).toBeDefined()
    expect(await busy.find({ type: 'Text', text: /^1 call$/ })).toBeDefined()
    await busy.unmount()
  })

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

test('the totals open their lists: edits, files, and errors with the reason', async ($, on) => {
  on('ui.open', async () => ({ value: { isPlaced: true } as UiOpenResult }))
  on('tool.call', { tool: 'Bash' }, async () => ({ deny: 'Permission denied\nmore' }) as never)
  on('tool.call', { tool: 'Edit' }, async () => ({ result: {} }) as never)
  await $.tool.call({ tool: 'Edit', tool_use_id: 'toolu_e1', file_path: '/repo/src/auth.ts', old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'toolu_b1', command: 'npm publish', description: 'Publish' } as never)
  const ui = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0])
  expect(await ui.find({ type: 'Text', text: /Permission denied/ })).toBeUndefined()

  await ui.press({ key: 'total:errors' })
  expect(await ui.find({ type: 'Text', text: /Permission denied/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /more/ })).toBeUndefined()

  await ui.press({ key: 'total:files' })
  expect(await ui.find({ type: 'Text', text: /Permission denied/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\/repo\/src\/auth\.ts/ })).toBeDefined()

  await ui.press({ key: 'total:files' })
  expect(await ui.find({ type: 'Text', text: /\/repo\/src\/auth\.ts/ })).toBeUndefined()
  await ui.unmount()
})

describe('file heat', () => {
  test('counts edits and reads per file, and drops the coolest past the limit', async () => {
    let heat = warmed({}, 'a.ts', 'e')
    heat = warmed(heat, 'a.ts', 'r')
    expect(heat).toEqual({ 'a.ts': { e: 1, r: 1 } })
    for (let i = 0; i < 100; i++) heat = warmed(heat, `f${i}.ts`, 'r')
    expect(Object.keys(heat).length).toBe(100)
    expect(heat['a.ts']).toEqual({ e: 1, r: 1 })
    expect(heat['f0.ts']).toBeUndefined()
  })

  test('the files list ranks edited files by heat, edits weighing twice', async () => {
    const stats = { ...INITIAL.stats, files: ['cold.ts', 'read.ts', 'hot.ts'], heat: { 'cold.ts': { e: 1, r: 0 }, 'read.ts': { e: 1, r: 3 }, 'hot.ts': { e: 3, r: 0 } } }
    expect(heatRows(stats).rows.map(r => r.path)).toEqual(['hot.ts', 'read.ts', 'cold.ts'])
  })

  test('the pane draws each file with its counts', async ($, on) => {
    on('tool.call', async () => ({ result: {} }) as never)
    await $.tool.call({ tool: 'Edit', tool_use_id: 'toolu_e', file_path: '/repo/src/auth.ts', old_string: 'a', new_string: 'b' } as never)
    await $.tool.call({ tool: 'Read', tool_use_id: 'toolu_r', file_path: '/repo/src/auth.ts' } as never)
    await $.tool.call({ tool: 'Read', tool_use_id: 'toolu_r2', file_path: '/repo/src/auth.ts' } as never)
    const ui = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0])
    await ui.press({ key: 'total:files' })
    expect(await ui.find({ type: 'Text', text: /^1e · 2r$/ })).toBeDefined()
    await ui.unmount()
  })
})
