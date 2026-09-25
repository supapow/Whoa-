import type { Keyframe, Layer, Preset, ShadowEffect } from '#/types'
import { uid } from '#/lib/data'
import { scaleVectorPoints, buildSvgPath } from '#/lib/vector'
import { estimateTextBoxSize } from '#/lib/shadows'
import { computeGroupBounds, getDescendantLayers } from '#/lib/groups'

export type ShapeClass = 'wide' | 'square' | 'tall'

export function classifyShape(w: number, h: number): ShapeClass {
  const a = w / Math.max(1, h)
  if (a > 2) return 'wide'
  if (a < 0.5) return 'tall'
  return 'square'
}

/** Same-family when same class, or aspect ratios within 15%. */
export function isSameFamily(sw: number, sh: number, tw: number, th: number): boolean {
  if (classifyShape(sw, sh) === classifyShape(tw, th)) return true
  const sa = sw / Math.max(1, sh)
  const ta = tw / Math.max(1, th)
  return Math.abs(sa - ta) / Math.max(sa, ta) < 0.15
}

function boxesOverlap(a: Layer, b: Layer): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * CTA heuristic v1: a real button layer wins outright (smallest one);
 * otherwise smallest pill/rect shape, or a rect with a text layer
 * overlapping it. Returns the layer id or null.
 */
export function detectCtaId(layers: Layer[]): string | null {
  const buttons = layers.filter((l) => l.type === 'button')
  if (buttons.length > 0) {
    let best = buttons[0]
    for (const b of buttons) {
      if (b.w * b.h < best.w * best.h) best = b
    }
    return best.id
  }
  const shapes = layers.filter(
    (l) => l.type === 'shape' && (l.shape === 'pill' || l.shape === 'rect' || l.shape === 'rectangle'),
  )
  if (shapes.length === 0) return null
  const withText = shapes.filter((s) => layers.some((l) => l.type === 'text' && boxesOverlap(s, l)))
  const pool = withText.length > 0 ? withText : shapes
  let best = pool[0]
  for (const s of pool) {
    if (s.w * s.h < best.w * best.h) best = s
  }
  return best.id
}

function scaleShadow(e: ShadowEffect | undefined, s: number): ShadowEffect | undefined {
  if (!e) return undefined
  return { ...e, x: e.x * s, y: e.y * s, blur: e.blur * s, spread: e.spread * s }
}

interface LayerTransform {
  /** uniform geometric scale applied to sizes */
  s: number
  /** translation applied after scaling source coords */
  dx: number
  dy: number
}

/** Remap a keyframe through a layer's transform (preserves relative motion). */
export function remapKeyframe(kf: Keyframe, t: LayerTransform, fontScale: number): Keyframe {
  return {
    ...kf,
    id: uid(),
    x: Math.round(kf.x * t.s + t.dx),
    y: Math.round(kf.y * t.s + t.dy),
    w: Math.max(1, Math.round(kf.w * t.s)),
    h: Math.max(1, Math.round(kf.h * t.s)),
    fontSize: kf.fontSize !== undefined ? Math.max(1, Math.round(kf.fontSize * fontScale)) : undefined,
    radius: kf.radius !== undefined ? Math.max(0, kf.radius * t.s) : undefined,
    blur: kf.blur !== undefined ? Math.max(0, kf.blur * t.s) : undefined,
    dropShadow: scaleShadow(kf.dropShadow, t.s),
    innerShadow: scaleShadow(kf.innerShadow, t.s),
    points: kf.points ? scaleVectorPoints(kf.points, t.s, t.s) : undefined,
  }
}

function fallbackTextWidth(text: string, fontSize: number): number {
  const longest = (text ?? '').split('\n').reduce((m, line) => Math.max(m, line.length), 0)
  return Math.max(1, longest * fontSize * 0.55)
}

/** Shrink-to-fit a text layer inside maxW (canvas estimator with fallback). */
function autoFitText(layer: Layer, maxW: number, fontScale: number): Layer {
  if (layer.type !== 'text' && layer.type !== 'button') return layer
  const minFloor = 8
  // Never start below the readability floor: an over-wide box at 8px stays
  // legible (and inside the artboard via clamping); a 4px fit does not.
  let fontSize = Math.max(minFloor, Math.round((layer.fontSize ?? 32) * fontScale))
  for (let i = 0; i < 40; i++) {
    const est = estimateTextBoxSize({ ...layer, fontSize })
    const w = est ? est.w : fallbackTextWidth(layer.text ?? '', fontSize)
    if (w <= Math.max(1, maxW) || fontSize <= minFloor) {
      // Buttons keep their background box — only the label shrinks.
      if (layer.type === 'button') return { ...layer, fontSize }
      return { ...layer, fontSize, w: Math.min(layer.w, Math.max(1, maxW)) }
    }
    fontSize -= 1
  }
  return { ...layer, fontSize, w: Math.min(layer.w, Math.max(1, maxW)) }
}

