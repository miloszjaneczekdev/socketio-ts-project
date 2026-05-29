import React, { memo, useMemo, useRef, useCallback, useEffect } from 'react'

const DEFAULT_PALETTE = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#22C55E', '#F43F5E']

const FlowGraphOverlay = memo(function FlowGraphOverlay({
  containerRef,
  canEdit = false,
  palette,
  edgeColors,
  colorResolver,

  // SYNC:
  playerIds,
  mapping,        // playerId -> playerId
  sidesByFrom,    // playerId -> { fromSide, toSide }
  onCommit,       // (host) wyślij nowy mapping + sides
}: {
  containerRef: React.RefObject<HTMLElement | null>
  canEdit?: boolean
  palette?: string[]
  edgeColors?: Record<string, string>
  colorResolver?: (edge: {
    id: string
    from: string
    to: string
    fromSide: 'left' | 'right'
    toSide: 'left' | 'right'
  }, index: number) => string

  playerIds: string[]
  mapping: Record<string, string>
  sidesByFrom?: Record<string, { fromSide: 'left' | 'right'; toSide: 'left' | 'right' }>
  onCommit?: (next: {
    mapping: Record<string, string>,
    sidesByFrom: Record<string, { fromSide: 'left' | 'right'; toSide: 'left' | 'right' }>
  }) => void
}) {
  const mappingKey = useMemo(() => JSON.stringify(mapping), [mapping])
  const sidesByFromKey = useMemo(() => JSON.stringify(sidesByFrom ?? {}), [sidesByFrom])
  const playerIdsKey = useMemo(() => playerIds.join(','), [playerIds])

  type NodeT = { id: string; el: HTMLElement; cx: number; cy: number; w: number; h: number }
  type SideT = 'left' | 'right'
  type SidesT = { fromSide: SideT; toSide: SideT }
  type EdgeT = { id: string; from: string; to: string; fromSide: SideT; toSide: SideT }
  type DragT = { edgeId: string; type: 'from' | 'to'; x: number; y: number } | null

  // ===== progi snapu =====
  const SNAP_PREVIEW = 84
  const SNAP_COMMIT  = 84
  const CENTER_PULL  = 120

  // ===== refs =====
  const svgARef = useRef<SVGSVGElement | null>(null)
  const svgBRef = useRef<SVGSVGElement | null>(null)
  const gEdgesRef = useRef<SVGGElement | null>(null)
  const gPlaceRef = useRef<SVGGElement | null>(null)
  const gDotsRef = useRef<SVGGElement | null>(null)

  const nodesRef = useRef<NodeT[]>([])
  const edgesRef = useRef<EdgeT[]>([])
  const dragRef = useRef<DragT>(null)
  const redrawRafRef = useRef<number | null>(null)

  // preferencje stron per nodeId: { out, in }
  const sidePrefsRef = useRef<Map<string, { out?: SideT; in?: SideT }>>(new Map())

  // host-lock (brak nadpisu stanem z serwera w trakcie drag/zaraz po)
  const localShadowMapRef = useRef<Record<string, string> | null>(null)
  const ignoreUntilTsRef = useRef<number>(0)
  const isHostLockActive = useCallback(() => {
    if (!canEdit) return false
    const now = Date.now()
    const hasShadow = !!localShadowMapRef.current
    const stillLocked = now < ignoreUntilTsRef.current
    const shadowDiffers =
      hasShadow && mappingKey !== JSON.stringify(localShadowMapRef.current)
    return (stillLocked || !!dragRef.current) && shadowDiffers
  }, [canEdit, mappingKey])

  // ===== helpers: mapowania nX <-> playerId (kolejność .box === playerIds) =====
  const nodeIdToPlayerId = useCallback((nid: string): string | undefined => {
    const m = /^n(\d+)$/.exec(nid)
    const i = m ? Number(m[1]) : -1
    return i >= 0 && i < playerIds.length ? playerIds[i] : undefined
  }, [playerIds])

  const playerIdToNodeId = useCallback((pid: string): string | undefined => {
    const i = playerIds.indexOf(pid)
    return i >= 0 ? `n${i}` : undefined
  }, [playerIds])

  // ===== geometria =====
  const layoutNodes = useCallback(() => {
    const container = containerRef.current
    if (!container) { nodesRef.current = []; return [] }
    const boxes = Array.from(container.querySelectorAll(`[data-fg-id]`)) as HTMLElement[]
    const cRect = container.getBoundingClientRect()
    const nodes: NodeT[] = boxes.map((el, i) => {
      const r = el.getBoundingClientRect()
      return { id: `n${i}`, el, cx: r.left - cRect.left + r.width / 2, cy: r.top - cRect.top + r.height / 2, w: r.width, h: r.height }
    })
    nodesRef.current = nodes
    return nodes
  }, [containerRef])

  const anchor = (n: NodeT, side: SideT) =>
    side === 'right' ? { x: n.cx + n.w / 2, y: n.cy } : { x: n.cx - n.w / 2, y: n.cy }
  const dirFor = (s: SideT) => (s === 'right' ? { x: 1, y: 0 } : { x: -1, y: 0 })
  const opposite = (s: SideT): SideT => (s === 'left' ? 'right' : 'left')

  // ===== utils =====
  function edgesToMap(edges: EdgeT[]): Map<string, string> {
    const m = new Map<string, string>()
    for (const e of edges) m.set(e.from, e.to)
    return m
  }

  // Losowy derangement (fallback lokalny)
  function randomDerangement(ids: string[]): Map<string, string> {
    if (ids.length < 2) return new Map()
    const to = ids.slice()
    for (let i = to.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[to[i], to[j]] = [to[j], to[i]]
    }
    for (let i = 0; i < ids.length; i++) {
      if (to[i] === ids[i]) {
        const j = (i + 1) % ids.length
        ;[to[i], to[j]] = [to[j], to[i]]
      }
    }
    for (let i = 0; i < ids.length; i++) if (to[i] === ids[i]) {
      for (let k = 0; k < ids.length; k++) if (k !== i && to[k] !== ids[i] && to[i] !== ids[k]) {
        ;[to[i], to[k]] = [to[k], to[i]]
        break
      }
    }
    const m = new Map<string, string>()
    ids.forEach((from, i) => m.set(from, to[i]!))
    return m
  }

  function rewireSingleEdge(
    ids: string[],
    base: Map<string, string>,
    fixedFrom: string,
    fixedTo: string
  ): Map<string, string> {
    const out = new Map(base)
    if (fixedFrom === fixedTo) return out
    const prevTo = out.get(fixedFrom)
    if (prevTo === fixedTo) return out

    let ownerOfFixedTo: string | undefined
    for (const f of ids) {
      if (out.get(f) === fixedTo) { ownerOfFixedTo = f; break }
    }
    out.set(fixedFrom, fixedTo)
    if (ownerOfFixedTo && ownerOfFixedTo !== fixedFrom) {
      out.set(ownerOfFixedTo, prevTo!)
      if (out.get(ownerOfFixedTo) === ownerOfFixedTo) {
        for (const g of ids) {
          if (g === ownerOfFixedTo || g === fixedFrom) continue
          if (out.get(g)! !== ownerOfFixedTo && out.get(g)! !== g) {
            const tmp = out.get(ownerOfFixedTo)!
            out.set(ownerOfFixedTo, (out.get(g)!))
            out.set(g, tmp)
            break
          }
        }
      }
    }
    for (const f of ids) {
      if (out.get(f) === f) {
        const g = ids.find(x => x !== f && out.get(x) !== f)!
        const tg = out.get(g)!, tf = out.get(f)!
        out.set(f, tg); out.set(g, tf)
      }
    }
    return out
  }

  function sideGuess(from?: NodeT, to?: NodeT): SidesT {
    if (!from || !to) return { fromSide: 'right', toSide: 'left' }
    const fs: SideT = to.cx >= from.cx ? 'right' : 'left'
    return { fromSide: fs, toSide: fs === 'right' ? 'left' : 'right' }
  }

  function normalizeNodeSidesAll(
    edges: EdgeT[],
    locks?: Array<{ nodeId: string; lockIn?: SideT; lockOut?: SideT }>
  ) {
    const lockBy = new Map<string, { lockIn?: SideT; lockOut?: SideT }>()
    locks?.forEach(l => lockBy.set(l.nodeId, l))
    const nodes = nodesRef.current

    for (const n of nodes) {
      const inIdx = edges.findIndex(e => e.to === n.id)
      const outIdx = edges.findIndex(e => e.from === n.id)
      if (inIdx < 0 || outIdx < 0) continue
      const eIn = edges[inIdx]
      const eOut = edges[outIdx]
      const lock = lockBy.get(n.id)

      if (lock?.lockIn) eIn.toSide = lock.lockIn
      if (lock?.lockOut) eOut.fromSide = lock.lockOut

      if (eIn.toSide === eOut.fromSide) {
        const guess = sideGuess(nodes.find(x => x.id === n.id), nodes.find(x => x.id === eOut.to)).fromSide
        if (!lock?.lockOut) eOut.fromSide = guess
        if (eIn.toSide === eOut.fromSide) {
          if (!lock?.lockIn) eIn.toSide = opposite(eOut.fromSide)
          else if (!lock?.lockOut) eOut.fromSide = opposite(eIn.toSide)
        }
      }
    }
  }

  // seed preferencji stron danymi z serwera
  useEffect(() => {
    if (!sidesByFrom) return
    const m = sidePrefsRef.current
    for (const [fromPid, sides] of Object.entries(sidesByFrom)) {
      const fromNid = playerIdToNodeId(fromPid)
      const toPid = mapping[fromPid]
      const toNid = toPid ? playerIdToNodeId(toPid) : undefined
      if (fromNid) {
        const prev = m.get(fromNid) || {}
        m.set(fromNid, { ...prev, out: sides.fromSide })
      }
      if (toNid) {
        const prevT = m.get(toNid) || {}
        m.set(toNid, { ...prevT, in: sides.toSide })
      }
    }
    // po zasileniu — przerysuj
    layoutNodes(); ensureEdges(); render()
  }, [sidesByFromKey, mappingKey, playerIdsKey])

  // ===== budowa krawędzi (z mappingu serwera + preferencje stron) =====
  const ensureEdges = useCallback(() => {
    const nodes = nodesRef.current
    const ids = nodes.map(n => n.id)
    if (ids.length < 2) { edgesRef.current = []; return }

    const haveFullServerMap =
      playerIds.length === ids.length &&
      playerIds.every(fromPid => {
        const toPid = mapping?.[fromPid]
        return !!toPid && playerIds.includes(toPid)
      })

    const mapNode = new Map(nodes.map(n => [n.id, n]))

    const pickSides = (fromNid: string, toNid: string): SidesT => {
      const prefFrom = sidePrefsRef.current.get(fromNid)?.out
      const prefTo   = sidePrefsRef.current.get(toNid)?.in
      if (prefFrom && prefTo) return { fromSide: prefFrom, toSide: prefTo }
      if (prefFrom) return { fromSide: prefFrom, toSide: prefFrom === 'right' ? 'left' : 'right' }
      if (prefTo)   return { fromSide: (prefTo === 'left' ? 'right' : 'left'), toSide: prefTo }
      return sideGuess(mapNode.get(fromNid), mapNode.get(toNid))
    }

    if (haveFullServerMap) {
      const fresh: EdgeT[] = ids.map((fromNid, i) => {
        const fromPid = nodeIdToPlayerId(fromNid)!
        const toPid = mapping[fromPid]!
        const toNid = playerIdToNodeId(toPid)!
        const s = pickSides(fromNid, toNid)
        return { id: `e${i}`, from: fromNid, to: toNid, fromSide: s.fromSide, toSide: s.toSide }
      })
      normalizeNodeSidesAll(fresh)
      edgesRef.current = fresh
    } else {
      const m = randomDerangement(ids)
      const fresh: EdgeT[] = ids.map((from, i) => {
        const to = m.get(from)!
        const s = pickSides(from, to)
        return { id: `e${i}`, from, to, fromSide: s.fromSide, toSide: s.toSide }
      })
      normalizeNodeSidesAll(fresh)
      edgesRef.current = fresh
    }
  }, [playerIds, mapping, nodeIdToPlayerId, playerIdToNodeId])

  // ===== ID STABILIZACJA — żeby poruszał się tylko złapany koniec =====
  function makeIdPlan(
    _ids: string[],
    baseEdges: EdgeT[],
    _mapping: Map<string, string>,
    drag: DragT,
    fixedFromForDragFrom?: string
  ): Map<string, string> {
    const baseIdByFrom = new Map<string, string>()
    for (const e of baseEdges) baseIdByFrom.set(e.from, e.id)

    if (drag && drag.type === 'from' && fixedFromForDragFrom) {
      const dragged = baseEdges.find(e => e.id === drag.edgeId)
      const oldFrom = dragged?.from
      const newFrom = fixedFromForDragFrom
      if (dragged && oldFrom) {
        const draggedId = dragged.id
        const newPrevId = baseIdByFrom.get(newFrom)
        baseIdByFrom.set(newFrom, draggedId)
        if (oldFrom !== newFrom) {
          baseIdByFrom.set(oldFrom, newPrevId ?? `e_${oldFrom}`)
        }
      }
    }
    return baseIdByFrom
  }

  // ===== inteligentny wybór celu (anchor albo centrum) =====
  function nearestAnchorSmart(x: number, y: number, draggingEdge?: EdgeT, which?: 'from' | 'to') {
    const nodes = nodesRef.current
    let bestAnchor: { node: NodeT; side: SideT; d: number } | null = null

    // 1) najbliższy anchor
    for (const n of nodes) for (const s of ['left', 'right'] as SideT[]) {
      const p = anchor(n, s); const d = Math.hypot(p.x - x, p.y - y)
      if (!bestAnchor || d < bestAnchor.d) bestAnchor = { node: n, side: s, d }
    }

    // 2) najbliższe centrum
    let bestCenter: { node: NodeT; d: number } | null = null
    for (const n of nodes) {
      const d = Math.hypot(n.cx - x, n.cy - y)
      if (!bestCenter || d < bestCenter.d) bestCenter = { node: n, d }
    }

    // reguły wyboru
    if (bestAnchor && bestAnchor.d <= SNAP_PREVIEW) return bestAnchor
    if (bestCenter && bestCenter.d <= CENTER_PULL) {
      let otherNode: NodeT | undefined
      if (draggingEdge) {
        if (which === 'to') otherNode = nodes.find(n => n.id === draggingEdge.from)
        else otherNode = nodes.find(n => n.id === draggingEdge.to)
      }
      const sGuess = sideGuess(otherNode, bestCenter.node)
      return { node: bestCenter.node, side: which === 'to' ? sGuess.toSide : sGuess.fromSide, d: bestCenter.d }
    }
    return bestAnchor
  }

  // ===== PREVIEW – lokalne przepięcie, stabilne ID, bez self-loopów =====
  function previewEdges(): EdgeT[] {
    const drag = dragRef.current
    if (!drag) return edgesRef.current

    const nodes = nodesRef.current
    if (nodes.length < 2) return edgesRef.current

    const base = edgesRef.current
    const idx = base.findIndex(e => e.id === drag.edgeId)
    if (idx < 0) return base
    const edge = base[idx]

    const best = nearestAnchorSmart(drag.x, drag.y, edge, drag.type)
    if (!best || best.d > SNAP_PREVIEW) return edgesRef.current

    const ids = nodes.map(n => n.id)
    const keep = edgesToMap(base)

    // self-loop blokada
    const fixedFrom = drag.type === 'to' ? edge.from : best.node.id
    const fixedTo   = drag.type === 'to' ? best.node.id : edge.to
    if (fixedFrom === fixedTo) return base

    const mappingNode = rewireSingleEdge(ids, keep, fixedFrom, fixedTo)

    // STABILIZACJA ID
    const idPlan = makeIdPlan(ids, base, mappingNode, drag, drag.type === 'from' ? fixedFrom : undefined)

    const byId = new Map(nodes.map(n => [n.id, n]))
    const next: EdgeT[] = ids.map((from) => {
      const to = mappingNode.get(from)!
      // dobór stron: preferencje jeśli istnieją, inaczej heurystyka
      const prefFrom = sidePrefsRef.current.get(from)?.out
      const prefTo   = sidePrefsRef.current.get(to)?.in
      const sides: SidesT =
        prefFrom && prefTo
          ? { fromSide: prefFrom, toSide: prefTo }
          : prefFrom
            ? { fromSide: prefFrom, toSide: prefFrom === 'right' ? 'left' : 'right' }
            : prefTo
              ? { fromSide: (prefTo === 'left' ? 'right' : 'left'), toSide: prefTo }
              : sideGuess(byId.get(from)!, byId.get(to)!)

      const id = idPlan.get(from) ?? `e_${from}`
      const eObj: EdgeT = { id, from, to, fromSide: sides.fromSide, toSide: sides.toSide }
      return eObj
    })

    const locks =
      drag.type === 'to'
        ? [{ nodeId: fixedTo, lockIn: best.side as SideT }]
        : [{ nodeId: fixedFrom, lockOut: best.side as SideT }]

    normalizeNodeSidesAll(next, locks)
    return next
  }

  // ===== kolory =====
  const colorForEdge = useCallback((edge: EdgeT, idx: number) => {
    if (edgeColors && edgeColors[edge.id]) return edgeColors[edge.id]
    if (colorResolver) return colorResolver(edge, idx)
    const pal = (palette && palette.length ? palette : DEFAULT_PALETTE)
    return pal[idx % pal.length]
  }, [edgeColors, colorResolver, palette])

  // ===== render =====
  const render = useCallback(() => {
    const svgA = svgARef.current, svgB = svgBRef.current
    const gE = gEdgesRef.current, gP = gPlaceRef.current, gD = gDotsRef.current
    const nodes = nodesRef.current

    // wybierz źródło krawędzi: podgląd albo stan
    const edges = dragRef.current ? previewEdges() : edgesRef.current

    if (!svgA || !svgB || !gE || !gP || !gD || nodes.length < 2 || edges.length < 1) {
      if (gE) gE.innerHTML = ''; if (gP) gP.innerHTML = ''; if (gD) gD.innerHTML = ''
      return
    }
    gE.innerHTML = ''; gP.innerHTML = ''; gD.innerHTML = ''

    const byId = new Map(nodes.map(n => [n.id, n]))

    const pathEl = (d: string, a: Record<string, string>) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      el.setAttribute('d', d); for (const [k, v] of Object.entries(a)) el.setAttribute(k, v); return el
    }
    const circleEl = (x: number, y: number, r = 7) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      el.setAttribute('cx', String(x)); el.setAttribute('cy', String(y)); el.setAttribute('r', String(r)); return el
    }

    // placeholdery — wizualizacja zajętości
    for (const n of nodes) for (const s of ['left', 'right'] as SideT[]) {
      const p = anchor(n, s)
      const c = circleEl(p.x, p.y, 6)
      c.setAttribute('fill', 'none')
      c.setAttribute('stroke', '#9CA3AF')
      c.setAttribute('stroke-dasharray', '2,3')
      c.setAttribute('stroke-width', '2')
      c.setAttribute('pointer-events', 'none')
      gP.appendChild(c)
    }

    edges.forEach((e, i) => {
      const A = byId.get(e.from), B = byId.get(e.to)
      if (!A || !B) return

      const dragging = dragRef.current && dragRef.current.edgeId === e.id ? dragRef.current : null
      const pFrom = dragging && dragging.type === 'from' ? { x: dragging.x, y: dragging.y } : anchor(A, e.fromSide)
      const pTo = dragging && dragging.type === 'to' ? { x: dragging.x, y: dragging.y } : anchor(B, e.toSide)

      // krzywa Béziera
      const n1 = dirFor(e.fromSide), n2 = dirFor(e.toSide)
      const dx = pTo.x - pFrom.x, dy = pTo.y - pFrom.y
      const dist = Math.max(40, Math.hypot(dx, dy))
      const k = Math.max(80, dist * 0.45), tweak = dy * 0.25
      const c1 = { x: pFrom.x + n1.x * k, y: pFrom.y + n1.y * k + tweak }
      const c2 = { x: pTo.x + n2.x * k, y: pTo.y + n2.y * k - tweak }
      const d = `M ${pFrom.x} ${pFrom.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${pTo.x} ${pTo.y}`

      const strokeColor = colorForEdge(e, i)
      const isActiveEdge = !!dragging
      const filterAttr =
        dragRef.current
          ? (isActiveEdge ? 'url(#fgLineShadowStrong)' : 'url(#fgLineShadowSoft)')
          : (canEdit ? 'url(#fgLineShadowSoft)' : undefined)

      const path = pathEl(d, {
        fill: 'none',
        stroke: strokeColor,
        'stroke-width': isActiveEdge ? '4' : '3',
        'stroke-linecap': 'round',
        'marker-end': 'url(#fgArrow)',
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
        ...(filterAttr ? { filter: filterAttr } : {}),
      })
      gE.appendChild(path)

      const makeDot = (pt: { x: number; y: number }, which: 'from' | 'to') => {
        const c = circleEl(pt.x, pt.y, 7)
        c.setAttribute('fill', '#FFF')
        c.setAttribute('stroke', strokeColor)
        c.setAttribute('stroke-width', '2')
        c.setAttribute('pointer-events', canEdit ? 'auto' : 'none')
        ;(c as any).style.cursor = canEdit ? 'grab' : 'default'
        ;(c as any).style.touchAction = 'none'
        c.addEventListener('pointerdown', (ev) => {
          if (!canEdit) return
          const pe = ev as PointerEvent
          pe.preventDefault(); pe.stopPropagation()
          try { (pe.target as Element).setPointerCapture?.(pe.pointerId) } catch { }
          const cr = containerRef.current!.getBoundingClientRect()
          dragRef.current = { edgeId: e.id, type: which, x: pe.clientX - cr.left, y: pe.clientY - cr.top }
          ignoreUntilTsRef.current = Date.now() + 1500
          render()
        })
        gD.appendChild(c)
      }
      makeDot(pFrom, 'from'); makeDot(pTo, 'to')
    })
  }, [containerRef, canEdit, colorForEdge])

  // ===== pointer =====
  useEffect(() => {
    if (!canEdit) return
    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current, c = containerRef.current
      if (!drag || !c) return
      const cr = c.getBoundingClientRect()
      dragRef.current = { ...drag, x: ev.clientX - cr.left, y: ev.clientY - cr.top }
      render()
    }
    const onUp = (ev: PointerEvent) => {
      const drag = dragRef.current, c = containerRef.current
      if (!drag || !c) return
      const cr = c.getBoundingClientRect()
      const x = ev.clientX - cr.left, y = ev.clientY - cr.top

      const base = edgesRef.current
      const idx = base.findIndex(e => e.id === drag.edgeId)
      if (idx >= 0) {
        const nodes = nodesRef.current
        const edge = base[idx]
        const best = nearestAnchorSmart(x, y, edge, drag.type)

        if (best && best.d <= SNAP_COMMIT) {
          const ids = nodes.map(n => n.id)
          const keep = edgesToMap(base)

          const fixedFrom = drag.type === 'to' ? edge.from : best.node.id
          const fixedTo   = drag.type === 'to' ? best.node.id : edge.to
          if (fixedFrom !== fixedTo) {
            const mappingNode = rewireSingleEdge(ids, keep, fixedFrom, fixedTo)

            // STABILIZACJA ID także przy commicie
            const idPlan = makeIdPlan(ids, base, mappingNode, drag, drag.type === 'from' ? fixedFrom : undefined)

            const byId = new Map(nodes.map(n => [n.id, n]))
            const next: EdgeT[] = ids.map((from) => {
              const to = mappingNode.get(from)!
              const prefFrom = sidePrefsRef.current.get(from)?.out
              const prefTo   = sidePrefsRef.current.get(to)?.in
              const sides: SidesT =
                prefFrom && prefTo
                  ? { fromSide: prefFrom, toSide: prefTo }
                  : prefFrom
                    ? { fromSide: prefFrom, toSide: prefFrom === 'right' ? 'left' : 'right' }
                    : prefTo
                      ? { fromSide: (prefTo === 'left' ? 'right' : 'left'), toSide: prefTo }
                      : sideGuess(byId.get(from)!, byId.get(to)!)
              const id = idPlan.get(from) ?? `e_${from}`
              return { id, from, to, fromSide: sides.fromSide, toSide: sides.toSide }
            })

            const locks =
              drag.type === 'to'
                ? [{ nodeId: fixedTo, lockIn: best.side as SideT }]
                : [{ nodeId: fixedFrom, lockOut: best.side as SideT }]

            normalizeNodeSidesAll(next, locks)
            edgesRef.current = next

            // zapisz preferencje stron wg stanu po commicie
            for (const e of next) {
              const prevFrom = sidePrefsRef.current.get(e.from) || {}
              sidePrefsRef.current.set(e.from, { ...prevFrom, out: e.fromSide })
              const prevTo = sidePrefsRef.current.get(e.to) || {}
              sidePrefsRef.current.set(e.to, { ...prevTo, in: e.toSide })
            }

            // SYNC: wyślij mapę po playerId
            if (onCommit) {
              const outMap: Record<string, string> = {}
              const outSides: Record<string, { fromSide: SideT; toSide: SideT }> = {}
              for (const e of next) {
                const fromPid = nodeIdToPlayerId(e.from)
                const toPid = nodeIdToPlayerId(e.to)
                if (fromPid && toPid) {
                  outMap[fromPid] = toPid
                  outSides[fromPid] = { fromSide: e.fromSide, toSide: e.toSide }
                }
              }
              localShadowMapRef.current = outMap
              ignoreUntilTsRef.current = Date.now() + 1500
              onCommit({ mapping: outMap, sidesByFrom: outSides })
            }
          }
        }
      }
      dragRef.current = null
      render()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove as any)
      window.removeEventListener('pointerup', onUp as any)
      window.removeEventListener('pointercancel', onUp as any)
    }
  }, [render, canEdit, containerRef, onCommit, nodeIdToPlayerId])

  const recalcAndRender = useCallback(() => {
    layoutNodes()
    if (!isHostLockActive()) {
      ensureEdges()
      normalizeNodeSidesAll(edgesRef.current)
    }
    render()
  }, [layoutNodes, ensureEdges, render, isHostLockActive])

  useEffect(() => {
    const redraw = () => {
      if (redrawRafRef.current !== null) return
      redrawRafRef.current = requestAnimationFrame(() => {
        redrawRafRef.current = null
        recalcAndRender()
      })
    }

    window.addEventListener('resize', redraw, { passive: true })
    document.addEventListener('scroll', redraw as EventListener, { passive: true, capture: true })
    const mo = new MutationObserver(redraw)
    if (containerRef.current) {
      mo.observe(containerRef.current, { childList: true, subtree: true })
    }
    recalcAndRender()
    return () => {
      window.removeEventListener('resize', redraw)
      document.removeEventListener('scroll', redraw as EventListener, true)
      mo.disconnect()
      if (redrawRafRef.current !== null) {
        cancelAnimationFrame(redrawRafRef.current)
        redrawRafRef.current = null
      }
    }
  }, [recalcAndRender, containerRef, palette, edgeColors, colorResolver])

  // reaguj na mapping/playerIds z serwera — ale u hosta szanuj lock
  useEffect(() => {
    layoutNodes()
    if (!isHostLockActive()) {
      if (localShadowMapRef.current &&
          mappingKey === JSON.stringify(localShadowMapRef.current)) {
        localShadowMapRef.current = null
        ignoreUntilTsRef.current = 0
      }
      ensureEdges()
    }
    render()
  }, [mappingKey, playerIdsKey])

  // ===== JSX =====
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none' }} aria-hidden="true">
      <svg ref={svgARef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <marker id="fgArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
          <filter id="fgLineShadowSoft" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000000" floodOpacity="0.22" />
          </filter>
          <filter id="fgLineShadowStrong" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.40" />
          </filter>
        </defs>
        <g ref={gEdgesRef} style={{ pointerEvents: 'none' }} />
        <g ref={gPlaceRef} style={{ pointerEvents: 'none' }} />
      </svg>

      <svg ref={svgBRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <g ref={gDotsRef} style={{ pointerEvents: canEdit ? 'auto' : 'none' }} />
      </svg>
    </div>
  )
})

export default FlowGraphOverlay
