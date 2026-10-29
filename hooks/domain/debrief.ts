// The mission debrief: the session in a few lines, for /sonar debrief and /sonar off.

import type { Stats } from '../../types'
import { threatName } from './threat'
import { TOOLS, asToolKind } from './tools'
import { plural } from '../text/format'

const KINDS_SHOWN = 5

// "47m", "2h 05m": how long the watch has run.
export function watchLength(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

// When the watch began: the session's start as kept, else (for stats from before it was kept)
// the oldest moment still on record.
export function watchStart(s: Stats, log: readonly { at: number }[], loadedAt: number): number {
  return s.startedAt ?? Math.min(loadedAt, ...log.map(l => l.at), ...[...(s.edited ?? []), ...(s.failed ?? [])].map(m => m.at))
}

// The headline, then the counts, the calls by kind (most first), and what it cost.
export function debriefLines(s: Stats, costUsd: number | null, watchMs: number): string[] {
  const head = `DEBRIEF ▸ ${watchLength(watchMs)} on watch`
  if (s.ops === 0 && s.turns === 0) return [head, 'No contacts this session.']
  const counts = [plural(s.turns, 'turn'), plural(s.ops, 'action'), plural(s.edits, 'edit'), `${plural(s.files.length, 'file')} touched`]
  if (s.errors > 0) counts.push(plural(s.errors, 'error'))
  const kinds = Object.entries(s.kinds ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, KINDS_SHOWN)
    .map(([k, n]) => `${TOOLS[asToolKind(k)].noun} ${n}`)
  const close = [`peak threat ${threatName(s.peak ?? 0).toLowerCase()}`]
  if (costUsd !== null) close.push(`$${costUsd.toFixed(2)}`)
  return [head, counts.join(' · '), ...(kinds.length ? [kinds.join(' · ')] : []), close.join(' · ')]
}
