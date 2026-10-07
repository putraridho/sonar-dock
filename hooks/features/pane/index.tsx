// The HUD pane: boot sequence, then the dashboard: header, threat, usage, the radar, the
// activity log and the session's totals.

import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { encodeCells } from '../../raster/cells'
import { drawRadar, radarSize } from '../../raster/radar'
import { clock, elapsed } from '../../text/format'
import { SWATCHES } from '../../theme/palette'
import type { Context } from '../../runtime/context'
import { PANE } from '../../runtime/hud'
import { BOOT_DONE, INITIAL } from '../../runtime/state'
import { Boot } from './boot'
import { screenText } from './kit'
import type { PaneUi } from './kit'
import { ActivityLog, ThreatLine, Totals, Usage, gaugesOf, linesThatFit } from './sections'

// State this file reads or writes.
const log = atom({ plugin: 'sonar-dock', key: 'log' } as const, INITIAL.log)
const stats = atom({ plugin: 'sonar-dock', key: 'stats' } as const, INITIAL.stats)
const threat = atom({ plugin: 'sonar-dock', key: 'threat' } as const, INITIAL.threat)
const alert = atom({ plugin: 'sonar-dock', key: 'alert' } as const, INITIAL.alert)
const boot = atom({ plugin: 'sonar-dock', key: 'boot' } as const, INITIAL.boot)
const now = atom({ plugin: 'sonar-dock', key: 'now' } as const, INITIAL.now)
const mode = atom({ plugin: 'sonar-dock', key: 'mode' } as const, INITIAL.mode)
const reserves = atom({ plugin: 'sonar-dock', key: 'reserves' } as const, INITIAL.reserves)

/** Rows the dashboard needs besides the radar and the log. */
const CHROME_ROWS = 21
const MIN_LOG_ROWS = 3

export function installPane(on: On, { motion, scene, surfaces, hud }: Context): void {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as unknown as PaneUi
    const { Box } = ui
    const m = await read($, mode)
    const C = SWATCHES[m]
    const T = screenText(ui, C)
    const width = Math.max(24, e.props.bodyColumns - 4)
    const step = await read($, boot)
    const t = await read($, now)
    const rule = <T color={C.track}>{'─'.repeat(width)}</T>
    const blank = <T> </T>

    if (step !== BOOT_DONE) {
      surfaces.radar = null
      return <Boot ui={ui} C={C} T={T} step={step} width={width} />
    }

    const s = await read($, stats)
    const level = await read($, threat)
    const danger = await read($, alert)
    const list = await read($, log)
    const res = await read($, reserves)

    const size = radarSize(width)
    let radar = <T color={C.mute}>The radar draws in the terminal.</T>
    surfaces.radar = null
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      surfaces.radar = size
      radar = <Raster key="radar" columns={size.columns} rows={size.rows} cells={encodeCells(drawRadar(size.columns, size.rows, scene.now(), hud.blips, level, m))} />
    }
    const isEngaged = s.turnStartedAt !== null
    const logRows = Math.max(MIN_LOG_ROWS, (e.viewport?.rows ?? 40) - size.rows - CHROME_ROWS)

    return (
      <Box flexDirection="column" backgroundColor={C.screen} paddingX={2} paddingY={1}>
        <Box flexDirection="row" width={width}>
          <Box flexGrow={1}>
            <T bold>Sonar Dock</T>
          </Box>
          <T color={isEngaged ? C.accent : C.mute}>{isEngaged ? '● Engaged' : '○ Standby'}</T>
          <T color={C.mute}>{`  ${isEngaged ? elapsed(t - (s.turnStartedAt ?? t)) : clock(t).slice(0, 5)}`}</T>
        </Box>
        {rule}
        {blank}
        <ThreatLine ui={ui} C={C} T={T} level={level} danger={danger} />
        {blank}
        <T color={C.mute} bold>Usage</T>
        <Usage ui={ui} C={C} T={T} gauges={gaugesOf(res, t)} width={width} mode={m} motion={motion} />
        {blank}
        {radar}
        {blank}
        <T color={C.mute} bold>Activity</T>
        <ActivityLog ui={ui} C={C} T={T} lines={linesThatFit(list, logRows, width)} width={width} motion={motion} />
        {blank}
        {rule}
        <Totals ui={ui} C={C} T={T} stats={s} />
      </Box>
    )
  })
}
