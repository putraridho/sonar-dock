// Mermaid flowcharts as cells: the nodes in layers (each edge points one layer on, longer ones
// passing through stand-ins), ordered to cross less, and the edges routed in the gaps between.

import { Canvas, DOWN, RIGHT, UP, LEFT, textWidth } from './canvas'
import type { Rows, Stroke } from './canvas'

export type Shape = 'rect' | 'round' | 'diamond' | 'class'
export type Head = 'arrow' | 'cross' | 'circle' | 'hollow' | 'diamond' | 'open-diamond' | 'none'
export type Direction = 'TD' | 'BT' | 'LR' | 'RL'

/** In a class box's lines, the rule between its name and its members. */
export const DIVIDER = '\0'

export type FlowNode = { id: string; lines: string[]; shape: Shape }
/** An edge; `tail` is the head drawn where it leaves, as a class diagram's `<|--` asks. */
export type FlowEdge = { from: string; to: string; label: string; stroke: Stroke; head: Head; isBoth: boolean; tail?: Head }
export type Flowchart = { direction: Direction; nodes: FlowNode[]; edges: FlowEdge[] }

const HEADER = /^(?:flowchart|graph)(?:\s+(TD|TB|BT|LR|RL))?\s*;?\s*$/i
const SKIPPED = /^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr|end)\b/
const ID = /^[\p{L}\p{N}_]+/u
// Openers longest first, so `((` is not read as `(`.
const SHAPES: ReadonlyArray<readonly [string, string, Shape]> = [
  ['(((', ')))', 'round'], ['((', '))', 'round'], ['([', '])', 'round'], ['[(', ')]', 'round'],
  ['[[', ']]', 'rect'], ['{{', '}}', 'diamond'], ['[/', '/]', 'rect'], ['[\\', '\\]', 'rect'],
  ['[/', '\\]', 'rect'], ['[\\', '/]', 'rect'], ['>', ']', 'rect'],
  ['[', ']', 'rect'], ['(', ')', 'round'], ['{', '}', 'diamond'],
]
const LINK = /^([<xo])?(-{2,}|={2,}|-\.+-|~~~)([>xo])?(?![\p{L}\p{N}_])|^([<xo])?(-{2,}|={2,}|-\.+-)([>])/u
const TEXT_OPEN = /^([<xo])?(--|==|-\.)\s+/
const TEXT_CLOSE = /\s(-{2,}[>xo]|-{3,}|={2,}[>xo]|={3,}|\.+-[>xo]?)(?=\s|[\p{L}\p{N}_"]|$)/u

// A label as written: quotes, markdown strings and entities off; <br> splits it into lines.
function labelLines(raw: string): string[] {
  return raw
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .replace(/^`([\s\S]*)`$/, '$1')
    .replace(/#quot;/g, '"')
    .replace(/#amp;/g, '&')
    .replace(/\*\*|__/g, '')
    .split(/<br\s*\/?>|\\n/i)
    .map(s => s.trim())
}

export function parseFlowchart(source: string): Flowchart | null {
  const lines = source.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  const head = HEADER.exec(lines[0] ?? '')
  if (!head) return null
  const dir = (head[1] ?? 'TD').toUpperCase()
  const direction: Direction = dir === 'TB' ? 'TD' : (dir as Direction)
  const nodes = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []

  const node = (id: string, label?: string[], shape?: Shape) => {
    const known = nodes.get(id)
    if (!known) nodes.set(id, { id, lines: label ?? [id], shape: shape ?? 'rect' })
    else if (label) Object.assign(known, { lines: label, shape })
  }

  for (const raw of lines.slice(1)) {
    for (const statement of raw.split(/;\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
      let s = statement.trim()
      if (!s || SKIPPED.test(s)) continue
      if (/^subgraph\b/.test(s)) continue

      // One group of nodes: `A`, `A[Label]`, `A & B`.
      const group = (): string[] | null => {
        const ids: string[] = []
        for (;;) {
          s = s.trimStart()
          const id = ID.exec(s)
          if (!id) return ids.length ? ids : null
          s = s.slice(id[0].length)
          const shape = SHAPES.find(([open]) => s.startsWith(open))
          if (shape) {
            const [open, close, kind] = shape
            const rest = s.slice(open.length)
            const quoted = /^"[^"]*"/.exec(rest)
            const end = rest.indexOf(close, quoted ? quoted[0].length : 0)
            if (end < 0) return null
            node(id[0], labelLines(rest.slice(0, end)), kind)
            s = rest.slice(end + close.length)
          } else node(id[0])
          ids.push(id[0])
          s = s.replace(/^:::[\w-]+/, '').replace(/^@\{[^}]*\}/, '').trimStart()
          if (!s.startsWith('&')) return ids
          s = s.slice(1)
        }
      }

      // One edge between groups: `-->`, `-.->|label|`, `-- label -->`.
      const link = (): Omit<FlowEdge, 'from' | 'to'> | null => {
        s = s.trimStart()
        let label = ''
        let op: string
        let isBoth = false
        const open = TEXT_OPEN.exec(s)
        const close = open && TEXT_CLOSE.exec(s.slice(open[0].length))
        if (open && close) {
          label = s.slice(open[0].length, open[0].length + close.index).trim()
          op = open[2]! + close[1]!
          isBoth = open[1] === '<'
          s = s.slice(open[0].length + close.index + close[0].length)
        } else {
          const m = LINK.exec(s)
          if (!m) return null
          op = m[0]
          isBoth = (m[1] ?? m[4]) === '<'
          s = s.slice(m[0].length)
          const pipe = /^\s*\|([^|]*)\|/.exec(s)
          if (pipe) {
            label = pipe[1]!
            s = s.slice(pipe[0].length)
          }
        }
        if (op === '~~~') return { label, stroke: 'solid', head: 'none', isBoth: false }
        const end = op[op.length - 1]
        const head: Head = end === '>' ? 'arrow' : end === 'x' ? 'cross' : end === 'o' ? 'circle' : 'none'
        const stroke: Stroke = op.includes('.') ? 'dotted' : op.includes('=') ? 'thick' : 'solid'
        return { label: labelLines(label).join(' '), stroke, head, isBoth }
      }

      let from = group()
      if (!from) continue
      for (;;) {
        const l = link()
        if (!l) break
        const to = group()
        if (!to) break
        for (const a of from) for (const b of to) edges.push({ from: a, to: b, ...l })
        from = to
      }
    }
  }
  return nodes.size ? { direction, nodes: [...nodes.values()], edges } : null
}

const CORNERS: Record<Shape, string> = { rect: '┌┐└┘', round: '╭╮╰╯', diamond: '╱╲╲╱', class: '┌┐└┘' }
const HEADS: Record<'down' | 'up' | 'right' | 'left', Record<Exclude<Head, 'none'>, string>> = {
  down: { arrow: '▼', cross: '×', circle: 'o', hollow: '▽', diamond: '◆', 'open-diamond': '◇' },
  up: { arrow: '▲', cross: '×', circle: 'o', hollow: '△', diamond: '◆', 'open-diamond': '◇' },
  right: { arrow: '▶', cross: '×', circle: 'o', hollow: '▷', diamond: '◆', 'open-diamond': '◇' },
  left: { arrow: '◀', cross: '×', circle: 'o', hollow: '◁', diamond: '◆', 'open-diamond': '◇' },
}

/** Blank cells between neighbours in a layer, across the flow. */
const NODE_GAP = { TD: 3, LR: 1 } as const

type Vertex = { key: string; node?: FlowNode; rank: number; main: number; cross: number; at: number }

// Draws the chart, top-down or left-to-right as it asks; BT and RL lay out against the edges.
export function drawFlowchart(chart: Flowchart, direction: Direction = chart.direction): Rows {
  const isWide = direction === 'LR' || direction === 'RL'
  const isReversed = direction === 'BT' || direction === 'RL'
  const axis = isWide ? 'LR' : 'TD'
  const edges = chart.edges.filter(e => e.from !== e.to)
  const order = new Map(chart.nodes.map((n, i) => [n.id, i]))

  // Lay out along directed edges; edges that close a cycle are turned around for the layout.
  const flows = edges.map(e => (isReversed ? { up: e.to, down: e.from } : { up: e.from, down: e.to }))
  const out = new Map<string, number[]>()
  flows.forEach((f, i) => out.set(f.up, [...(out.get(f.up) ?? []), i]))
  const state = new Map<string, 1 | 2>()
  const visit = (id: string) => {
    state.set(id, 1)
    for (const i of out.get(id) ?? []) {
      const f = flows[i]!
      const seen = state.get(f.down)
      if (seen === 1) flows[i] = { up: f.down, down: f.up }
      else if (!seen) visit(f.down)
    }
    state.set(id, 2)
  }
  const roots = chart.nodes.filter(n => !flows.some(f => f.down === n.id))
  for (const n of [...roots, ...chart.nodes]) if (!state.has(n.id)) visit(n.id)

  // Longest path from the sources gives each node its layer.
  const rank = new Map(chart.nodes.map(n => [n.id, 0]))
  for (let pass = 0; pass < chart.nodes.length; pass++) {
    let isMoved = false
    for (const f of flows) {
      if (rank.get(f.down)! < rank.get(f.up)! + 1) {
        rank.set(f.down, rank.get(f.up)! + 1)
        isMoved = true
      }
    }
    if (!isMoved) break
  }

  const vertices = new Map<string, Vertex>()
  for (const n of chart.nodes) vertices.set(n.id, { key: n.id, node: n, rank: rank.get(n.id)!, main: 0, cross: 0, at: order.get(n.id)! })
  // Each edge as its chain of vertices, one per layer, stand-ins between.
  const chains = flows.map((f, i) => {
    const chain = [f.up]
    for (let r = rank.get(f.up)! + 1; r < rank.get(f.down)!; r++) {
      const key = `\0${i}:${r}`
      vertices.set(key, { key, rank: r, main: 0, cross: 0, at: order.get(f.up)! + 0.5 })
      chain.push(key)
    }
    chain.push(f.down)
    return chain
  })

  const layerCount = Math.max(...[...vertices.values()].map(v => v.rank)) + 1
  const layers: Vertex[][] = Array.from({ length: layerCount }, () => [])
  for (const v of vertices.values()) layers[v.rank]!.push(v)
  for (const layer of layers) layer.sort((a, b) => a.at - b.at)

  const ups = new Map<string, string[]>()
  const downs = new Map<string, string[]>()
  for (const chain of chains) {
    for (let k = 1; k < chain.length; k++) {
      ups.set(chain[k]!, [...(ups.get(chain[k]!) ?? []), chain[k - 1]!])
      downs.set(chain[k - 1]!, [...(downs.get(chain[k - 1]!) ?? []), chain[k]!])
    }
  }

  // Fewer crossings: sort each layer by where its neighbours sit, down then up, a few times.
  const reorder = (layer: Vertex[], near: Map<string, string[]>) => {
    const score = new Map<string, number>()
    layer.forEach((v, i) => {
      const ns = (near.get(v.key) ?? []).map(k => vertices.get(k)!.at)
      score.set(v.key, ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : i)
    })
    layer.sort((a, b) => score.get(a.key)! - score.get(b.key)!)
    layer.forEach((v, i) => (v.at = i))
  }
  layers.forEach(layer => layer.forEach((v, i) => (v.at = i)))
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let r = 1; r < layerCount; r++) reorder(layers[r]!, ups)
    for (let r = layerCount - 2; r >= 0; r--) reorder(layers[r]!, downs)
  }

  const boxWidth = (n: FlowNode) => Math.max(...n.lines.map(textWidth)) + 4
  const boxHeight = (n: FlowNode) => n.lines.length + 2
  const mainSize = (v: Vertex) => (v.node ? (isWide ? boxWidth(v.node) : boxHeight(v.node)) : 1)
  const crossSize = (v: Vertex) => (v.node ? (isWide ? boxHeight(v.node) : boxWidth(v.node)) : 1)
  const centre = (v: Vertex) => v.cross + Math.floor((crossSize(v) - 1) / 2)

  // Across the flow: each node toward the middle of its neighbours, in order, never overlapping.
  const place = (layer: Vertex[], near?: Map<string, string[]>) => {
    let next = 0
    for (const v of layer) {
      const ns = near ? (near.get(v.key) ?? []).map(k => vertices.get(k)!) : []
      const want = ns.length ? Math.round(ns.reduce((a, n) => a + centre(n), 0) / ns.length) - Math.floor((crossSize(v) - 1) / 2) : next
      v.cross = Math.max(next, want)
      next = v.cross + crossSize(v) + NODE_GAP[axis]
    }
  }
  layers.forEach(layer => place(layer))
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let r = 1; r < layerCount; r++) place(layers[r]!, ups)
    for (let r = layerCount - 2; r >= 0; r--) place(layers[r]!, downs)
  }
  for (let r = 1; r < layerCount; r++) place(layers[r]!, ups)
  const left = Math.min(...[...vertices.values()].map(v => v.cross))
  for (const v of vertices.values()) v.cross -= left

  // Along the flow: each layer as deep as its biggest box; each gap has room for its tracks.
  const extent = layers.map(layer => Math.max(1, ...layer.map(mainSize)))
  const labels = edges.map(e => e.label)
  const gaps: { tracks: Map<string, number>; trackCount: number; labelRoom: number }[] = []
  for (let r = 0; r < layerCount - 1; r++) {
    // Edges fanning out of one vertex share a track, as do edges fanning into one; others get
    // their own where their spans meet.
    const bent: { a: Vertex; b: Vertex; lo: number; hi: number }[] = []
    let labelWidth = 0
    chains.forEach((chain, i) => {
      for (let k = 1; k < chain.length; k++) {
        const a = vertices.get(chain[k - 1]!)!
        const b = vertices.get(chain[k]!)!
        if (a.rank !== r) continue
        if (k === chain.length - 1 && labels[i]) labelWidth = Math.max(labelWidth, textWidth(labels[i]!))
        const [ca, cb] = [centre(a), centre(b)]
        if (ca !== cb) bent.push({ a, b, lo: Math.min(ca, cb), hi: Math.max(ca, cb) })
      }
    })
    const fanOut = (a: Vertex) => bent.filter(s => s.a === a).length
    const groups = new Map<string, { keys: string[]; lo: number; hi: number }>()
    for (const { a, b, lo, hi } of bent) {
      const group = fanOut(a) > 1 ? `>${a.key}` : `<${b.key}`
      const g = groups.get(group) ?? { keys: [], lo, hi }
      groups.set(group, { keys: [...g.keys, `${a.key}>${b.key}`], lo: Math.min(g.lo, lo), hi: Math.max(g.hi, hi) })
    }
    const tracks = new Map<string, number>()
    const taken: [number, number][][] = []
    for (const { keys, lo, hi } of [...groups.values()].sort((a, b) => a.lo - b.lo)) {
      let t = taken.findIndex(spansOnTrack => spansOnTrack.every(([a, b]) => hi < a - 1 || lo > b + 1))
      if (t < 0) t = taken.push([]) - 1
      taken[t]!.push([lo, hi])
      for (const key of keys) tracks.set(key, t)
    }
    gaps.push({ tracks, trackCount: taken.length, labelRoom: labelWidth ? (isWide ? labelWidth + 4 : 1) : 0 })
  }
  const starts: number[] = []
  let main = 0
  for (let r = 0; r < layerCount; r++) {
    starts.push(main)
    main += extent[r]!
    if (r < layerCount - 1) main += 2 + gaps[r]!.trackCount + gaps[r]!.labelRoom
  }
  for (const v of vertices.values()) v.main = starts[v.rank]!

  const crossEnd = Math.max(...[...vertices.values()].map(v => v.cross + crossSize(v)))
  const labelSpill = isWide ? 0 : Math.max(0, ...labels.map(textWidth)) + 2
  const canvas = isWide ? new Canvas(main, crossEnd) : new Canvas(crossEnd + labelSpill, main)
  const xy = (m: number, c: number): [number, number] => (isWide ? [m, c] : [c, m])

  // Edges first, so boxes and labels sit over them.
  const ends: { at: [number, number]; head: Head; facing: 'down' | 'up' | 'right' | 'left' }[] = []
  const openings: [number, number, string][] = []
  const labelSpots: { at: [number, number]; text: string; isOnLine: boolean }[] = []
  chains.forEach((chain, i) => {
    const e = edges[i]!
    const points: [number, number][] = []
    for (let k = 1; k < chain.length; k++) {
      const a = vertices.get(chain[k - 1]!)!
      const b = vertices.get(chain[k]!)!
      const gap = gaps[a.rank]!
      const exit = a.node ? a.main + mainSize(a) : a.main
      const gapStart = a.main + extent[a.rank]!
      const track = gapStart + 1 + (gap.tracks.get(`${a.key}>${b.key}`) ?? 0)
      const arrive = b.main - 1
      if (k === 1) points.push(xy(exit, centre(a)))
      points.push(xy(track, centre(a)), xy(track, centre(b)), xy(arrive, centre(b)))
      if (!b.node) points.push(xy(b.main + extent[b.rank]! - 1, centre(b)))
      if (k === chain.length - 1 && labels[i]) {
        const labelAt = isWide ? xy(gapStart + 1 + gap.trackCount + 1, centre(b)) : xy(arrive - 1, centre(b) + 2)
        labelSpots.push({ at: labelAt, text: isWide ? ` ${labels[i]} ` : labels[i]!, isOnLine: isWide })
      }
    }
    canvas.path(points, e.stroke)
    const first = points[0]!
    const last = points[points.length - 1]!
    const towardUpper = isWide ? 'left' : 'up'
    const towardLower = isWide ? 'right' : 'down'
    const lowerIsTarget = flows[i]!.down === e.to
    const [bx, by] = lowerIsTarget ? first : last
    if (isWide) openings.push(lowerIsTarget ? [bx - 1, by, '├'] : [bx + 1, by, '┤'])
    else openings.push(lowerIsTarget ? [bx, by - 1, '┬'] : [bx, by + 1, '┴'])
    if (e.head !== 'none') ends.push({ at: lowerIsTarget ? last : first, head: e.head, facing: lowerIsTarget ? towardLower : towardUpper })
    const tail = e.tail ?? (e.isBoth ? e.head : 'none')
    if (tail !== 'none') ends.push({ at: lowerIsTarget ? first : last, head: tail, facing: lowerIsTarget ? towardUpper : towardLower })
    // The first cell under a box joins its border.
    if (!isWide) canvas.link(first[0], first[1], UP)
    else canvas.link(first[0], first[1], LEFT)
    if (!isWide) canvas.link(last[0], last[1], DOWN)
    else canvas.link(last[0], last[1], RIGHT)
  })

  for (const v of vertices.values()) {
    if (!v.node) continue
    const [x, y] = xy(v.main, v.cross)
    const w = boxWidth(v.node)
    const h = boxHeight(v.node)
    canvas.box(x, y, w, h, CORNERS[v.node.shape])
    // A class box: its name centred, a rule under it, its members from the left.
    const firstRule = v.node.shape === 'class' ? v.node.lines.indexOf(DIVIDER) : -1
    v.node.lines.forEach((line, j) => {
      if (line === DIVIDER) canvas.text(x, y + 1 + j, `├${'─'.repeat(w - 2)}┤`, 'box')
      else if (firstRule >= 0 && j > firstRule) canvas.text(x + 2, y + 1 + j, line, 'label')
      else canvas.text(x + Math.floor((w - textWidth(line)) / 2), y + 1 + j, line, 'label')
    })
  }
  // Where an edge leaves its source, the border opens onto it, unless an arrow lands there.
  const isLanding = (x: number, y: number) => ends.some(({ at }) => Math.abs(at[0] - x) + Math.abs(at[1] - y) === 1)
  for (const [x, y, ch] of openings) if (!isLanding(x, y)) canvas.put(x, y, ch, 'box')

  for (const end of ends) canvas.put(end.at[0], end.at[1], HEADS[end.facing][end.head as Exclude<Head, 'none'>], 'arrow')
  for (const spot of labelSpots) {
    if (spot.isOnLine) canvas.text(spot.at[0], spot.at[1], spot.text, 'note')
    else canvas.text(spot.at[0], spot.at[1], spot.text, 'note', true)
  }
  return canvas.rows()
}
