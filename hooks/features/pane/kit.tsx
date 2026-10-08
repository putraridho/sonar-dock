// The pane's screen: text on the phosphor background, rules and section titles.

import type { Elements, RenderNode } from 'claude-code'

import type { Swatch } from '../../theme/palette'

export type PaneUi = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export type ScreenText = (props: { color?: string; bold?: boolean; children?: unknown }) => RenderNode

/** The width of the label column (Threat, 5-hour, Context, a log line's tool). */
export const LABEL_W = 10

// Text that always sits on the screen's own background.
export function screenText(ui: PaneUi, C: Swatch): ScreenText {
  const { Text } = ui
  return props => (
    <Text backgroundColor={C.screen} color={props.color ?? C.ink} bold={props.bold}>
      {props.children as string}
    </Text>
  )
}
