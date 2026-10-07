// The pane powering on: each system checks in, then Ready.

import { BOOT_LINES } from '../../runtime/hud'
import { sentenceCase } from '../../text/format'
import type { Swatch } from '../../theme/palette'
import type { PaneUi, ScreenText } from './kit'

const BOOT_WIDTH = 44

export function Boot(props: { ui: PaneUi; C: Swatch; T: ScreenText; step: number; width: number }) {
  const { Box } = props.ui
  const { C, T, step, width } = props
  return (
    <Box flexDirection="column" backgroundColor={C.screen} paddingX={2} paddingY={1}>
      <T bold>Sonar Dock</T>
      <T color={C.track}>{'─'.repeat(width)}</T>
      <T> </T>
      {BOOT_LINES.slice(0, step).map(name => (
        <Box flexDirection="row" width={Math.min(width, BOOT_WIDTH)}>
          <Box flexGrow={1}>
            <T color={C.mute}>{sentenceCase(name)}</T>
          </Box>
          <T color={C.accent}>✓</T>
        </Box>
      ))}
      {step <= BOOT_LINES.length ? <T color={C.accent}>▍</T> : <T color={C.accent}>Ready</T>}
    </Box>
  )
}
