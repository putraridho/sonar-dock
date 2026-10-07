// Every color Sonar Dock draws with, for dark and light terminals, defined once.
// Rasters take the numbers; the interface takes the same colors as hex strings.

import type { ToolKind } from '../domain/tools'
import { clamp01 } from '../lib/math'

export type Mode = 'light' | 'dark'

export type Theme = {
  screen: number
  ink: number
  mute: number
  accent: number
  track: number
  grid: number
  label: number
  red: number
  amber: number
  hi: number
  claude: number
  /** Text on a filled pill. */
  pillInk: number
  /** How bright the dimmest raster dot is, against the screen. */
  floor: number
  /** True where the raster leaves the terminal's own background showing. */
  isClear: boolean
  /** One color per threat level, NOMINAL to CRITICAL. */
  threat: readonly number[]
  tools: Readonly<Record<ToolKind, number>>
}

export const THEMES: Readonly<Record<Mode, Theme>> = {
  dark: {
    screen: 0x0b1411,
    ink: 0xd6e8e0,
    mute: 0x5f8276,
    accent: 0x3dffa2,
    track: 0x24382f,
    grid: 0x2a7a5c,
    label: 0x4f8f78,
    red: 0xff3b55,
    amber: 0xffd25a,
    hi: 0xffffff,
    claude: 0xe08a68,
    pillInk: 0x0b1411,
    floor: 0.3,
    isClear: false,
    threat: [0x3dffa2, 0xb6f26b, 0xffd25a, 0xff9a4a, 0xff3b55, 0xff3b55],
    tools: {
      bash: 0xffc35a,
      edit: 0xff7ad9,
      read: 0x6fd8ff,
      search: 0x5cf0d0,
      agent: 0xc3a6ff,
      web: 0x7aa8ff,
      mcp: 0xffe27a,
      other: 0xd8e6e0,
    },
  },
  light: {
    screen: 0xf6f8f7,
    ink: 0x14211c,
    mute: 0x4f665c,
    accent: 0x00663f,
    track: 0xcfdcd6,
    grid: 0x6b9484,
    label: 0x3f574d,
    red: 0xc0102c,
    amber: 0x8f5a00,
    hi: 0x001a10,
    claude: 0xc15f3c,
    pillInk: 0xffffff,
    floor: 0.62,
    isClear: true,
    threat: [0x00663f, 0x4a7400, 0x8f5a00, 0xa84400, 0xc0102c, 0xc0102c],
    tools: {
      bash: 0xa65c00,
      edit: 0xa8127a,
      read: 0x0a5fa8,
      search: 0x00745f,
      agent: 0x5b2fc0,
      web: 0x1f45b8,
      mcp: 0x7a6200,
      other: 0x3a4a43,
    },
  },
}

type ColorKey = { [K in keyof Theme]: Theme[K] extends number ? (K extends 'floor' ? never : K) : never }[keyof Theme]

/** A theme's colors as the interface takes them: `#rrggbb`. */
export type Swatch = Readonly<Record<ColorKey, string>> & {
  threat: readonly string[]
  tool: (kind: string) => string
}

export function hexOf(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

// Blends two 0xrrggbb colors, `t` of the way from `a` to `b`.
export function mix(a: number, b: number, t: number): number {
  const k = clamp01(t)
  const channel = (shift: number) => {
    const x = (a >> shift) & 0xff
    const y = (b >> shift) & 0xff
    return Math.round(x + (y - x) * k) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

export function mixHex(a: string, b: string, t: number): string {
  return hexOf(mix(parseInt(a.slice(1), 16), parseInt(b.slice(1), 16), t))
}

export function toolColor(theme: Theme, kind: string): number {
  return theme.tools[kind as ToolKind] ?? theme.tools.other
}

function swatchOf(theme: Theme): Swatch {
  const colors = Object.fromEntries(
    Object.entries(theme).filter(([key, value]) => typeof value === 'number' && key !== 'floor').map(([key, value]) => [key, hexOf(value as number)]),
  ) as Record<ColorKey, string>
  return { ...colors, threat: theme.threat.map(hexOf), tool: kind => hexOf(toolColor(theme, kind)) }
}

export const SWATCHES: Readonly<Record<Mode, Swatch>> = { dark: swatchOf(THEMES.dark), light: swatchOf(THEMES.light) }

// A usage gauge's color: calm, then amber from 70%, red from 90%.
export function gaugeColor(percent: number, mode: Mode = 'dark'): string {
  const s = SWATCHES[mode]
  return percent >= 90 ? s.red : percent >= 70 ? s.amber : s.accent
}
