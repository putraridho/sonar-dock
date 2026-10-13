// Mermaid in a reply: the fenced blocks picked out of the markdown, and each drawn in cells
// where its kind is one Sonar Dock draws (flowcharts, sequence diagrams).

import { rowWidth } from './canvas'
import type { Rows } from './canvas'
import { drawFlowchart, parseFlowchart } from './flowchart'
import { drawSequence, parseSequence } from './sequence'

export type { Ink, Rows, Run } from './canvas'

export type Segment = { kind: 'markdown'; text: string } | { kind: 'diagram'; title: string; rows: Rows; source: string }

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*mermaid[ \t]*\n([\s\S]*?)\n {0,3}\1[ \t]*$/gm

// A diagram's cells, narrowest fitting first: a left-to-right chart too wide turns top-down.
export function drawMermaid(source: string, columns = Infinity): { title: string; rows: Rows } | null {
  const chart = parseFlowchart(source)
  if (chart) {
    const rows = drawFlowchart(chart)
    const width = Math.max(0, ...rows.map(rowWidth))
    if (width > columns && (chart.direction === 'LR' || chart.direction === 'RL')) {
      const tall = drawFlowchart(chart, chart.direction === 'LR' ? 'TD' : 'BT')
      if (Math.max(0, ...tall.map(rowWidth)) < width) return { title: 'flowchart', rows: tall }
    }
    return { title: 'flowchart', rows }
  }
  const seq = parseSequence(source)
  if (seq) return { title: 'sequence', rows: drawSequence(seq) }
  return null
}

export function hasMermaid(text: string): boolean {
  return new RegExp(FENCE.source, 'm').test(text)
}

// The reply in order: markdown between the diagrams; a block it cannot draw stays markdown.
export function splitMermaid(text: string, columns?: number): Segment[] {
  const out: Segment[] = []
  let from = 0
  const keep = (to: number) => {
    const words = text.slice(from, to).replace(/^\s*\n|\n\s*$/g, '')
    if (words.trim()) out.push({ kind: 'markdown', text: words })
  }
  for (const m of text.matchAll(FENCE)) {
    let drawn: ReturnType<typeof drawMermaid> = null
    try {
      drawn = drawMermaid(m[2]!, columns)
    } catch {
      drawn = null
    }
    if (!drawn || drawn.rows.length === 0) continue
    keep(m.index!)
    out.push({ kind: 'diagram', title: drawn.title, rows: drawn.rows, source: m[2]! })
    from = m.index! + m[0].length
  }
  keep(text.length)
  return out
}