export interface ScaleOptions {
  ctaMinH?: number
  padRatio?: number
}

/**
 * Scale a layer list from sourcePreset to targetPreset.
 * Pure + deterministic: fresh ids, masterId back-pointers, remapped keyframes.
 * Never distorts: non-uniform stretch only for same-family pairs.
 */
export function scaleLayersToPreset(
  sourceLayers: Layer[],
  sourcePreset: Preset,
  targetPreset: Preset,
  opts: ScaleOptions = {},
): Layer[] {
  const sw = sourcePreset.w
  const sh = sourcePreset.h
  const tw = targetPreset.w
  const th = targetPreset.h
  const sx = tw / Math.max(1, sw)
  const sy = th / Math.max(1, sh)
  const s = Math.min(sx, sy)
  const padRatio = opts.padRatio ?? 0.08
  const idMap = new Map<string, string>()
  for (const l of sourceLayers) idMap.set(l.id, uid())

  const cloneWithId = (l: Layer): Layer => ({
    ...l,
    id: idMap.get(l.id)!,
    masterId: l.masterId ?? l.id,
    layoutDetached: false,
    contentDetached: false,
    keyframes: undefined, // re-attached below via remap
    groupId: l.groupId ? (idMap.get(l.groupId) ?? l.groupId) : undefined,
  })

  // ---- same family: proportional map ----
  if (isSameFamily(sw, sh, tw, th)) {
    return sourceLayers.map((l) => {
      const base = cloneWithId(l)
      // Non-uniform only here, and only because aspects are close.
      const nw = Math.max(1, Math.round(l.w * sx))
      const nh = Math.max(1, Math.round(l.h * sy))
      let next: Layer = {
        ...base,
        x: Math.round(l.x * sx),
        y: Math.round(l.y * sy),
        w: nw,
        h: nh,
        radius: l.radius !== undefined ? Math.max(0, l.radius * s) : undefined,
        blur: l.blur !== undefined ? Math.max(0, l.blur * s) : undefined,
        strokeWidth: l.strokeWidth !== undefined ? Math.max(0, l.strokeWidth * s) : undefined,
        dropShadow: scaleShadow(l.dropShadow, s),
        innerShadow: scaleShadow(l.innerShadow, s),
        paddingTop: l.paddingTop !== undefined ? l.paddingTop * s : undefined,
        paddingRight: l.paddingRight !== undefined ? l.paddingRight * s : undefined,
        paddingBottom: l.paddingBottom !== undefined ? l.paddingBottom * s : undefined,
        paddingLeft: l.paddingLeft !== undefined ? l.paddingLeft * s : undefined,
        points: l.points ? scaleVectorPoints(l.points, sx, sy) : undefined,
      }
      if (next.type === 'path' && next.points) {
        next.pathData = buildSvgPath(next.points, next.closed !== false, next.w, next.h)
      }
      if (l.keyframes) {
        // Keyframes stored absolute: scale proportionally (matches base mapping).
        next.keyframes = l.keyframes.map((kf) => ({
          ...kf,
          id: uid(),
          x: Math.round(kf.x * sx),
          y: Math.round(kf.y * sy),
          w: Math.max(1, Math.round(kf.w * sx)),
          h: Math.max(1, Math.round(kf.h * sy)),
          fontSize: kf.fontSize !== undefined ? Math.max(1, Math.round(kf.fontSize * s)) : undefined,
          radius: kf.radius !== undefined ? Math.max(0, kf.radius * s) : undefined,
          blur: kf.blur !== undefined ? Math.max(0, kf.blur * s) : undefined,
          dropShadow: scaleShadow(kf.dropShadow, s),
          innerShadow: scaleShadow(kf.innerShadow, s),
          points: kf.points ? scaleVectorPoints(kf.points, sx, sy) : undefined,
        }))
      }
      next = autoFitText(next, next.w, 1)
      // Centered full-bleed template texts re-center on target width.
      if (l.type === 'text' && l.align === 'center' && l.x === 0 && l.w === sw) {
        next.x = 0
        next.w = tw
      }
      next.x = Math.max(0, Math.min(tw - next.w, next.x))
      next.y = Math.max(0, Math.min(th - next.h, next.y))
      return next
    })
  }

  // ---- cross family: uniform scale + reflow along the long axis ----
  const targetWide = classifyShape(tw, th) === 'wide'
  const u = targetWide ? sy : sx // constrained-axis uniform scale
  const pad = Math.round((targetWide ? th : tw) * padRatio)
  const ctaId = detectCtaId(sourceLayers)
  const ctaMinH = opts.ctaMinH ?? Math.max(20, Math.round(th * 0.3))

  // Pack units: group roots + shapes with overlay-attached texts + standalone
  // layers. A text sitting mostly (≥50% of its area) inside a shape rides
  // with that shape (e.g. a CTA label on its button) instead of becoming
  // its own column. Children of groups move with their group unit.
  const childIds = new Set<string>()
  for (const l of sourceLayers) {
    if (l.type === 'group') {
      for (const d of getDescendantLayers(l.id, sourceLayers)) childIds.add(d.id)
    }
  }
  const topLevel = sourceLayers.filter((l) => !l.groupId && !childIds.has(l.id))

  const areaOf = (l: Layer) => Math.max(1, l.w) * Math.max(1, l.h)
  const overlapArea = (a: Layer, b: Layer) => {
    const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
    return w * h
  }

  // Attach each text to the smallest shape containing ≥50% of its area.
  const attachedTo = new Map<string, string>()
  for (const t of topLevel) {
    if (t.type !== 'text') continue
    let best: Layer | null = null
    for (const s of topLevel) {
      if (s.type !== 'shape' || s.id === t.id) continue
      if (overlapArea(t, s) / areaOf(t) < 0.5) continue
      if (!best || areaOf(s) < areaOf(best)) best = s
    }
    if (best) attachedTo.set(t.id, best.id)
  }

  interface Unit { id: string; members: Layer[]; box: { x: number; y: number; w: number; h: number } }
  const bboxOf = (members: Layer[]) => {
    const x = Math.min(...members.map((m) => m.x))
    const y = Math.min(...members.map((m) => m.y))
    return {
      x,
      y,
      w: Math.max(...members.map((m) => m.x + m.w)) - x,
      h: Math.max(...members.map((m) => m.y + m.h)) - y,
    }
  }
  const units: Unit[] = []
  const consumed = new Set<string>()
  for (const l of topLevel) {
    if (consumed.has(l.id)) continue
    if (l.type === 'group') {
      const members = [l, ...getDescendantLayers(l.id, sourceLayers)]
      members.forEach((m) => consumed.add(m.id))
      units.push({ id: l.id, members, box: computeGroupBounds(l.id, sourceLayers) })
    } else if (l.type === 'shape') {
      const riders = topLevel.filter((t) => attachedTo.get(t.id) === l.id)
      const members = [l, ...riders]
      members.forEach((m) => consumed.add(m.id))
      units.push({ id: l.id, members, box: bboxOf(members) })
    } else if (!attachedTo.has(l.id)) {
      consumed.add(l.id)
      units.push({ id: l.id, members: [l], box: { x: l.x, y: l.y, w: l.w, h: l.h } })
    }
  }
  for (const l of topLevel) {
    if (!consumed.has(l.id)) {
      consumed.add(l.id)
      units.push({ id: l.id, members: [l], box: { x: l.x, y: l.y, w: l.w, h: l.h } })
    }
  }

  const orderedUnits = [...units].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  const ctaUnit = ctaId ? orderedUnits.find((un) => un.members.some((m) => m.id === ctaId)) : undefined
  const restUnits = ctaUnit ? orderedUnits.filter((un) => un !== ctaUnit) : orderedUnits

  // Unit scales + origins. The CTA keeps the full constrained-axis scale;
  // the rest fit down uniformly (aspect-safe) when they overflow the space
  // left after reserving the CTA slot — this guarantees no pile-ups.
  const gap = pad
  const unitScale = new Map<string, number>()
  const unitPos = new Map<string, { x: number; y: number }>()
  if (targetWide) {
    let ctaW = 0
    let ctaH = 0
    let ctaScale = u
    if (ctaUnit) {
      ctaH = Math.max(Math.max(1, Math.round(ctaUnit.box.h * u)), Math.min(th - pad * 2, ctaMinH))
      ctaScale = ctaH / Math.max(1, ctaUnit.box.h)
      ctaW = Math.min(Math.max(1, Math.round(ctaUnit.box.w * ctaScale)), tw - pad * 2)
      unitScale.set(ctaUnit.id, ctaScale)
      unitPos.set(ctaUnit.id, {
        x: Math.max(pad, tw - pad - ctaW),
        y: Math.max(pad, Math.round((th - ctaH) / 2)),
      })
    }
    const availW = tw - pad * 2 - (ctaUnit ? ctaW + gap : 0)
    const sumW = restUnits.reduce((sum, un) => sum + un.box.w * u, 0)
    const gapsW = gap * Math.max(0, restUnits.length - 1)
    const fit = sumW > 0 ? Math.min(1, Math.max(0.3, (availW - gapsW) / sumW)) : 1
    const ur = u * fit
    let cx = fit >= 1 ? Math.max(pad, pad + Math.round((availW - (sumW + gapsW)) / 2)) : pad
    for (const un of restUnits) {
      const h = Math.max(1, Math.round(un.box.h * ur))
      unitScale.set(un.id, ur)
      unitPos.set(un.id, { x: cx, y: Math.max(pad, Math.round((th - h) / 2)) })
      cx += Math.max(1, Math.round(un.box.w * ur)) + gap
    }
  } else {
    let ctaH = 0
    if (ctaUnit) {
      ctaH = Math.min(Math.max(1, Math.round(ctaUnit.box.h * u)), th - pad * 2)
      unitScale.set(ctaUnit.id, u)
      const w = Math.min(Math.max(1, Math.round(ctaUnit.box.w * u)), tw - pad * 2)
      unitPos.set(ctaUnit.id, { x: Math.round((tw - w) / 2), y: Math.max(pad, th - pad - ctaH) })
    }
    const availH = th - pad * 2 - (ctaUnit ? ctaH + gap : 0)
    const sumH = restUnits.reduce((sum, un) => sum + un.box.h * u, 0)
    const gapsH = gap * Math.max(0, restUnits.length - 1)
    const fit = sumH > 0 ? Math.min(1, Math.max(0.3, (availH - gapsH) / sumH)) : 1
    const ur = u * fit
    let cy = fit >= 1 ? Math.max(pad, pad + Math.round((availH - (sumH + gapsH)) / 2)) : pad
    for (const un of restUnits) {
      const w = Math.min(Math.max(1, Math.round(un.box.w * ur)), tw - pad * 2)
      unitScale.set(un.id, ur)
      unitPos.set(un.id, { x: Math.round((tw - w) / 2), y: cy })
      cy += Math.max(1, Math.round(un.box.h * ur)) + gap
    }
  }

  // Member transform: new origin minus scaled old unit origin.
  const memberT = new Map<string, { s: number; dx: number; dy: number }>()
  for (const un of orderedUnits) {
    const sUn = unitScale.get(un.id) ?? u
    const p = unitPos.get(un.id) ?? { x: Math.round(un.box.x * sUn), y: Math.round(un.box.y * sUn) }
    memberT.set(un.id, { s: sUn, dx: Math.round(p.x - un.box.x * sUn), dy: Math.round(p.y - un.box.y * sUn) })
  }
  // Group children inherit their root unit's transform.
  const ownerOf = (l: Layer): string | null => {
    if (!l.groupId) return null
    let g: string | undefined = l.groupId
    while (g) {
      if (memberT.has(g)) return g
      g = sourceLayers.find((x) => x.id === g)?.groupId
    }
    return null
  }
  const transformOf = (l: Layer): { s: number; dx: number; dy: number } => {
    if (l.groupId) {
      const o = ownerOf(l)
      if (o) return memberT.get(o) ?? { s: u, dx: 0, dy: 0 }
    }
    const un = orderedUnits.find((x) => x.members.some((m) => m.id === l.id))
    if (un) return memberT.get(un.id) ?? { s: u, dx: 0, dy: 0 }
    return { s: u, dx: 0, dy: 0 }
  }

  const out: Layer[] = sourceLayers.map((l) => {
    const base = cloneWithId(l)
    const d = transformOf(l)
    const t: LayerTransform = { s: d.s, dx: d.dx, dy: d.dy }
    let next: Layer
    if (l.type === 'group') {
      next = { ...base } // bounds recomputed below
    } else {
      next = {
        ...base,
        x: Math.round(l.x * d.s + d.dx),
        y: Math.round(l.y * d.s + d.dy),
        w: Math.max(1, Math.round(l.w * d.s)),
        h: Math.max(1, Math.round(l.h * d.s)),
        fontSize: l.fontSize !== undefined ? Math.max(1, Math.round(l.fontSize * d.s)) : undefined,
        radius: l.radius !== undefined ? Math.max(0, l.radius * d.s) : undefined,
        blur: l.blur !== undefined ? Math.max(0, l.blur * d.s) : undefined,
        strokeWidth: l.strokeWidth !== undefined ? Math.max(0, l.strokeWidth * d.s) : undefined,
        dropShadow: scaleShadow(l.dropShadow, d.s),
        innerShadow: scaleShadow(l.innerShadow, d.s),
        paddingTop: l.paddingTop !== undefined ? l.paddingTop * d.s : undefined,
        paddingRight: l.paddingRight !== undefined ? l.paddingRight * d.s : undefined,
        paddingBottom: l.paddingBottom !== undefined ? l.paddingBottom * d.s : undefined,
        paddingLeft: l.paddingLeft !== undefined ? l.paddingLeft * d.s : undefined,
        points: l.points ? scaleVectorPoints(l.points, d.s, d.s) : undefined,
      }
      if (next.type === 'path' && next.points) {
        next.pathData = buildSvgPath(next.points, next.closed !== false, next.w, next.h)
      }
      next = autoFitText(next, next.w, 1)
      next.x = Math.max(0, Math.min(tw - next.w, next.x))
      next.y = Math.max(0, Math.min(th - next.h, next.y))
    }
    if (l.keyframes) {
      next.keyframes = l.keyframes.map((kf) => remapKeyframe(kf, t, d.s))
    }
    return next
  })

  // Recompute group bounds to fit moved children.
  for (const g of out) {
    if (g.type !== 'group') continue
    const b = computeGroupBounds(g.id, out)
    g.x = b.x
    g.y = b.y
    g.w = b.w
    g.h = b.h
  }
  return out
}

