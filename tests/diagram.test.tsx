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

describe('state diagrams', () => {
  test('states in rounded boxes, [*] a start dot and an end dot, transitions with their words', async () => {
    const drawn = drawMermaid('stateDiagram-v2\n  [*] --> Still\n  Still --> Moving : push\n  state "Crashed hard" as Crash\n  Moving --> Crash\n  Crash --> [*]\n  note right of Crash\n    ouch\n  end note')!
    const text = lines(drawn.rows).join('\n')
    expect(drawn.title).toBe('state')
    for (const word of ['●', '◉', 'Still', 'Moving', 'Crashed hard', 'push']) expect(text).toContain(word)
    expect(text).not.toContain('ouch')
    expect(text.indexOf('●')).toBeLessThan(text.indexOf('Still'))
    expect(text.indexOf('Crashed hard')).toBeLessThan(text.indexOf('◉'))
  })
})

describe('class diagrams', () => {
  test('a box per class: name over a rule, fields, then methods; parents above, △ at the parent', async () => {
    const drawn = drawMermaid('classDiagram\n  Animal <|-- Duck\n  Animal : +int age\n  Animal : +isMammal()\n  class Duck{\n    <<interface>>\n    +swim()\n  }\n  Duck *-- Fin : has\n  class List~int~')!
    const text = lines(drawn.rows)
    expect(drawn.title).toBe('class')
    expect(text.filter(l => l.includes('├')).length).toBeGreaterThanOrEqual(3)
    expect(text.some(l => l.includes('│ +int age'))).toBe(true)
    expect(text.some(l => l.includes('«interface»'))).toBe(true)
    expect(text.some(l => l.includes('List<int>'))).toBe(true)
    const at = (word: string) => text.findIndex(l => l.includes(word))
    expect(at('+int age')).toBeLessThan(at('+isMammal()'))
    expect(at('Animal')).toBeLessThan(at('△'))
    expect(at('△')).toBeLessThan(at('Duck'))
    expect(text.some(l => l.includes('◆'))).toBe(true)
    expect(text.some(l => l.includes('has'))).toBe(true)
  })
})

describe('pie charts', () => {
  test('a bar per slice, largest first, as long as its share', async () => {
    const drawn = drawMermaid('pie showData\n  title Pets\n  "Cats" : 1\n  "Dogs" : 3')!
    const text = lines(drawn.rows)
    expect(drawn.title).toBe('pie · Pets')
    expect(text[0]).toContain('Dogs')
    expect(text[0]).toContain('75%  (3)')
    expect(text[1]).toContain('25%')
    const bar = (l: string) => (l.match(/[█▏▎▍▌▋▊▉]/g) ?? []).length
    expect(bar(text[0]!)).toBeGreaterThan(bar(text[1]!) * 2)
    expect(drawn.rows[0]!.some(r => r.ink === 's0')).toBe(true)
    expect(drawMermaid('pie\n  "Nothing" : 0')).toBe(null)
  })
})

describe('a reply with mermaid', () => {
  test('splits into words and diagrams; a kind it cannot draw stays markdown', async () => {
    const parts = splitMermaid(fence('graph TD\n  A --> B'))
    expect(parts.map(p => p.kind)).toEqual(['markdown', 'diagram', 'markdown'])
    const gantt = fence('gantt\n  title Plan\n  Build :a1, 2026-01-01, 3d')
    expect(splitMermaid(gantt)).toEqual([{ kind: 'markdown', text: gantt }])
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
