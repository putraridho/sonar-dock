// The reply as it streams. Text pieces are held a moment on their way to the transcript; while
// held they show in the band above the prompt, glitching as they settle. Every chunk still reaches
// the engine unchanged and in order: the hold only delays text, and any other chunk flushes it first.

import type { TurnStepChunk } from 'claude-code'

/** How long a text piece is held, and so how long it glitches before it settles. */
export const HOLD_MS = 450
const KEPT_CHARS = 600

/** A line of the streaming text, and how settled each of its characters is (0 → 1). */
export type LiveLine = { text: string; settled: number[] }

export class LiveFeed {
  private index = -1
  private text = ''
  private arrivals: number[] = []

  get isEmpty(): boolean {
    return this.text === ''
  }

  // Text arriving in content block `index`; a new block starts the feed over.
  add(index: number, text: string, at: number): void {
    if (index !== this.index) this.reset(index)
    this.text += text
    for (let i = 0; i < text.length; i++) this.arrivals.push(at)
    if (this.text.length > KEPT_CHARS) {
      this.arrivals = this.arrivals.slice(this.text.length - KEPT_CHARS)
      this.text = this.text.slice(-KEPT_CHARS)
    }
  }

  // Empties the feed; true if there was anything to clear.
  clear(): boolean {
    const had = this.index !== -1 || !this.isEmpty
    this.reset(-1)
    return had
  }

  // The last `count` lines, each cut to its last `width` characters (the writing end).
  tail(count: number, width: number, nowMs: number): LiveLine[] {
    const lines: LiveLine[] = []
    let end = this.text.length
    while (lines.length < count && end > 0) {
      const start = this.text.lastIndexOf('\n', end - 1) + 1
      const from = Math.max(start, end - width)
      const text = this.text.slice(from, end)
      lines.unshift({ text, settled: [...text].map((_, i) => Math.min(1, (nowMs - (this.arrivals[from + i] ?? 0)) / HOLD_MS)) })
      end = start - 1
    }
    return lines
  }

  private reset(index: number): void {
    this.index = index
    this.text = ''
    this.arrivals = []
  }
}

export type PaceOptions = {
  /** Hold text pieces for HOLD_MS; without it every chunk passes at once. */
  isHeld: boolean
  /** Each chunk as it arrives, before any hold. */
  onArrive?: (chunk: TurnStepChunk, at: number) => void
  /** A tool call starts: the text before it is done. */
  onTool?: () => void
  clock?: () => number
}

// The stream as it reaches the engine: every chunk, unchanged and in order.
export async function* paceStream(source: AsyncIterable<TurnStepChunk>, options: PaceOptions): AsyncGenerator<TurnStepChunk> {
  const { isHeld, onArrive = () => {}, onTool = () => {}, clock = Date.now } = options
  const held: { chunk: TurnStepChunk; at: number }[] = []
  for await (const chunk of source) {
    const t = clock()
    onArrive(chunk, t)
    if (!isHeld) {
      yield chunk
      continue
    }
    if (chunk.kind === 'text') {
      held.push({ chunk, at: t })
      while (held.length > 0 && t - held[0]!.at >= HOLD_MS) yield held.shift()!.chunk
      continue
    }
    while (held.length > 0) yield held.shift()!.chunk
    if (chunk.kind === 'tool') onTool()
    yield chunk
  }
  while (held.length > 0) yield held.shift()!.chunk
}

// Characters a chunk carries, for the stream meter.
export function charsOf(chunk: TurnStepChunk): number {
  if (chunk.kind === 'text' || chunk.kind === 'thinking') return chunk.text.length
  if (chunk.kind === 'input') return chunk.json.length
  return 0
}
