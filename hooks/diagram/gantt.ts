// Mermaid gantt charts as cells: a date ruler, then a row per task under its section, its bar
// placed on the time axis. Each section takes a series color; done tasks dim, critical ones
// burn red, milestones are diamonds.

import { Canvas, textWidth } from './canvas'
import type { Ink, Rows } from './canvas'
import { SLICE_INKS } from './pie'

type Task = { name: string; section: number; start: number; end: number; tags: Set<string> }
export type Gantt = { title: string; sections: string[]; tasks: Task[] }

const DAY_MS = 86_400_000
const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: DAY_MS, w: 7 * DAY_MS }
const TAGS = new Set(['done', 'active', 'crit', 'milestone'])
const SKIPPED = /^(dateFormat|axisFormat|tickInterval|excludes|includes|todayMarker|weekday|inclusiveEndDates|topAxis|displayMode|accTitle|accDescr|click)\b/

const LABEL_MAX = 24
const MIN_AXIS = 20
const MAX_AXIS = 60

// `2026-01-05` and `2026-01-05 14:00` as ms (UTC); NaN otherwise.
function dateOf(text: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(text.trim())
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)) : NaN
}

function durationOf(text: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/.exec(text.trim())
  return m ? Number(m[1]) * UNIT_MS[m[2]!]! : NaN
}

export function parseGantt(source: string): Gantt | null {
  const lines = source.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  if (!/^gantt\s*$/.test(lines[0] ?? '')) return null
  const format = lines.find(l => /^dateFormat\b/.test(l))?.replace(/^dateFormat\s+/, '').trim()
  // Only the ISO dates people mostly write; any other format stays as code.
  if (format !== undefined && !/^YYYY-MM-DD( HH:mm)?$/.test(format)) return null
  const gantt: Gantt = { title: '', sections: [], tasks: [] }
  const ends = new Map<string, number>()
  let section = -1
  let previous = NaN

  for (const line of lines.slice(1)) {
    if (SKIPPED.test(line)) continue
    const title = /^title\s+(.+)$/.exec(line)
    if (title) {
      gantt.title = title[1]!.trim()
      continue
    }
    const sec = /^section\s+(.+)$/.exec(line)
    if (sec) {
      section = gantt.sections.push(sec[1]!.trim()) - 1
      continue
    }
    const task = /^(.+?)\s*:\s*(.*)$/.exec(line)
    if (!task) continue
    const parts = task[2]!.split(',').map(p => p.trim()).filter(Boolean)
    const tags = new Set<string>()
    while (parts.length && TAGS.has(parts[0]!)) tags.add(parts.shift()!)
    // What is left: [id,] start, end; or [id,] end; a lone part is the end, after the last task.
    let id: string | undefined
    if (parts.length === 3 || (parts.length === 2 && !/^after\s/.test(parts[0]!) && Number.isNaN(dateOf(parts[0]!)))) id = parts.shift()
    let start = previous
    if (parts.length === 2) {
      const from = parts.shift()!
      const after = /^after\s+(.+)$/.exec(from)
      start = after ? Math.max(...after[1]!.split(/\s+/).map(k => ends.get(k) ?? NaN)) : dateOf(from)
    }
    const until = parts[0] ?? ''
    const end = Number.isNaN(durationOf(until)) ? dateOf(until) : start + durationOf(until)
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
    if (section < 0) section = gantt.sections.push('') - 1
    gantt.tasks.push({ name: task[1]!.trim(), section, start, end, tags })
    if (id) ends.set(id, end)
    previous = end
  }
  return gantt.tasks.length ? gantt : null
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const cut = (text: string) => (textWidth(text) <= LABEL_MAX ? text : `${[...text].slice(0, LABEL_MAX - 1).join('')}…`)

export function drawGantt(gantt: Gantt, columns = MIN_AXIS + LABEL_MAX + 4 + 20): Rows {
  const from = Math.min(...gantt.tasks.map(t => t.start))
  const to = Math.max(...gantt.tasks.map(t => t.end))
  const span = Math.max(1, to - from)
  const labelW = Math.max(...gantt.tasks.map(t => textWidth(cut(t.name)) + 2), ...gantt.sections.map(s => textWidth(cut(s))))
  const axis = Math.max(MIN_AXIS, Math.min(MAX_AXIS, columns - labelW - 2))
  const x0 = labelW + 2
  const col = (ms: number) => Math.min(axis - 1, Math.floor(((ms - from) / span) * axis))
  const rows = 2 + gantt.tasks.length + gantt.sections.filter(Boolean).length
  const canvas = new Canvas(x0 + axis + 1, rows)

  // The ruler: first and last day at its ends, ticks between.
  canvas.line(x0, 1, x0 + axis - 1, 1, 'dotted')
  for (let k = 0; k <= 4; k++) canvas.put(x0 + Math.round(((axis - 1) * k) / 4), 1, '┴', 'edge')
  canvas.text(x0, 0, iso(from), 'note')
  canvas.text(x0 + axis - 10, 0, iso(to), 'note', true)

  let y = 2
  gantt.sections.forEach((name, s) => {
    if (name) canvas.text(0, y++, cut(name), 'label')
    for (const t of gantt.tasks.filter(t => t.section === s)) {
      canvas.text(2, y, cut(t.name), 'note')
      const a = col(t.start)
      const b = Math.max(a, col(t.end) - (t.end > t.start ? 1 : 0))
      const ink: Ink = t.tags.has('crit') ? 'crit' : t.tags.has('done') ? 'edge' : SLICE_INKS[s % SLICE_INKS.length]!
      if (t.tags.has('milestone') || t.end === t.start) canvas.put(x0 + a, y, '◆', ink === 'edge' ? 'edge' : 'arrow')
      else canvas.text(x0 + a, y, (t.tags.has('done') ? '▒' : '█').repeat(b - a + 1), ink)
      y++
    }
  })
  return canvas.rows()
}
