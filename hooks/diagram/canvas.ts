// A grid of terminal cells a diagram draws on: lines are kept as the directions they leave each
// cell in, and become box-drawing characters only when the grid is read out, so lines that meet
// join (├ ┬ ┼) by themselves.

export type Ink = 'box' | 'label' | 'edge' | 'arrow' | 'note' | 'space'
export type Run = { text: string; ink: Ink }
export type Rows = Run[][]
export type Stroke = 'solid' | 'dotted' | 'thick'

export const UP = 1
export const DOWN = 2
export const LEFT = 4
export const RIGHT = 8

const SOLID: Record<number, string> = {
  [UP]: '│', [DOWN]: '│', [UP | DOWN]: '│', [LEFT]: '─', [RIGHT]: '─', [LEFT | RIGHT]: '─',
  [DOWN | RIGHT]: '╭', [DOWN | LEFT]: '╮', [UP | RIGHT]: '╰', [UP | LEFT]: '╯',
  [UP | DOWN | RIGHT]: '├', [UP | DOWN | LEFT]: '┤', [DOWN | LEFT | RIGHT]: '┬', [UP | LEFT | RIGHT]: '┴',
  [UP | DOWN | LEFT | RIGHT]: '┼',
}
const DOTTED: Record<number, string> = { ...SOLID, [UP]: '┊', [DOWN]: '┊', [UP | DOWN]: '┊', [LEFT]: '┄', [RIGHT]: '┄', [LEFT | RIGHT]: '┄' }
const THICK: Record<number, string> = {
  [UP]: '┃', [DOWN]: '┃', [UP | DOWN]: '┃', [LEFT]: '━', [RIGHT]: '━', [LEFT | RIGHT]: '━',
  [DOWN | RIGHT]: '┏', [DOWN | LEFT]: '┓', [UP | RIGHT]: '┗', [UP | LEFT]: '┛',
  [UP | DOWN | RIGHT]: '┣', [UP | DOWN | LEFT]: '┫', [DOWN | LEFT | RIGHT]: '┳', [UP | LEFT | RIGHT]: '┻',
  [UP | DOWN | LEFT | RIGHT]: '╋',
}
const STROKES: Record<Stroke, Record<number, string>> = { solid: SOLID, dotted: DOTTED, thick: THICK }

/** Marks the second cell of a wide character. */
const WIDE_TAIL = ''

// Columns a character takes: two for CJK and emoji, one otherwise.
export function charWidth(ch: string): number {
  const c = ch.codePointAt(0) ?? 0
  return (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe4f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x1f300 && c <= 0x1faff) ||
    (c >= 0x20000 && c <= 0x3fffd)
    ? 2
    : 1
}

export function textWidth(text: string): number {
  let w = 0
  for (const ch of text) w += charWidth(ch)
  return w
}

export class Canvas {
  readonly width: number
  readonly height: number
  private readonly chars: string[]
  private readonly inks: Ink[]
  private readonly masks: number[]
  private readonly strokes: Stroke[]

  constructor(width: number, height: number) {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    const n = this.width * this.height
    this.chars = new Array<string>(n).fill(' ')
    this.inks = new Array<Ink>(n).fill('space')
    this.masks = new Array<number>(n).fill(0)
    this.strokes = new Array<Stroke>(n).fill('solid')
  }

  private at(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.width && y < this.height ? y * this.width + x : -1
  }

  isEmpty(x: number, y: number): boolean {
    const i = this.at(x, y)
    return i >= 0 && this.chars[i] === ' ' && this.masks[i] === 0
  }

  put(x: number, y: number, ch: string, ink: Ink): void {
    const i = this.at(x, y)
    if (i < 0) return
    this.chars[i] = ch
    this.inks[i] = ink
    this.masks[i] = 0
  }

