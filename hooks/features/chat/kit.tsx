// The chat skin's building blocks: the screenplay layout (a speaker pill in the gutter, the words
// beside it), the pill, and the decrypt that types a line in through noise.

import type { Elements } from 'claude-code'

import { beat, decode, decodeWord, strobe } from '../../motion/effects'
import { mixHex } from '../../theme/palette'

export type Ui = Elements['terminal']

/** Blank rows above a chat row: a new speaker or tool call, and a reply's later blocks. */
export const ROW_GAP = 2
export const BLOCK_GAP = 1
/** The speaker column. */
export const GUTTER = 9

// A pill powering on: it strobes, then holds `color`, pulsing toward the screen as it settles.
export function pillFlash(color: string, screen: string, p: number, glow: number): string {
  return p < 0.35 ? strobe(color, screen, p) : mixHex(color, screen, 0.55 * glow)
}

export function Pill(props: { ui: Pick<Ui, 'Text'>; word: string; p: number; background: string; ink: string }) {
  const { Text } = props.ui
  return (
    <Text backgroundColor={props.background} color={props.ink} bold>
      {` ${decodeWord(props.word, props.p)} `}
    </Text>
  )
}

export function SpeakerRow(props: { ui: Pick<Ui, 'Box'>; gap: number; shift?: number; speaker: unknown; children?: unknown }) {
  const { Box } = props.ui
  return (
    <Box flexDirection="row" marginTop={props.gap} marginLeft={props.shift ?? 0}>
      <Box width={GUTTER} flexShrink={0} flexDirection="column">
        {props.speaker as never}
      </Box>
      {props.children as never}
    </Box>
  )
}

// Text typing itself in: locked characters, a flickering band, the write head, static ahead.
export function Decrypt(props: {
  ui: Pick<Ui, 'Text'>
  text: string
  p: number
  color: string
  hot: string
  screen: string
  glow?: number
  bold?: boolean
  wrap?: 'wrap' | 'truncate-end'
}) {
  const { Text } = props.ui
  const { text, p, color, hot, screen, bold } = props
  const glow = props.glow ?? 0
  const d = decode(text, p)
  const b = beat()
  return (
    <Text bold={bold} wrap={props.wrap ?? 'wrap'}>
      <Text color={glow > 0 ? mixHex(color, screen, 0.85 * glow) : color} backgroundColor={glow > 0 ? mixHex(screen, hot, 0.85 * glow) : undefined} bold={bold}>
        {d.done}
      </Text>
      <Text color={b > 0.5 ? screen : hot} backgroundColor={b > 0.5 ? hot : undefined} bold>
        {d.hot}
      </Text>
      <Text color={hot} bold>
        {d.trail ?? ''}
      </Text>
      <Text color={mixHex(hot, screen, 0.5 * b)} bold>
        {d.head}
      </Text>
      <Text color={hot} dimColor>
        {d.ghost}
      </Text>
    </Text>
  )
}
