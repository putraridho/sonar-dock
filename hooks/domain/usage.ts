// Usage windows and context, as the session reports them.

import type { Reserves } from '../../types'

export type UsageReading = {
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]
  context: { percent?: number }
  cost?: { usd: number }
}

export const EMPTY_RESERVES: Reserves = { limits: [], contextPercent: null, costUsd: null }

export function toReserves(u: UsageReading): Reserves {
  return {
    limits: u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    contextPercent: u.context.percent ?? null,
    costUsd: u.cost?.usd ?? null,
  }
}

const SHORT_NAMES: Readonly<Record<string, string>> = { five_hour: '5H', seven_day: 'WEEK', spend_limit: 'SPEND' }
const LONG_NAMES: Readonly<Record<string, string>> = { five_hour: '5-hour', seven_day: 'Weekly' }

// "5H", "WEEK": the compact name.
export function limitName(kind: string): string {
  return SHORT_NAMES[kind] ?? kind.toUpperCase().slice(0, 5)
}

// "5-hour", "Weekly": the name a sentence uses.
export function windowName(kind: string): string {
  return LONG_NAMES[kind] ?? limitName(kind)
}

export function fiveHourPercent(r: Reserves): number | null {
  return r.limits.find(l => l.kind === 'five_hour')?.percentUsed ?? null
}

// "2h 14m" until the window resets; empty when unknown.
export function untilReset(resetsAt: string | undefined, nowMs: number): string {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - nowMs
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'resetting'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

// The warning line a window has crossed: 0, 80 or 95.
export function warningLine(percent: number): number {
  return percent >= 95 ? 95 : percent >= 80 ? 80 : 0
}

export type UsagePoint = { at: number; percent: number }

/** The pace is read over this much of the recent past, and needs at least the shorter span. */
export const PACE_WINDOW_MS = 30 * 60_000
const MIN_PACE_SPAN_MS = 2 * 60_000

// When a window fills at the pace of its recent readings: ms from `nowMs`, or null when it is not
// rising, too new to tell, or resets first.
export function fullIn(points: readonly UsagePoint[], resetsAt: string | undefined, nowMs: number): number | null {
  const recent = points.filter(p => nowMs - p.at <= PACE_WINDOW_MS)
  const first = recent[0]
  const last = recent[recent.length - 1]
  if (!first || !last || last.at - first.at < MIN_PACE_SPAN_MS || last.percent <= first.percent) return null
  const perMs = (last.percent - first.percent) / (last.at - first.at)
  const ms = Math.max(0, (100 - last.percent) / perMs - (nowMs - last.at))
  const reset = resetsAt ? Date.parse(resetsAt) - nowMs : Infinity
  return Number.isFinite(reset) && ms >= reset ? null : ms
}

// "~40m", "~2h 10m": a forecast, rounded as loosely as it deserves.
export function roughly(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000))
  if (m < 60) return `~${m}m`
  const tens = Math.round(m / 10) * 10
  return `~${Math.floor(tens / 60)}h ${String(tens % 60).padStart(2, '0')}m`
}
