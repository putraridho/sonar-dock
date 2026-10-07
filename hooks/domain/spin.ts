// The spinner's mission-control vocabulary, per engine mode.

import { seedOf } from '../lib/math'

const WORDS: Readonly<Record<string, readonly string[]>> = {
  thinking: ['Plotting course', 'Calculating trajectory', 'Scanning sector', 'Running simulations', 'Consulting star charts'],
  requesting: ['Establishing uplink', 'Hailing ground control', 'Aligning antenna', 'Acquiring signal'],
  responding: ['Transmitting', 'Downlinking', 'Relaying telemetry', 'Beaming data'],
  'tool-input': ['Arming', 'Loading payload', 'Priming systems'],
  'tool-use': ['Engaging', 'Executing maneuver', 'Firing thrusters', 'Deploying'],
}

const TAGS: Readonly<Record<string, string>> = {
  thinking: 'THINKING',
  requesting: 'UPLINK',
  responding: 'DOWNLINK',
  'tool-input': 'ARMING',
  'tool-use': 'ENGAGED',
}

const SUFFIXES = ['▸', '▹'] as const
const WORD_HOLD_MS = 8000

// One word per mode, held for a few seconds, then the next from the list.
export function spinWord(mode: string, seed: string, sinceStart: number): string {
  const list = WORDS[mode] ?? ['Working']
  const base = Math.floor(seedOf(seed) * list.length)
  return list[(base + Math.floor(sinceStart / WORD_HOLD_MS)) % list.length]!
}

export function spinTag(mode: string): string {
  return TAGS[mode] ?? 'WORKING'
}

// The arrow that blinks after the word, once a second.
export function spinSuffix(nowMs: number): string {
  return SUFFIXES[Math.floor(nowMs / 1000) % SUFFIXES.length]!
}

// The engine's override messages (compacting, waiting…) as a HUD alert.
export function alertText(message: string): string {
  return message.replace(/(…|\.\.\.)\s*$/, '').trim().toUpperCase()
}
