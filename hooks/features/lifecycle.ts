// The session: its start (the pane, the theme, the clocks), the /sonar command, and usage
// readings as they arrive.

import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { fiveHourPercent, toReserves, windowName } from '../domain/usage'
import type { Appearance } from '../runtime/appearance'
import { THEME_KEY, resolveMode } from '../runtime/appearance'
import type { Context } from '../runtime/context'
import { BOOT_LINES, PANE } from '../runtime/hud'
import { BOOT_DONE, INITIAL } from '../runtime/state'
import { startLoops } from './loops'

// State this file reads or writes.
const threat = atom({ plugin: 'sonar-dock', key: 'threat' } as const, INITIAL.threat)
const alert = atom({ plugin: 'sonar-dock', key: 'alert' } as const, INITIAL.alert)
const boot = atom({ plugin: 'sonar-dock', key: 'boot' } as const, INITIAL.boot)
const now = atom({ plugin: 'sonar-dock', key: 'now' } as const, INITIAL.now)
const mode = atom({ plugin: 'sonar-dock', key: 'mode' } as const, INITIAL.mode)
const skin = atom({ plugin: 'sonar-dock', key: 'skin' } as const, INITIAL.skin)
const reserves = atom({ plugin: 'sonar-dock', key: 'reserves' } as const, INITIAL.reserves)

const SKIN_KEY = 'skin'
const PANE_SIZE = { columns: 66, rows: 40 }
const BOOT_STEP_MS = 280
const TOAST_MS = 6000

export function installLifecycle(on: On, ctx: Context): void {
  const { hud, appearance, scene, limits } = ctx

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sonar', description: 'Open the Sonar Dock HUD: radar, threat level and live telemetry' })
    await update($, now, () => Date.now())
    await syncMode($, appearance)
    // The skin stays as the person last left it, across sessions, until /sonar off.
    if ((await $.store.get(SKIN_KEY)) === true) await update($, skin, () => true)
    const first = toReserves(await $.session.usage())
    scene.noteUsage(fiveHourPercent(first))
    await update($, reserves, () => first)
    startLoops(
      {
        every: (ms, tick) => void $.clock.every(ms, tick),
        blit: (requestId, key, cells) => $.ui.blit({ requestId, key, cells }).then(r => r.deny === undefined),
        redrawChat: () => $.ui.invalidate('ui.render'),
        publishNow: t => void update($, now, () => t),
        publishThreat: () => void update($, threat, () => hud.level),
        clearAlert: () => void update($, alert, () => null),
        syncMode: () => void syncMode($, appearance),
      },
      ctx,
    )
    $.ui.status(hud.statusText())
    void openPane($)
    return next(e)
  })

  on('command.run', { command: 'sonar' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'light' || arg === 'dark' || arg === 'auto') {
      await $.store.set(THEME_KEY, arg)
      await syncMode($, appearance)
      return { text: `Sonar Dock palette: ${arg === 'auto' ? `auto (${appearance.current})` : arg}.` }
    }
    const isOn = arg !== 'off'
    await update($, skin, () => isOn)
    await $.store.set(SKIN_KEY, isOn)
    if (!isOn) {
      await $.ui.close({ id: PANE })
      return { text: 'Sonar Dock standing down. Chat restored.' }
    }
    const opened = await openPane($)
    return { text: opened.isPlaced ? 'Sonar Dock online.' : 'Sonar Dock is armed: widen the terminal to seat the HUD.' }
  })

  on('session.measure', async ($, e, next) => {
    const r = toReserves(e)
    scene.noteUsage(fiveHourPercent(r))
    await update($, reserves, () => r)
    for (const l of limits.crossed(r)) $.ui.toast(`${windowName(l.kind)} usage at ${Math.round(l.percentUsed)}%`, { timeoutMs: TOAST_MS })
    return next(e)
  })
}

// Opens the pane and plays its boot sequence.
async function openPane($: EngineInterface) {
  await update($, boot, () => 0)
  const opened = await $.ui.open({ id: PANE, title: 'Sonar Dock', ...PANE_SIZE })
  for (let step = 1; step <= BOOT_LINES.length + 1; step++) $.clock.after(BOOT_STEP_MS * step, () => void update($, boot, () => step))
  $.clock.after(BOOT_STEP_MS * (BOOT_LINES.length + 3), () => void update($, boot, () => BOOT_DONE))
  return opened
}

// Resolves light or dark again and publishes it if it changed.
async function syncMode($: EngineInterface, appearance: Appearance): Promise<void> {
  const row = (await $.config.list()).find(r => r.key === 'theme')
  const theme = typeof row?.value === 'string' ? row.value : 'auto'
  const next = await resolveMode(await $.store.get(THEME_KEY), theme, async () => {
    try {
      const r = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle'], { timeoutMs: 3000 })
      return r.exitCode === 0 && r.stdout.includes('Dark')
    } catch {
      return true
    }
  })
  if (next !== appearance.current || (await read($, mode)) !== next) {
    appearance.current = next
    await update($, mode, () => next)
  }
}
