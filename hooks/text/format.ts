// Words and numbers as the HUD writes them.

// The noun for a count: "file", "files".
export function noun(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many
}

// A count and its noun: "1 file", "3 files".
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${noun(n, one, many)}`
}

// "CALIBRATING SENSORS" → "Calibrating sensors".
export function sentenceCase(text: string): string {
  return text.charAt(0) + text.slice(1).toLowerCase()
}

// Exactly `width` columns: cut with an ellipsis, or padded.
export function fit(text: string, width: number): string {
  if (width <= 1) return ''
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width)
}

const two = (n: number) => String(n).padStart(2, '0')

// Wall-clock time, HH:MM:SS.
export function clock(ms: number): string {
  const d = new Date(ms)
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

// A span as HH:MM:SS.
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`
}

// The spinner's T+ clock: MM:SS, with hours once there are any.
export function sweepClock(ms: number): string {
  const full = elapsed(ms)
  return ms >= 3_600_000 ? full : full.slice(3)
}

// "12s", "3m 4s".
export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// A GitHub-style table: a pipe row followed by a |---|---| separator row.
export function hasMarkdownTable(text: string): boolean {
  return /^\s*\|.*\|\s*\n\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/m.test(text)
}

// Pasted text arrives wrapped in <pasted_content id="…">…</pasted_content id="…">: the words alone,
// without the wrapper, and at most one blank line between it and what was typed.
export function unwrapPastes(text: string): string {
  return text
    .replace(/<pasted_content id="([^"]*)">([\s\S]*?)<\/pasted_content id="\1">/g, (_, _id, body: string) => body.replace(/^\s*\n|\n\s*$/g, ''))
    .replace(/\n[ \t]*(\n[ \t]*)+\n/g, '\n\n')
    .replace(/^\s*\n|\n\s*$/g, '')
}
