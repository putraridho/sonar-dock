import type { UiOpenResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { drawMermaid, hasMermaid, splitMermaid } from '../hooks/diagram'
import type { Rows } from '../hooks/diagram'
import { rowWidth } from '../hooks/diagram/canvas'

const lines = (rows: Rows) => rows.map(r => r.map(x => x.text).join(''))
const fence = (source: string) => `Here:\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\nDone.`

describe('flowcharts', () => {
  test('top-down: boxes in layers, arrows into the next, labels beside them', async () => {
    const drawn = drawMermaid('flowchart TD\n  A[Start] -->|go| B{Check}\n  B --> C(Done)\n  B --> D[Retry]')!
    const text = lines(drawn.rows).join('\n')
    expect(drawn.title).toBe('flowchart')
    expect(text).toContain('│ Start │')
    expect(text).toContain('Check')
    expect(text).toContain('go')
    expect(text.match(/▼/g)!.length).toBe(3)
    expect(text.indexOf('Start')).toBeLessThan(text.indexOf('Check'))
  })

  test('left-to-right: a chart too wide turns top-down', async () => {
    const source = 'graph LR\n  A[A long first step] --> B[A long second step] --> C[A long third step]'
    expect(lines(drawMermaid(source)!.rows).some(l => l.includes('▶'))).toBe(true)
    const narrow = drawMermaid(source, 40)!
    expect(Math.max(...narrow.rows.map(rowWidth))).toBeLessThanOrEqual(40)
    expect(lines(narrow.rows).some(l => l.includes('▼'))).toBe(true)
  })

  test('chains, groups, cycles and dotted or thick edges all draw', async () => {
    const drawn = drawMermaid('graph TD\n  a & b --> c\n  c -.-> d ==> a\n  d -- back --> b')!
    const text = lines(drawn.rows).join('\n')
    for (const word of ['a', 'b', 'c', 'd', 'back']) expect(text).toContain(word)
    expect(text).toMatch(/[┊┄]/)
    expect(text).toMatch(/[┃━]/)
  })
})

describe('sequence diagrams', () => {
  test('a lifeline per participant, messages between, heads repeated at the foot', async () => {
    const drawn = drawMermaid('sequenceDiagram\n  participant A as Alice\n  A->>B: Hello\n  B-->>A: Hi back\n  Note over A,B: shake')!
    const text = lines(drawn.rows)
    expect(drawn.title).toBe('sequence')
    expect(text.filter(l => l.includes('Alice')).length).toBe(2)
    expect(text.some(l => l.includes('▶'))).toBe(true)
    expect(text.some(l => l.includes('◀') && l.includes('┄'))).toBe(true)
    expect(text.some(l => l.includes('shake'))).toBe(true)
  })
})

describe('a reply with mermaid', () => {
  test('splits into words and diagrams; a kind it cannot draw stays markdown', async () => {
    const parts = splitMermaid(fence('graph TD\n  A --> B'))
    expect(parts.map(p => p.kind)).toEqual(['markdown', 'diagram', 'markdown'])
    expect(splitMermaid(fence('pie title Pets\n  "Dogs" : 3'))).toEqual([{ kind: 'markdown', text: fence('pie title Pets\n  "Dogs" : 3') }])
  })

  test('keeps the skin and draws the diagram in place of the code block', async ($, on) => {
    on('ui.open', async () => ({ value: { isPlaced: true } as UiOpenResult }))
    on('command.run', async () => ({ text: 'engine' }))
    on('ui.render', async ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>{`engine ${e.component}`}</Text>
    })
    await $.command.run({ command: 'sonar', args: '' } as Parameters<typeof $.command.run>[0])
    const reply = await $.ui.mount({
      plugin: 'sonar-dock',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: fence('flowchart TD\n  A[Plan] --> B[Ship]'), isFirstOfReply: true },
    })
    expect(await reply.find({ type: 'Text', text: / CLAUDE / })).toBeDefined()
    expect(await reply.find({ type: 'Text', text: /FLOWCHART/ })).toBeDefined()
    expect(await reply.find({ type: 'Markdown' })).toBeDefined()
    expect(await reply.find({ type: 'Text', text: /engine AssistantMessage/ })).toBeUndefined()
    await reply.unmount()
  })
})

test('asking whether a reply has mermaid leaves the split able to find it', async () => {
  const text = fence('graph TD\n  A --> B')
  expect(hasMermaid(text)).toBe(true)
  expect(splitMermaid(text).length).toBe(3)
  expect(splitMermaid(text).some(s => s.kind === 'diagram')).toBe(true)
})
