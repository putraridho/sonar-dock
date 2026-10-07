// One frame clock for everything that moves: 30 fps.

export const FRAME_MS = 33

// The frame number at a time: effects that flicker change once per frame.
export function frameOf(nowMs = Date.now()): number {
  return Math.floor(nowMs / FRAME_MS)
}
