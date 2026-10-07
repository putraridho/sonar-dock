// The clocks that keep the HUD moving. Each draws only what is on screen, and idle work is cut:
// the radar and the core drop to a quarter of the frame rate, the pane clock to once a minute.
// They reach the engine only through `Ports`, which the session's start hands them.

import { ALERT_LEVEL } from '../domain/threat'
import { FRAME_MS } from '../motion/frame'
import { encodeCells } from '../raster/cells'
import { drawCore } from '../raster/core'
import { drawRadar } from '../raster/radar'
import { drawMeter, drawShimmer } from '../raster/strips'
import type { Context } from '../runtime/context'
import { METER_COLUMNS } from '../runtime/context'
import { FLOW_SAMPLE_MS } from '../runtime/flow'
import { PANE } from '../runtime/hud'

export const SHIMMER_COLUMNS = 28
const IDLE_FRAME_EVERY = 4
const MODE_SYNC_MS = 60_000
const THREAT_COOLDOWN_MS = 20_000

/** What the loops may do to the engine. */
export type Ports = {
  every: (ms: number, tick: () => void) => void
  /** Draws cells into a Raster on screen; resolves false once that Raster is gone. */
  blit: (requestId: string, key: string, cells: string) => Promise<boolean>
  redrawChat: () => void
  publishNow: (t: number) => void
  publishThreat: () => void
  clearAlert: () => void
  syncMode: () => void
}

export function startLoops(io: Ports, ctx: Context): void {
  const { scene, surfaces, hud, motion, flow, appearance } = ctx

  const blit = (requestId: string, key: string, cells: string, onGone: () => void) =>
    void io.blit(requestId, key, cells).then(isShown => {
      if (!isShown) onGone()
    })

  // A frame loop that skips frames while idle.
  const animate = (draw: () => void) => {
    let tick = 0
    io.every(FRAME_MS, () => {
      if (scene.isIdle && ++tick % IDLE_FRAME_EVERY !== 0) return
      draw()
    })
  }

  animate(() => {
    const radar = surfaces.radar
    if (!radar) return
    const cells = encodeCells(drawRadar(radar.columns, radar.rows, scene.now(), hud.blips, hud.level, appearance.current))
    blit(PANE, 'radar', cells, () => (surfaces.radar = null))
  })

  animate(() => {
    const band = surfaces.band
    if (!band) return
    const t = scene.now()
    const [label, note] = scene.caption()
    const cells = encodeCells(drawCore(band.columns, t, scene.activity, scene.kind, appearance.current, label, note, scene.spans(t)))
    blit(band.id, 'core', cells, () => (surfaces.band = null))
  })

  // The chat redraws only while something on it moves.
  io.every(FRAME_MS, () => {
    if (motion.takeFrame()) io.redrawChat()
  })

  io.every(FRAME_MS, () => {
    for (const id of surfaces.shimmers) {
      const cells = encodeCells(drawShimmer(SHIMMER_COLUMNS, Date.now(), surfaces.running.get(id) ?? 'other', appearance.current))
      blit(id, 'shimmer', cells, () => surfaces.shimmers.delete(id))
    }
  })

  // The stream meter changes only when a sample lands, so it redraws then.
  io.every(FLOW_SAMPLE_MS, () => {
    const samples = flow.roll()
    if (surfaces.spinners.size === 0) return
    const cells = encodeCells(drawMeter(METER_COLUMNS, samples, surfaces.meterKind, appearance.current))
    for (const id of surfaces.spinners) blit(id, 'pulse', cells, () => surfaces.spinners.delete(id))
  })

  // The pane's clock: every second while working; idle, it shows minutes, so once a minute.
  let shownAt = 0
  io.every(1000, () => {
    const t = Date.now()
    if (scene.isIdle && Math.floor(t / 60_000) === Math.floor(shownAt / 60_000)) return
    shownAt = t
    io.publishNow(t)
  })

  // Threat cools by one level at a time; the alert clears once it drops below red.
  io.every(THREAT_COOLDOWN_MS, () => {
    if (hud.level === 0) return
    hud.setLevel(hud.level - 1)
    io.publishThreat()
    if (hud.level < ALERT_LEVEL) io.clearAlert()
  })

  io.every(MODE_SYNC_MS, io.syncMode)
}
