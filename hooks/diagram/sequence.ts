// Mermaid sequence diagrams as cells: a lifeline per participant, each message an arrow
// between them with its words above, notes in boxes, and loop/alt blocks as dotted rules.

import { Canvas, LEFT, RIGHT, textWidth } from './canvas'
import type { Rows, Stroke } from './canvas'

type Message = { kind: 'message'; from: number; to: number; text: string; stroke: Stroke; head: 'arrow' | 'cross' | 'open' | 'none' }
type Note = { kind: 'note'; from: number; to: number; side: 'over' | 'left' | 'right'; text: string }
type Rule = { kind: 'rule'; text: string }
type Step = Message | Note | Rule
export type Sequence = { names: string[]; steps: Step[] }

const ARROW = /^([^\s:]+?)\s*(<<-->>|<<->>|-->>|->>|-->|->|--x|-x|--\)|-\))\s*[+-]?\s*([^\s:]+)\s*:\s*(.*)$/
const NOTE = /^note\s+(left of|right of|over)\s+([^:]+?)\s*:\s*(.*)$/i
const PARTICIPANT = /^(participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i
const BLOCK = /^(loop|alt|else|opt|par|and|critical|option|break|rect)\b\s*(.*)$/i
const SKIPPED = /^(activate|deactivate|autonumber|title|box|create|destroy|links?|properties|details)\b/i

const plain = (text: string) => text.replace(/<br\s*\/?>/gi, ' ').replace(/#quot;/g, '"').trim()

export function parseSequence(source: string): Sequence | null {
  const lines = source.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  if (!/^sequenceDiagram\b/.test(lines[0] ?? '')) return null
  const ids: string[] = []
  const names: string[] = []
  const steps: Step[] = []
  const who = (id: string, name?: string) => {
    let i = ids.indexOf(id)
    if (i < 0) {
      i = ids.push(id) - 1
      names.push(id)
    }
    if (name) names[i] = plain(name)
    return i
  }

  for (const line of lines.slice(1)) {
    let m: RegExpExecArray | null
    if ((m = PARTICIPANT.exec(line))) who(m[2]!, m[3])
    else if ((m = NOTE.exec(line))) {
      const [a, b] = m[2]!.split(',').map(s => who(s.trim()))
      const side = m[1]!.toLowerCase().startsWith('left') ? 'left' : m[1]!.toLowerCase().startsWith('right') ? 'right' : 'over'
      steps.push({ kind: 'note', from: Math.min(a!, b ?? a!), to: Math.max(a!, b ?? a!), side, text: plain(m[3]!) })
    } else if ((m = BLOCK.exec(line))) steps.push({ kind: 'rule', text: `${m[1]!.toLowerCase()}${m[2] ? ` ${plain(m[2])}` : ''}` })
    else if (line === 'end') steps.push({ kind: 'rule', text: '' })
    else if (SKIPPED.test(line)) continue
    else if ((m = ARROW.exec(line))) {
      const op = m[2]!
      const head = op.endsWith('>>') ? 'arrow' : op.endsWith('x') ? 'cross' : op.endsWith(')') ? 'open' : 'none'
      steps.push({ kind: 'message', from: who(m[1]!), to: who(m[3]!), text: plain(m[4]!), stroke: op.includes('--') ? 'dotted' : 'solid', head })
    }
  }
  return ids.length ? { names, steps } : null
}

const HEADS = { arrow: ['▶', '◀'], cross: ['×', '×'], open: ['▷', '◁'], none: ['─', '─'] } as const

export function drawSequence(seq: Sequence): Rows {
  const n = seq.names.length
  const headWidth = seq.names.map(name => textWidth(name) + 4)
  // Room between neighbours: their heads, then every message's words between them.
  const gap = Array.from({ length: Math.max(0, n - 1) }, (_, i) => Math.ceil(headWidth[i]! / 2) + Math.ceil(headWidth[i + 1]! / 2) + 2)
  let tail = 0
  const spans = seq.steps
    .map(s => {
      if (s.kind === 'message' && s.from === s.to) return { lo: s.from, hi: s.from + 1, need: textWidth(s.text) + 7 }
      if (s.kind === 'message') return { lo: Math.min(s.from, s.to), hi: Math.max(s.from, s.to), need: textWidth(s.text) + 4 }
      if (s.kind === 'note' && s.side === 'right') return { lo: s.from, hi: s.from + 1, need: textWidth(s.text) + 6 }
      if (s.kind === 'note' && s.side === 'left') return { lo: s.from - 1, hi: s.from, need: textWidth(s.text) + 6 }
      return null
    })
    .filter(s => s !== null)
    .sort((a, b) => a.hi - a.lo - (b.hi - b.lo))
  for (const { lo, hi, need } of spans) {
    if (hi >= n) {
      tail = Math.max(tail, need)
      continue
    }
    if (lo < 0) continue
    const have = gap.slice(lo, hi).reduce((a, b) => a + b, 0)
    if (have >= need) continue
    const each = Math.ceil((need - have) / (hi - lo))
    for (let i = lo; i < hi; i++) gap[i]! += each
  }
  const leftRoom = Math.max(
    Math.ceil(headWidth[0]! / 2),
    ...seq.steps.map(s => (s.kind === 'note' && s.side === 'left' && s.from === 0 ? textWidth(s.text) + 6 : 0)),
    ...seq.steps.map(s => (s.kind === 'note' && s.side === 'over' ? Math.ceil((textWidth(s.text) + 4) / 2) : 0)),
  )
  const centres: number[] = [leftRoom]
  for (let i = 1; i < n; i++) centres.push(centres[i - 1]! + gap[i - 1]!)

  const stepRows = seq.steps.map(s => (s.kind === 'rule' ? 1 : s.kind === 'note' ? 3 : 2))
  const height = 3 + stepRows.reduce((a, b) => a + b, 0) + 1 + 3
  const width = centres[n - 1]! + Math.max(Math.ceil(headWidth[n - 1]! / 2), tail) + 2
  const canvas = new Canvas(width, height)
  const footer = height - 3

  const heads = (y: number) =>
    seq.names.forEach((name, i) => {
      const x = centres[i]! - Math.floor(headWidth[i]! / 2)
      canvas.box(x, y, headWidth[i]!, 3, '┌┐└┘')
      canvas.text(x + 2, y + 1, name, 'label')
    })
  centres.forEach(c => canvas.line(c, 3, c, footer - 1))

  let y = 3
  seq.steps.forEach((s, k) => {
    if (s.kind === 'rule') {
      canvas.line(0, y, width - 1, y, 'dotted')
      if (s.text) canvas.text(1, y, ` ${s.text} `, 'note')
    } else if (s.kind === 'note') {
      const w = textWidth(s.text) + 4
      const x =
        s.side === 'right' ? centres[s.from]! + 2
        : s.side === 'left' ? centres[s.from]! - 1 - w
        : s.from === s.to ? centres[s.from]! - Math.floor(w / 2)
        : centres[s.from]! - 2
      const boxWidth = s.side === 'over' && s.from !== s.to ? Math.max(w, centres[s.to]! - centres[s.from]! + 5) : w
      canvas.box(x, y, boxWidth, 3, '╭╮╰╯', 'note')
      canvas.text(x + 2, y + 1, s.text, 'note')
    } else if (s.from === s.to) {
      const c = centres[s.from]!
      canvas.path([[c, y], [c + 3, y], [c + 3, y + 1], [c + 1, y + 1]], s.stroke)
      canvas.link(c, y + 1, RIGHT)
      canvas.put(c + 1, y + 1, HEADS[s.head][1], 'arrow')
      canvas.text(c + 5, y, s.text, 'label')
    } else {
      const [a, b] = [centres[s.from]!, centres[s.to]!]
      const isRight = b > a
      const head = isRight ? b - 1 : b + 1
      canvas.line(a, y + 1, head, y + 1, s.stroke)
      canvas.link(head, y + 1, isRight ? RIGHT : LEFT)
      canvas.put(head, y + 1, HEADS[s.head][isRight ? 0 : 1], 'arrow')
      const mid = Math.floor((a + b) / 2)
      canvas.text(mid - Math.floor(textWidth(s.text) / 2), y, s.text, 'label')
    }
    y += stepRows[k]!
  })
  heads(0)
  heads(footer)
  return canvas.rows()
}
