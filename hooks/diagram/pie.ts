// Mermaid pie charts as a bar chart: a row per slice, its label, a bar as long as its share, and
// the share in percent (with the value too under `showData`). Slices take the tool colors in turn.

import { Canvas, textWidth } from './canvas'
import type { Ink, Rows } from './canvas'

export type Pie = { title: string; isShowingData: boolean; slices: { label: string; value: number }[] }

const HEADER = /^pie(\s+showData)?(?:\s+title\s+(.+))?$/
const TITLE = /^title\s+(.+)$/
const SLICE = /^"([^"]+)"\s*:\s*([\d.]+)\s*$/

export const SLICE_INKS: readonly Ink[] = ['s0', 's1', 's2', 's3', 's4', 's5']
const BAR_WIDTH = 30
const LABEL_MAX = 24

export function parsePie(source: string): Pie | null {
  const lines = source.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  const head = HEADER.exec(lines[0] ?? '')
  if (!head) return null
  const pie: Pie = { title: (head[2] ?? '').trim(), isShowingData: Boolean(head[1]), slices: [] }
  for (const line of lines.slice(1)) {
    let m: RegExpExecArray | null
    if ((m = TITLE.exec(line))) pie.title = m[1]!.trim()
    else if ((m = SLICE.exec(line))) {
      const value = Number(m[2])
      if (Number.isFinite(value) && value > 0) pie.slices.push({ label: m[1]!, value })
    }
  }
  return pie.slices.length ? pie : null
}

const cut = (text: string) => (textWidth(text) <= LABEL_MAX ? text : `${[...text].slice(0, LABEL_MAX - 1).join('')}…`)

// Largest first, the way a pie reads clockwise; each bar eighth-block precise.
export function drawPie(pie: Pie): Rows {
  const total = pie.slices.reduce((a, s) => a + s.value, 0)
  const slices = [...pie.slices].sort((a, b) => b.value - a.value)
  const labels = slices.map(s => cut(s.label))
  const labelW = Math.max(...labels.map(textWidth))
  const canvas = new Canvas(labelW + 2 + BAR_WIDTH + 24, slices.length)
  slices.forEach((s, i) => {
    const share = s.value / total
    const eighths = Math.max(1, Math.round(share * BAR_WIDTH * 8))
    const bar = '█'.repeat(Math.floor(eighths / 8)) + (eighths % 8 ? ' ▏▎▍▌▋▊▉'[eighths % 8]! : '')
    canvas.text(labelW - textWidth(labels[i]!), i, labels[i]!, 'label')
    canvas.text(labelW + 2, i, bar, SLICE_INKS[i % SLICE_INKS.length]!)
    const pct = `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`
    canvas.text(labelW + 3 + BAR_WIDTH, i, pie.isShowingData ? `${pct}  (${s.value})` : pct, 'note')
  })
  return canvas.rows()
}
