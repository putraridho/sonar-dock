// Markdown as plain words, for lines shown before the transcript formats them. Each character
// keeps a value alongside (when it arrived), so effects on the plain line still know its age.

export type Tagged = { text: string; tags: number[] }

const PREFIX = /^(\s*)(#{1,6}\s+|>\s?|[-*+]\s+)?/
const LINK = /\[([^\]\n]*)\]\([^)\n]*\)/g
const DROPPED = new Set(['*', '`'])
const BULLET = '• '

// One line of markdown without its syntax: headings and quotes lose their markers, list items
// get a bullet, links keep their words, and emphasis and code marks go.
export function plainLine(text: string, tags: readonly number[]): Tagged {
  const keep = new Array<boolean>(text.length).fill(true)
  const swaps = new Map<number, string>()

  const prefix = PREFIX.exec(text)!
  const marker = prefix[2]
  if (marker) {
    const at = prefix[1]!.length
    for (let i = at; i < at + marker.length; i++) keep[i] = false
    if (/^[-*+]/.test(marker)) swaps.set(at, BULLET)
  }

  for (const link of text.matchAll(LINK)) {
    const start = link.index!
    const words = link[1]!.length
    keep[start] = false
    for (let i = start + 1 + words; i < start + link[0].length; i++) keep[i] = false
  }

  for (let i = 0; i < text.length; i++) if (DROPPED.has(text[i]!)) keep[i] = false

  const out: Tagged = { text: '', tags: [] }
  for (let i = 0; i < text.length; i++) {
    const swap = swaps.get(i)
    if (swap !== undefined) {
      out.text += swap
      for (let k = 0; k < swap.length; k++) out.tags.push(tags[i] ?? 0)
    }
    if (!keep[i]) continue
    out.text += text[i]
    out.tags.push(tags[i] ?? 0)
  }
  return out
}

/** How far back a cut looks for a space, so it starts on a whole word. */
const WORD_REACH = 16

// The last `width` columns of a line, starting on a whole word where one is near, marked with '…'.
export function tailToWidth(line: Tagged, width: number): Tagged {
  if (line.text.length <= width) return line
  let from = line.text.length - (width - 1)
  const space = line.text.indexOf(' ', from)
  if (space !== -1 && space - from < WORD_REACH && space + 1 < line.text.length) from = space + 1
  return { text: `…${line.text.slice(from)}`, tags: [line.tags[from] ?? 0, ...line.tags.slice(from)] }
}