  // Writes `text` from (x, y); with `onlyEmpty`, stops at the first cell already drawn on.
  text(x: number, y: number, text: string, ink: Ink, onlyEmpty = false): void {
    let col = x
    for (const ch of text) {
      const w = charWidth(ch)
      if (onlyEmpty && !(this.isEmpty(col, y) && (w === 1 || this.isEmpty(col + 1, y)))) return
      this.put(col, y, ch, ink)
      if (w === 2) this.put(col + 1, y, WIDE_TAIL, ink)
      col += w
    }
  }

  link(x: number, y: number, bits: number, stroke: Stroke = 'solid'): void {
    const i = this.at(x, y)
    if (i < 0 || this.chars[i] !== ' ') return
    this.masks[i] = this.masks[i]! | bits
    if (stroke !== 'solid') this.strokes[i] = stroke
  }

  // A straight run of line from one cell to another, along a row or a column.
  line(x0: number, y0: number, x1: number, y1: number, stroke: Stroke = 'solid'): void {
    if (y0 === y1) {
      const [a, b] = x0 <= x1 ? [x0, x1] : [x1, x0]
      if (a === b) return
      for (let x = a; x <= b; x++) this.link(x, y0, (x > a ? LEFT : 0) | (x < b ? RIGHT : 0), stroke)
    } else {
      const [a, b] = y0 <= y1 ? [y0, y1] : [y1, y0]
      for (let y = a; y <= b; y++) this.link(x0, y, (y > a ? UP : 0) | (y < b ? DOWN : 0), stroke)
    }
  }

  // A line through each point in turn, turning at each.
  path(points: ReadonlyArray<readonly [number, number]>, stroke: Stroke = 'solid'): void {
    for (let k = 1; k < points.length; k++) {
      const [x0, y0] = points[k - 1]!
      const [x1, y1] = points[k]!
      if (x0 !== x1 && y0 !== y1) {
        this.line(x0, y0, x1, y0, stroke)
        this.line(x1, y0, x1, y1, stroke)
      } else this.line(x0, y0, x1, y1, stroke)
    }
  }

  box(x: number, y: number, w: number, h: number, corners: string, ink: Ink = 'box'): void {
    const [tl, tr, bl, br] = [...corners]
    for (let i = 1; i < w - 1; i++) {
      this.put(x + i, y, '─', ink)
      this.put(x + i, y + h - 1, '─', ink)
    }
    for (let j = 1; j < h - 1; j++) {
      this.put(x, y + j, '│', ink)
      this.put(x + w - 1, y + j, '│', ink)
      for (let i = 1; i < w - 1; i++) this.put(x + i, y + j, ' ', 'space')
    }
    this.put(x, y, tl!, ink)
    this.put(x + w - 1, y, tr!, ink)
    this.put(x, y + h - 1, bl!, ink)
    this.put(x + w - 1, y + h - 1, br!, ink)
  }

  // Each row as runs of one ink, trailing blanks gone; blank rows at either end dropped.
  rows(): Rows {
    const out: Rows = []
    for (let y = 0; y < this.height; y++) {
      const row: Run[] = []
      let end = this.width
      while (end > 0 && this.isEmpty(end - 1, y)) end--
      for (let x = 0; x < end; x++) {
        const i = y * this.width + x
        const mask = this.masks[i]!
        const ch = mask ? (STROKES[this.strokes[i]!][mask] ?? '┼') : this.chars[i]!
        if (ch === WIDE_TAIL) continue
        const ink: Ink = mask ? 'edge' : this.inks[i]!
        const last = row[row.length - 1]
        if (last && last.ink === ink) last.text += ch
        else row.push({ text: ch, ink })
      }
      out.push(row)
    }
    while (out.length && out[0]!.length === 0) out.shift()
    while (out.length && out[out.length - 1]!.length === 0) out.pop()
    return out
  }
}

export function rowWidth(row: readonly Run[]): number {
  return row.reduce((w, r) => w + textWidth(r.text), 0)
}
