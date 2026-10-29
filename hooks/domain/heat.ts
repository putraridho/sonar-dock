// File heat: how often each file was edited and read this session, edits weighing twice.

import type { Stats } from '../../types'

export type Heat = NonNullable<Stats['heat']>

/** How many files the heat keeps: the coolest go first. */
export const HEAT_LIMIT = 100

export function warmth(h: { e: number; r: number }): number {
  return h.e * 2 + h.r
}

// One more edit or read of `path`; past HEAT_LIMIT files, the coolest other file is dropped.
export function warmed(heat: Heat, path: string, kind: 'e' | 'r'): Heat {
  const was = heat[path] ?? { e: 0, r: 0 }
  const next = { ...heat, [path]: { ...was, [kind]: was[kind] + 1 } }
  const paths = Object.keys(next)
  if (paths.length <= HEAT_LIMIT) return next
  const coolest = paths.filter(p => p !== path).sort((a, b) => warmth(next[a]!) - warmth(next[b]!))[0]!
  delete next[coolest]
  return next
}
