// Mermaid state diagrams, read as flowcharts: each state a rounded box, `[*]` a start dot where
// it leads out and an end dot where it is led into, choices as diamonds; composites flattened.

import type { Direction, FlowEdge, FlowNode, Flowchart } from './flowchart'

const HEADER = /^stateDiagram(-v2)?\s*$/
const DIRECTION = /^direction\s+(TB|TD|BT|LR|RL)\s*$/i
const ALIAS = /^state\s+"([^"]+)"\s+as\s+([\p{L}\p{N}_]+)/u
const MARKED = /^state\s+([\p{L}\p{N}_]+)\s+<<(choice|fork|join)>>/u
const COMPOSITE = /^state\s+([\p{L}\p{N}_]+)\s*\{$/u
const TRANSITION = /^(\[\*\]|[\p{L}\p{N}_]+)\s*-->\s*(\[\*\]|[\p{L}\p{N}_]+)\s*(?::\s*(.*))?$/u
const DESCRIBED = /^([\p{L}\p{N}_]+)\s*:\s*(.+)$/u
const SKIPPED = /^(classDef|class|style|accTitle|accDescr|\}|--)/

const START = '[*] start'
const END = '[*] end'

export function parseState(source: string): Flowchart | null {
  const lines = source.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  if (!HEADER.test(lines[0] ?? '')) return null
  let direction: Direction = 'TD'
  const nodes = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []
  const node = (id: string, label?: string, shape: FlowNode['shape'] = 'round') => {
    const known = nodes.get(id)
    if (!known) nodes.set(id, { id, lines: [label ?? id], shape })
    else if (label) known.lines = [label]
    if (known && shape !== 'round') known.shape = shape
    return id
  }

  let inNote = false
  for (const line of lines.slice(1)) {
    let m: RegExpExecArray | null
    if (inNote) {
      inNote = !/^end\s+note$/i.test(line)
      continue
    }
    if (/^note\b/i.test(line)) {
      inNote = !line.includes(':')
      continue
    }
    if (SKIPPED.test(line)) continue
    if ((m = DIRECTION.exec(line))) {
      const dir = m[1]!.toUpperCase()
      direction = dir === 'TB' ? 'TD' : (dir as Direction)
    } else if ((m = ALIAS.exec(line))) node(m[2]!, m[1]!)
    else if ((m = MARKED.exec(line))) node(m[1]!, m[2] === 'choice' ? ' ' : m[1]!, m[2] === 'choice' ? 'diamond' : 'rect')
    else if ((m = COMPOSITE.exec(line))) node(m[1]!)
    else if ((m = TRANSITION.exec(line))) {
      const from = m[1] === '[*]' ? node(START, '●') : node(m[1]!)
      const to = m[2] === '[*]' ? node(END, '◉') : node(m[2]!)
      edges.push({ from, to, label: (m[3] ?? '').trim(), stroke: 'solid', head: 'arrow', isBoth: false })
    } else if ((m = DESCRIBED.exec(line))) node(m[1]!, m[2]!.trim())
  }
  return nodes.size ? { direction, nodes: [...nodes.values()], edges } : null
}