/**
 * Scale one layer between presets (used when a layer is added on master
 * after variants exist). Same-family: proportional; otherwise uniform
 * constrained-axis scale + clamp. Fresh id, masterId back-pointer.
 */
export function scaleSingleLayer(layer: Layer, sw: number, sh: number, tw: number, th: number): Layer {
  const sx = tw / Math.max(1, sw)
  const sy = th / Math.max(1, sh)
  const s = Math.min(sx, sy)
  const same = isSameFamily(sw, sh, tw, th)
  const fx = same ? sx : s
  const fy = same ? sy : s
  const next: Layer = {
    ...layer,
    id: uid(),
    masterId: layer.masterId ?? layer.id,
    layoutDetached: false,
    contentDetached: false,
    x: Math.round(layer.x * fx),
    y: Math.round(layer.y * fy),
    w: Math.max(1, Math.round(layer.w * fx)),
    h: Math.max(1, Math.round(layer.h * fy)),
    fontSize: layer.fontSize !== undefined ? Math.max(1, Math.round(layer.fontSize * s)) : undefined,
    radius: layer.radius !== undefined ? Math.max(0, layer.radius * s) : undefined,
    blur: layer.blur !== undefined ? Math.max(0, layer.blur * s) : undefined,
    strokeWidth: layer.strokeWidth !== undefined ? Math.max(0, layer.strokeWidth * s) : undefined,
    dropShadow: scaleShadow(layer.dropShadow, s),
    innerShadow: scaleShadow(layer.innerShadow, s),
    points: layer.points ? scaleVectorPoints(layer.points, fx, fy) : undefined,
    keyframes: layer.keyframes?.map((kf) => ({
      ...kf,
      id: uid(),
      x: Math.round(kf.x * fx),
      y: Math.round(kf.y * fy),
      w: Math.max(1, Math.round(kf.w * fx)),
      h: Math.max(1, Math.round(kf.h * fy)),
      fontSize: kf.fontSize !== undefined ? Math.max(1, Math.round(kf.fontSize * s)) : undefined,
      radius: kf.radius !== undefined ? Math.max(0, kf.radius * s) : undefined,
      blur: kf.blur !== undefined ? Math.max(0, kf.blur * s) : undefined,
      dropShadow: scaleShadow(kf.dropShadow, s),
      innerShadow: scaleShadow(kf.innerShadow, s),
      points: kf.points ? scaleVectorPoints(kf.points, fx, fy) : undefined,
    })),
  }
  if (next.type === 'path' && next.points) {
    next.pathData = buildSvgPath(next.points, next.closed !== false, next.w, next.h)
  }
  next.x = Math.max(0, Math.min(tw - next.w, next.x))
  next.y = Math.max(0, Math.min(th - next.h, next.y))
  return next
}
