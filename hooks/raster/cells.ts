// A raster is a grid of cells, three words each: glyph, foreground, background.

/** The terminal's own color, foreground or background. */
export const DEFAULT = 0x01000000

const BLANK = 0x20
// ' ' ▁ ▂ ▃ ▄ ▅ ▆ ▇ █: a bar's height in eighths of a cell.
const EIGHTHS = [0x20, 0x2581, 0x2582, 0x2583, 0x2584, 0x2585, 0x2586, 0x2587, 0x2588]

export class CellGrid {
  readonly words: Uint32Array

  constructor(
    readonly columns: number,
    readonly rows: number,
    readonly fill = DEFAULT,
  ) {
    this.words = new Uint32Array(columns * rows * 3)
    for (let i = 0; i < columns * rows; i++) this.set(i, BLANK, DEFAULT, fill)
  }

  set(i: number, glyph: number, fg: number, bg = DEFAULT): void {
    this.words[i * 3] = glyph
    this.words[i * 3 + 1] = fg
    this.words[i * 3 + 2] = bg
  }

  at(column: number, row: number): number {
    return row * this.columns + column
  }

  // Text from (x, y), clipped to the grid.
  write(x: number, y: number, text: string, fg: number, bg = DEFAULT, right = this.columns): void {
    if (y < 0 || y >= this.rows) return
    for (let k = 0; k < text.length; k++) {
      if (x + k < 0 || x + k >= right) continue
      this.set(this.at(x + k, y), text.codePointAt(k) ?? BLANK, fg, bg)
    }
  }

  // A bar rising from the bottom of column x, `eighths` of a cell tall per row it fills.
  bar(x: number, eighths: number, fg: number): void {
    for (let r = 0; r < this.rows; r++) {
      const fromBottom = this.rows - 1 - r
      const level = Math.max(0, Math.min(8, Math.round(eighths) - fromBottom * 8))
      this.set(this.at(x, r), EIGHTHS[level]!, fg)
    }
  }
}

// Cells as the base64 the Raster element takes.
export function encodeCells(words: Uint32Array): string {
  const bytes = new Uint8Array(words.buffer, words.byteOffset, words.byteLength)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(binary)
}
