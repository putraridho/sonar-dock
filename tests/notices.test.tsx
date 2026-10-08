import type { UiOpenResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { hintParts } from '../hooks/features/chat/notices'

const row = (component: string, props: Record<string, unknown>, requestId = component) =>
  ({ plugin: 'sonar-dock', surface: 'terminal', component, requestId, props }) as never

describe('the run-in-background hint', () => {
  test('splits into the key and what it does', async () => {
    expect(hintParts('(ctrl+b to run in background)')).toEqual({ key: 'CTRL+B', action: 'run in background' })
    expect(hintParts('press here')).toBeNull()
  })
})

test('the small rows wear the skin while it is on, and the engine draws them while it is off', async ($, on) => {
  on('ui.open', async () => ({ value: { isPlaced: true } as UiOpenResult }))
  on('command.run', async () => ({ text: 'engine' }))
  on('tool.call', async () => ({ result: { stdout: '', stderr: '' } }) as never)
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`engine ${e.component} ${(e.props as { tail?: string }).tail ?? ''}`}</Text>
  })

  const progress = row('ToolProgress', { tool_use_id: 'toolu_1', kind: 'background_hint', hint: '(ctrl+b to run in background)' })
  const modes = row('SessionMode', { modes: ['focus'] })
  const plain = await $.ui.mount(progress)
  expect(await plain.find({ type: 'Text', text: /engine ToolProgress/ })).toBeDefined()
  await plain.unmount()

  await $.command.run({ command: 'sonar', args: '' } as Parameters<typeof $.command.run>[0])

  const readout = await $.ui.mount(row('CommandOutput', { command: 'sonar', args: '', text: 'Sonar Dock online.', isErrored: false }))
  expect(await readout.find({ type: 'Text', text: / SONAR / })).toBeDefined()
  expect(await readout.find({ type: 'Text', text: /THREAT NOMINAL/ })).toBeDefined()
  await readout.unmount()

  const off = await $.ui.mount(row('CommandOutput', { command: 'sonar', args: 'off', text: 'Sonar Dock standing down.', isErrored: false }, 'off'))
  expect(await off.find({ type: 'Text', text: /engine CommandOutput/ })).toBeDefined()
  await off.unmount()

  const hint = await $.ui.mount(progress)
  expect(await hint.find({ type: 'Text', text: /^CTRL\+B$/ })).toBeDefined()
  await hint.unmount()

  const footer = await $.ui.mount(modes)
  expect(await footer.find({ type: 'Text', text: /^FOCUS$/ })).toBeDefined()
  await footer.unmount()

  const notice = await $.ui.mount(row('InfoNotice', { text: 'Using the default model', command: '/model' }))
  expect(await notice.find({ type: 'Text', text: / \/model/ })).toBeDefined()
  await notice.unmount()

  const calm = await $.ui.mount(row('PromptHint', { isDraft: false, isWorking: false, hint: '? for shortcuts' }))
  expect(await calm.find({ type: 'Text', text: /threat/ })).toBeUndefined()
  await calm.unmount()

  await $.tool.call({ tool: 'Bash', tool_use_id: 'toolu_rm', command: 'rm -rf build', description: 'Clean' } as never)
  const alarmed = await $.ui.mount(row('PromptHint', { isDraft: false, isWorking: false, hint: '? for shortcuts' }, 'hint2'))
  expect(await alarmed.find({ type: 'Text', text: /engine PromptHint ⚠ threat high/ })).toBeDefined()
  await alarmed.unmount()
})
