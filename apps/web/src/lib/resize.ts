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
 * CTA heuristic v1: smallest pill/rect shape, or a rect with a text layer
 * overlapping it. Returns the layer id or null.
 */
export function detectCtaId(layers: Layer[]): string | null {
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
  if (layer.type !== 'text') return layer
  let fontSize = Math.max(1, Math.round((layer.fontSize ?? 32) * fontScale))
  const minFloor = 8
  for (let i = 0; i < 40; i++) {
    const est = estimateTextBoxSize({ ...layer, fontSize })
    const w = est ? est.w : fallbackTextWidth(layer.text ?? '', fontSize)
    if (w <= Math.max(1, maxW) || fontSize <= minFloor) {
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

  // Pack units: group roots + ungrouped top-level layers (children move with unit).
  const childIds = new Set<string>()
  for (const l of sourceLayers) {
    if (l.type === 'group') {
      for (const d of getDescendantLayers(l.id, sourceLayers)) childIds.add(d.id)
    }
  }
  const units = sourceLayers.filter((l) => !l.groupId && !childIds.has(l.id))
  const ordered = [...units].sort((a, b) => a.y - b.y || a.x - b.x)
  const cta = ctaId ? ordered.find((l) => l.id === ctaId) : undefined
  const rest = cta ? ordered.filter((l) => l.id !== ctaId) : ordered

  // Scaled unit boxes (uniform, aspect preserved).
  const boxOf = (l: Layer) => {
    if (l.type === 'group') {
      const b = computeGroupBounds(l.id, sourceLayers)
      return { w: Math.max(1, Math.round(b.w * u)), h: Math.max(1, Math.round(b.h * u)) }
    }
    let w = Math.max(1, Math.round(l.w * u))
    let h = Math.max(1, Math.round(l.h * u))
    if (l.id === ctaId && targetWide) h = Math.max(h, Math.min(th - pad * 2, ctaMinH))
    if (l.id === ctaId && !targetWide) w = Math.max(w, 10)
    return { w, h }
  }

  const boxes = new Map<string, { w: number; h: number }>()
  for (const l of ordered) boxes.set(l.id, boxOf(l))

  // Positions along the long axis.
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>()
  if (targetWide) {
    const gap = pad
    const totalW = [...boxes.values()].reduce((sum, b) => sum + b.w, 0) + gap * (boxes.size - 1)
    let cx = Math.max(pad, Math.round((tw - totalW) / 2))
    const place = (l: Layer) => {
      const b = boxes.get(l.id)!
      const y = Math.max(pad, Math.round((th - b.h) / 2))
      pos.set(l.id, { x: cx, y, w: b.w, h: b.h })
      cx += b.w + gap
    }
    for (const l of rest) place(l)
    if (cta) {
      // CTA pinned right with padding.
      const b = boxes.get(cta.id)!
      const w = Math.min(b.w, tw - pad * 2)
      pos.set(cta.id, { x: Math.max(pad, tw - pad - w), y: Math.max(pad, Math.round((th - b.h) / 2)), w, h: b.h })
    }
  } else {
    const gap = pad
    const totalH = [...boxes.values()].reduce((sum, b) => sum + b.h, 0) + gap * (boxes.size - 1)
    let cy = Math.max(pad, Math.round((th - totalH) / 2))
    const place = (l: Layer) => {
      const b = boxes.get(l.id)!
      const w = Math.min(b.w, tw - pad * 2)
      const x = Math.round((tw - w) / 2)
      pos.set(l.id, { x, y: cy, w, h: b.h })
      cy += b.h + gap
    }
    for (const l of rest) place(l)
    if (cta) {
      const b = boxes.get(cta.id)!
      const w = Math.min(b.w, tw - pad * 2)
      pos.set(cta.id, { x: Math.round((tw - w) / 2), y: Math.max(pad, th - pad - b.h), w, h: b.h })
    }
  }

  // Unit deltas: new origin minus uniformly-scaled old origin.
  const unitDelta = new Map<string, { dx: number; dy: number; s: number }>()
  for (const l of ordered) {
    const p = pos.get(l.id)!
    const ox = l.type === 'group' ? computeGroupBounds(l.id, sourceLayers).x : l.x
    const oy = l.type === 'group' ? computeGroupBounds(l.id, sourceLayers).y : l.y
    unitDelta.set(l.id, { dx: Math.round(p.x - ox * u), dy: Math.round(p.y - oy * u), s: u })
  }
  // Children inherit their root unit's delta.
  const ownerOf = (l: Layer): string | null => {
    if (!l.groupId) return null
    let g: string | undefined = l.groupId
    while (g) {
      if (unitDelta.has(g)) return g
      g = sourceLayers.find((x) => x.id === g)?.groupId
    }
    return null
  }

  const out: Layer[] = sourceLayers.map((l) => {
    const base = cloneWithId(l)
    const owner = l.groupId ? (ownerOf(l) ?? undefined) : l.id
    const d = unitDelta.get(owner ?? l.id) ?? { dx: 0, dy: 0, s: u }
    const t: LayerTransform = { s: d.s, dx: d.dx, dy: d.dy }
    let next: Layer
    if (l.type === 'group') {
      next = { ...base } // bounds recomputed below
    } else {
      const p = !l.groupId && pos.has(l.id) ? pos.get(l.id)! : null
      next = {
        ...base,
        x: p ? p.x : Math.round(l.x * d.s + d.dx),
        y: p ? p.y : Math.round(l.y * d.s + d.dy),
        w: p ? p.w : Math.max(1, Math.round(l.w * d.s)),
        h: p ? p.h : Math.max(1, Math.round(l.h * d.s)),
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
