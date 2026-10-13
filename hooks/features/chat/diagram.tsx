// A mermaid diagram in a reply, drawn in cells: a small title, then the rows sweeping in from
// the top behind a bright scan line, as the screen paints it.

import type { Ink, Rows } from '../../diagram'
import type { Swatch } from '../../theme/palette'
import type { Ui } from './kit'

export function Diagram(props: { ui: Pick<Ui, 'Box' | 'Text'>; title: string; rows: Rows; p: number; C: Swatch }) {
  const { Box, Text } = props.ui
  const { rows, p, C } = props
  const inks: Record<Ink, string | undefined> = { box: C.accent, label: C.ink, edge: C.grid, arrow: C.accent, note: C.amber, space: undefined }
  const shown = p >= 1 ? rows.length : Math.floor(p * (rows.length + 1))
  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={C.label}>{`◇ ${props.title.toUpperCase()}`}</Text>
      {rows.map((runs, i) => (
        <Text key={`row${i}`} wrap="truncate-end">
          {i < shown
            ? runs.map((run, j) => (
                <Text key={`run${j}`} color={i === shown - 1 && p < 1 ? C.hi : inks[run.ink]} bold={run.ink === 'label'}>
                  {run.text}
                </Text>
              ))
            : ' '}
        </Text>
      ))}
    </Box>
  )
}
