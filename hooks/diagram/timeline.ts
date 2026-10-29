// Mermaid timelines as cells: a spine down the left, a dot per period with its name before it and
// its events after, and each section a dotted rule across.

import { Canvas, textWidth } from './canvas'
import type { Rows } from './canvas'
import { SLICE_INKS } from './pie'

type Period = { name: string; section: number; events: string[] }
export type Timeline = { title: string; sections: string[]; periods: Period[] }

export function parseTimeline(source: string): Timeline | null {
  const lines = source.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  if (!/^timeline\s*$/.test(lines[0] ?? '')) return null
  const timeline: Timeline = { title: '', sections: [], periods: [] }
  let section = -1
  for (const line of lines.slice(1)) {
    let m: RegExpExecArray | null
    if ((m = /^title\s+(.+)$/.exec(line))) timeline.title = m[1]!.trim()
    else if ((m = /^section\s+(.+)$/.exec(line))) section = timeline.sections.push(m[1]!.trim()) - 1
    else if (line.startsWith(':')) {
      // A line of its own that starts with a colon adds events to the period before it.
      const last = timeline.periods[timeline.periods.length - 1]
      if (last) last.events.push(...line.split(':').map(s => s.trim()).filter(Boolean))
    } else {
      const [name = '', ...events] = line.split(':').map(s => s.trim())
      if (name) timeline.periods.push({ name, section, events: events.filter(Boolean) })
    }
  }
  return timeline.periods.length ? timeline : null
}

export function drawTimeline(timeline: Timeline): Rows {
  const nameW = Math.max(...timeline.periods.map(p => textWidth(p.name)))
  const spine = nameW + 2
  const eventW = Math.max(0, ...timeline.periods.flatMap(p => p.events.map(textWidth)), ...timeline.sections.map(s => textWidth(s) + 4))
  const height = timeline.periods.reduce((h, p) => h + Math.max(1, p.events.length) + 1, 0) + timeline.sections.length
  const canvas = new Canvas(spine + 4 + eventW + 1, height)

  let y = 0
  let section = -1
  timeline.periods.forEach((p, k) => {
    if (p.section !== section && p.section >= 0) {
      section = p.section
      canvas.line(0, y, spine + 4 + eventW, y, 'dotted')
      canvas.text(spine + 4, y, ` ${timeline.sections[section]} `, 'label')
      y++
    }
    const ink = SLICE_INKS[Math.max(0, p.section) % SLICE_INKS.length]!
    const rows = Math.max(1, p.events.length)
    canvas.text(nameW - textWidth(p.name), y, p.name, 'label')
    canvas.put(spine, y, '●', ink)
    canvas.text(spine + 1, y, '──', 'edge')
    p.events.forEach((event, j) => canvas.text(spine + 4, y + j, event, 'note'))
    // The spine runs on to the next period's dot, past this one's events and any section rule.
    const next = timeline.periods[k + 1]
    if (next) canvas.line(spine, y + 1, spine, y + rows + 1 + (next.section !== section && next.section >= 0 ? 1 : 0))
    y += rows + 1
  })
  return canvas.rows()
}
