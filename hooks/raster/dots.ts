// A canvas of braille dots, 2×4 per cell, so lines stay thin and round. Each dot keeps its
// brightest intensity and that stroke's color; `fold` packs the dots into a CellGrid.

import { TAU } from '../lib/math'
import type { CellGrid } from './cells'

const BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
] as const

const VISIBLE = 0.05

/** What one cell's dots came to: the brightest dot's intensity and color. */
export type CellDots = { column: number; row: number; best: number; color: number }

export class DotCanvas {
  readonly width: number
  readonly height: number
  private readonly level: Float32Array
  private readonly hue: Uint32Array

  constructor(columns: number, rows: number) {
    this.width = columns * 2
    this.height = rows * 4
    this.level = new Float32Array(this.width * this.height)
    this.hue = new Uint32Array(this.width * this.height)
  }

  plot(x: number, y: number, intensity: number, color = 0): void {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return
    const k = py * this.width + px
    if (intensity > (this.level[k] ?? 0)) {
      this.level[k] = intensity
      this.hue[k] = color
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, intensity: number, color = 0): void {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2))
    for (let s = 0; s <= n; s++) this.plot(x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n, intensity, color)
  }

  // A circle, or a dashed one (`dash` segments, every other drawn), turned by `phase`.
  arc(ox: number, oy: number, r: number, intensity: number, color: number, dash = 0, phase = 0): void {
    const steps = Math.max(24, Math.ceil(TAU * r * 1.6))
    for (let s = 0; s < steps; s++) {
      if (dash && Math.floor((s / steps) * dash) % 2 === 1) continue
      const a = (s / steps) * TAU + phase
      this.plot(ox + Math.cos(a) * r, oy + Math.sin(a) * r, intensity, color)
    }
  }

  // Each cell becomes a braille glyph of its lit dots, colored by `paint`; unlit cells are left alone.
  fold(grid: CellGrid, paint: (dots: CellDots) => readonly [fg: number, bg: number]): void {
    const columns = Math.min(grid.columns, this.width / 2)
    const rows = Math.min(grid.rows, this.height / 4)
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        let bits = 0
        let best = 0
        let color = 0
        for (let sx = 0; sx < 2; sx++) {
          for (let sy = 0; sy < 4; sy++) {
            const k = (row * 4 + sy) * this.width + column * 2 + sx
            const i = this.level[k] ?? 0
            if (i > VISIBLE) bits |= BITS[sx]![sy]!
            if (i > best) {
              best = i
              color = this.hue[k] ?? 0
            }
          }
        }
        if (!bits) continue
        const [fg, bg] = paint({ column, row, best, color })
        grid.set(grid.at(column, row), 0x2800 + bits, fg, bg)
      }
    }
  }
}
