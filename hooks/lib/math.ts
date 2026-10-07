// Small numeric helpers shared by the drawings and the motion.

export const TAU = Math.PI * 2

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1)
}

// Cubic ease-out: fast at first, settling at the end.
export function ease(p: number): number {
  return 1 - Math.pow(1 - p, 3)
}

// Smoothstep from 0 to 1 over 0 → 1.
export function smooth(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)
}

// A cheap, repeatable pseudo-random number in [0, 1) for any input.
export function noise(x: number): number {
  const n = Math.sin(x) * 43758.5453
  return n - Math.floor(n)
}

// A stable seed in [0, 1) for a string (FNV-1a).
export function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}
