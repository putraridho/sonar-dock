// Mermaid class diagrams, read as flowcharts: each class a box with its name over a rule, then
// its fields and its methods; relations drawn with the head at the end that has it (△ ◆ ◇ ▶).

import { DIVIDER } from './flowchart'
import type { Direction, FlowEdge, FlowNode, Flowchart, Head } from './flowchart'
import type { Stroke } from './canvas'

const HEADER = /^classDiagram(-v2)?\s*$/
const DIRECTION = /^direction\s+(TB|TD|BT|LR|RL)\s*$/i
const NAME = '[\\p{L}\\p{N}_]+(?:~[^~]+~)?'
const CLASS = new RegExp(`^class\\s+(${NAME})\\s*(\\{)?\\s*(\\})?\\s*$`, 'u')
const MEMBER = new RegExp(`^(${NAME})\\s*:\\s*(.+)$`, 'u')
const ANNOTATION = new RegExp(`^<<([^>]+)>>\\s*(${NAME})?$`, 'u')
// `A "1" <|-- "*" B : label`: each end's mark, the line, and the words after the colon.
const RELATION = new RegExp(`^(${NAME})\\s*(?:"[^"]*"\\s*)?(<\\||\\*|o|<)?(--|\\.\\.)(\\|>|\\*|o|>)?\\s*(?:"[^"]*"\\s*)?(${NAME})\\s*(?::\\s*(.*))?$`, 'u')
const SKIPPED = /^(classDef|cssClass|style|click|link|callback|note|namespace|accTitle|accDescr|\})/

const HEAD_OF: Record<string, Head> = { '<|': 'hollow', '|>': 'hollow', '*': 'diamond', o: 'open-diamond', '<': 'arrow', '>': 'arrow' }

// `List~int~` as people write it: `List<int>`.
const shown = (name: string) => name.replace(/~([^~]+)~/, '<$1>')

type ClassBox = { name: string; notes: string[]; fields: string[]; methods: string[] }

export function parseClasses(source: string): Flowchart | null {
  const lines = source.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  if (!HEADER.test(lines[0] ?? '')) return null
  let direction: Direction = 'TD'
  const classes = new Map<string, ClassBox>()
  const edges: FlowEdge[] = []
  const box = (raw: string) => {
    const id = raw.replace(/~[^~]+~$/, '')
    if (!classes.has(id)) classes.set(id, { name: shown(raw), notes: [], fields: [], methods: [] })
    return id
  }
  const member = (id: string, text: string) => {
    const c = classes.get(id)!
    const annotation = /^<<([^>]+)>>$/.exec(text)
    if (annotation) c.notes.push(`«${annotation[1]!.trim()}»`)
    else (text.includes('(') ? c.methods : c.fields).push(shown(text.replace(/\s+/g, ' ')))
  }

  let open: string | null = null
  for (const line of lines.slice(1)) {
    let m: RegExpExecArray | null
    if (open !== null) {
      if (line === '}') open = null
      else member(open, line)
      continue
    }
    if (SKIPPED.test(line)) continue
    if ((m = DIRECTION.exec(line))) {
      const dir = m[1]!.toUpperCase()
      direction = dir === 'TB' ? 'TD' : (dir as Direction)
    } else if ((m = CLASS.exec(line))) {
      const id = box(m[1]!)
      if (m[2] && !m[3]) open = id
    } else if ((m = ANNOTATION.exec(line))) {
      if (m[2]) member(box(m[2]), `<<${m[1]}>>`)
    } else if ((m = RELATION.exec(line))) {
      const stroke: Stroke = m[3] === '..' ? 'dotted' : 'solid'
      edges.push({ from: box(m[1]!), to: box(m[5]!), label: (m[6] ?? '').trim(), stroke, head: HEAD_OF[m[4] ?? ''] ?? 'none', tail: HEAD_OF[m[2] ?? ''] ?? 'none', isBoth: false })
    } else if ((m = MEMBER.exec(line))) member(box(m[1]!), m[2]!.trim())
  }

  const nodes: FlowNode[] = [...classes.entries()].map(([id, c]) => {
    const members = [...c.fields, ...(c.fields.length && c.methods.length ? [DIVIDER] : []), ...c.methods]
    return { id, shape: 'class', lines: [...c.notes, c.name, ...(members.length ? [DIVIDER, ...members] : [])] }
  })
  return nodes.length ? { direction, nodes, edges } : null
}
