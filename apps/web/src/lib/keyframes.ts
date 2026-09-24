import type { Layer, Keyframe } from '#/types'
import { cloneVectorPoints, interpolateVectorPoints, buildSvgPath } from './vector'
import { lerpShadowEffect } from './shadows'

function uid(): string {
  return Math.random().toString(36).slice(2, 8)
}

const NAMED_COLORS: Record<string, [number, number, number, number]> = {
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
  red: [255, 0, 0, 1],
  green: [0, 128, 0, 1],
  blue: [0, 0, 255, 1],
  yellow: [255, 255, 0, 1],
  gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1],
}

/**
 * Parses a hex or rgb(a) color string into [r, g, b, a (0-1)].
 * Returns null if not parseable.
 */
function parseColor(colorStr?: string): [number, number, number, number] | null {
  if (!colorStr || typeof colorStr !== 'string') return null
  const str = colorStr.trim().toLowerCase()

  if (NAMED_COLORS[str]) {
    return NAMED_COLORS[str]
  }

  // Hex color (#rgb, #rgba, #rrggbb, #rrggbbaa)
  if (str.startsWith('#')) {
    const hex = str.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return [r, g, b, 1]
    }
    if (hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      const a = parseInt(hex[3] + hex[3], 16) / 255
      return [r, g, b, a]
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return [r, g, b, 1]
    }
    if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      const a = parseInt(hex.slice(6, 8), 16) / 255
      return [r, g, b, a]
    }
  }

  // rgb(...) or rgba(...)
  const rgbMatch = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/)
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, parseFloat(rgbMatch[1])))
    const g = Math.min(255, Math.max(0, parseFloat(rgbMatch[2])))
    const b = Math.min(255, Math.max(0, parseFloat(rgbMatch[3])))
    const a = rgbMatch[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(rgbMatch[4]))) : 1
    return [r, g, b, a]
  }

  return null
}

/**
 * Smoothly interpolates between two colors using RGB lerp.
 * Falls back to discrete step if either color is not parseable.
 */
export function lerpColor(c0?: string, c1?: string, p = 0): string | undefined {
  if (!c0 && !c1) return undefined
  if (!c0) return c1
  if (!c1) return c0
  if (p <= 0) return c0
  if (p >= 1) return c1

  const p0 = parseColor(c0)
  const p1 = parseColor(c1)
  if (!p0 || !p1) return p >= 0.5 ? c1 : c0

  const r = Math.round(p0[0] + (p1[0] - p0[0]) * p)
  const g = Math.round(p0[1] + (p1[1] - p0[1]) * p)
  const b = Math.round(p0[2] + (p1[2] - p0[2]) * p)
  const a = p0[3] + (p1[3] - p0[3]) * p

  if (a >= 0.999) {
    const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`
}

/**
 * Standard cubic ease-in-out curve for natural motion.
 */
export function easeInOut(p: number): number {
  const t = Math.max(0, Math.min(1, p))
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Extracts a resting keyframe state from a layer at a given time.
 */
export function sampleLayerKeyframeState(layer: Layer, time: number, id?: string): Keyframe {
  const clampedTime = Math.max(layer.start, Math.min(layer.end, Math.round(time)))
  return {
    id: id || uid(),
    time: clampedTime,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    rotation: layer.rotation || 0,
    opacity: layer.opacity ?? 1,
    scale: layer.scale ?? 1,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    color: layer.color,
    fill: layer.fill,
    radius: layer.radius,
    blur: layer.blur ?? 0,
    dropShadow: layer.dropShadow ? { ...layer.dropShadow } : undefined,
    innerShadow: layer.innerShadow ? { ...layer.innerShadow } : undefined,
    points: layer.points ? cloneVectorPoints(layer.points) : undefined,
  }
}

/**
 * Converts a layer's current preset inAnim and outAnim into discrete keyframes.
 * If no animations are set, returns starting and ending resting keyframes.
 */
export function convertAnimationToKeyframes(
  rawLayer: Layer,
  currentTime?: number,
  preset?: { w: number; h: number }
): Keyframe[] {
  let layer = rawLayer

  // If layer is a centered text layer with template full-canvas width (x === 0 && w === preset.w or w >= 800),
  // measure or estimate its actual horizontal position so that the keyframes are pinned to the true coordinates.
  if (
    layer.type === 'text' &&
    layer.align === 'center' &&
    layer.x === 0 &&
    ((preset && layer.w === preset.w) || layer.w >= 800)
  ) {
    let realW = layer.w
    let realX = layer.x
    if (typeof document !== 'undefined') {
      const node = document.querySelector(`[data-layer-id="${layer.id}"]`) as HTMLElement | null
      if (node && node.offsetWidth > 0) {
        realW = node.offsetWidth
        realX = preset ? Math.round((preset.w - realW) / 2) : node.offsetLeft
      }
    }
    if (realX === 0 && (realW === (preset ? preset.w : layer.w) || realW >= 800)) {
      const estW = Math.max(40, Math.round((layer.fontSize || 32) * (layer.text || '').length * 0.55))
      realW = estW
      realX = preset ? Math.round((preset.w - realW) / 2) : 0
    }
    layer = { ...rawLayer, x: realX, w: realW }
  }

  const inAnimType = layer.inAnim || layer.anim || 'none'
  const outAnimType = layer.outAnim || 'none'
  const layerDuration = Math.max(1, layer.end - layer.start)

  const defaultInDur = inAnimType === 'blur' ? 650 : inAnimType === 'rotate' ? (layer.inRotateMs ?? 150) : inAnimType === 'pulse' ? 500 : 380
  const defaultOutDur = outAnimType === 'blur' ? 650 : outAnimType === 'rotate' ? (layer.outRotateMs ?? 150) : outAnimType === 'pulse' ? 500 : 380

  const inDur = Math.min(defaultInDur, Math.max(50, Math.floor(layerDuration / 2)))
  const outDur = Math.min(defaultOutDur, Math.max(50, Math.floor(layerDuration / 2)))

  const base: Omit<Keyframe, 'id' | 'time'> = {
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    rotation: layer.rotation || 0,
    opacity: layer.opacity ?? 1,
    scale: layer.scale ?? 1,
    color: layer.color,
    fill: layer.fill,
    blur: layer.blur ?? 0,
    radius: layer.radius,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    dropShadow: layer.dropShadow ? { ...layer.dropShadow } : undefined,
    innerShadow: layer.innerShadow ? { ...layer.innerShadow } : undefined,
    points: layer.points ? cloneVectorPoints(layer.points) : undefined,
  }

  const keyframes: Keyframe[] = []

  // 1. Entrance animation -> keyframes
  if (inAnimType !== 'none') {
    let startState: Partial<Keyframe> = {}
    switch (inAnimType) {
      case 'fade':
        startState = { opacity: 0 }
        break
      case 'blur':
        startState = { opacity: 0, blur: (layer.blur ?? 0) + 28 }
        break
      case 'rise':
        startState = { y: layer.y + 28, opacity: 0 }
        break
      case 'pop':
        startState = { scale: 0.72, opacity: 0 }
        break
      case 'slide':
        startState = { x: layer.x - 48, opacity: 0 }
        break
      case 'rotate':
        startState = {
          rotation: (layer.rotation || 0) + (layer.inRotateStart ?? 0),
          opacity: 0,
        }
        break
      case 'pulse':
        startState = { scale: 0.85, opacity: 0 }
        break
    }

    // Keyframe at start
    keyframes.push({
      id: uid(),
      time: layer.start,
      ...base,
      ...startState,
    })

    // Intermediate keyframe for pulse
    if (inAnimType === 'pulse') {
      const pulseT = Math.round(layer.start + inDur * 0.35)
      keyframes.push({
        id: uid(),
        time: pulseT,
        ...base,
        scale: 1.16,
        opacity: base.opacity,
      })
    }

    // Resting keyframe at end of entrance
    const restingRot = inAnimType === 'rotate' ? (layer.rotation || 0) + (layer.inRotateEnd !== undefined ? layer.inRotateEnd : 0) : base.rotation
    keyframes.push({
      id: uid(),
      time: layer.start + inDur,
      ...base,
      rotation: restingRot,
      scale: 1,
    })
  } else {
    // Standard resting keyframe at clip start
    keyframes.push({
      id: uid(),
      time: layer.start,
      ...base,
    })
  }

  // 2. Exit animation -> keyframes
  if (outAnimType !== 'none') {
    const exitStartTime = Math.max(layer.start + inDur + 10, layer.end - outDur)

    // Keyframe at start of exit (holding resting state)
    if (exitStartTime > layer.start + inDur) {
      const exitStartRot = outAnimType === 'rotate' ? (layer.rotation || 0) + (layer.outRotateStart ?? 0) : base.rotation
      keyframes.push({
        id: uid(),
        time: exitStartTime,
        ...base,
        rotation: exitStartRot,
        scale: 1,
      })
    }

    // Intermediate keyframe for pulse exit
    if (outAnimType === 'pulse') {
      const pulseOutT = Math.round(exitStartTime + outDur * 0.3)
      keyframes.push({
        id: uid(),
        time: pulseOutT,
        ...base,
        scale: 1.1,
        opacity: Math.max(0, base.opacity * 0.85),
      })
    }

    let endState: Partial<Keyframe> = {}
    switch (outAnimType) {
      case 'fade':
        endState = { opacity: 0 }
        break
      case 'blur':
        endState = { opacity: 0, blur: (layer.blur ?? 0) + 28 }
        break
      case 'rise':
        endState = { y: layer.y - 28, opacity: 0 }
        break
      case 'pop':
        endState = { scale: 0.72, opacity: 0 }
        break
      case 'slide':
        endState = { x: layer.x + 48, opacity: 0 }
        break
      case 'rotate':
        endState = {
          rotation: (layer.rotation || 0) + (layer.outRotateEnd ?? 30),
          opacity: 0,
        }
        break
      case 'pulse':
        endState = { scale: 0.65, opacity: 0 }
        break
    }

    // Keyframe at end
    keyframes.push({
      id: uid(),
      time: layer.end,
      ...base,
      ...endState,
    })
  } else {
    // Standard resting keyframe at clip end
    keyframes.push({
      id: uid(),
      time: layer.end,
      ...base,
    })
  }

  // If a current time was requested and is strictly within clip lifespan:
  // Only inject if there were no animations, or if currentTime is in the resting interval between
  // entrance end and exit start, avoiding corrupting in-flight animation curves
  if (currentTime !== undefined && currentTime > layer.start && currentTime < layer.end) {
    const inFinished = inAnimType !== 'none' ? layer.start + inDur : layer.start
    const outStarted = outAnimType !== 'none' ? Math.max(inFinished + 10, layer.end - outDur) : layer.end
    if ((inAnimType === 'none' && outAnimType === 'none') || (currentTime >= inFinished && currentTime <= outStarted)) {
      const hasNearby = keyframes.some((k) => Math.abs(k.time - currentTime) <= 40)
      if (!hasNearby) {
        keyframes.push({
          id: uid(),
          time: Math.round(currentTime),
          ...base,
        })
      }
    }
  }

  // Sort strictly by time and deduplicate keyframes that are within 15ms
  keyframes.sort((a, b) => a.time - b.time)
  const deduped: Keyframe[] = []
  for (const kf of keyframes) {
    const last = deduped[deduped.length - 1]
    if (last && Math.abs(last.time - kf.time) <= 15) {
      deduped[deduped.length - 1] = kf
    } else {
      deduped.push(kf)
    }
  }

  return deduped
}

/**
 * Interpolates keyframed properties at a given timeline time.
 * Returns a layer object with interpolated values.
 */
export function interpolateKeyframes(layer: Layer, time: number): Layer {
  const kfs = layer.keyframes
  if (!kfs || kfs.length === 0) {
    return layer
  }

  const hasPointsKeyframe = kfs.some((kf) => kf.points !== undefined && kf.points.length > 0)

  if (kfs.length === 1) {
    const k = kfs[0]
    const pts = hasPointsKeyframe ? (k.points ? cloneVectorPoints(k.points) : layer.points) : layer.points
    return {
      ...layer,
      x: k.x,
      y: k.y,
      w: k.w,
      h: k.h,
      rotation: k.rotation,
      opacity: k.opacity,
      scale: k.scale ?? layer.scale ?? 1,
      fontSize: k.fontSize ?? layer.fontSize,
      fontWeight: k.fontWeight ?? layer.fontWeight,
      color: k.color ?? layer.color,
      fill: k.fill ?? layer.fill,
      radius: k.radius ?? layer.radius,
      blur: k.blur ?? layer.blur,
      dropShadow: k.dropShadow ?? layer.dropShadow,
      innerShadow: k.innerShadow ?? layer.innerShadow,
      points: pts,
      pathData: (layer.type === 'path' && pts) ? buildSvgPath(pts, layer.closed !== false, k.w, k.h) : layer.pathData,
    }
  }

  const hasColorKeyframe = kfs.some((kf) => kf.color !== undefined)
  const hasFillKeyframe = kfs.some((kf) => kf.fill !== undefined)
  const hasBlurKeyframe = kfs.some((kf) => kf.blur !== undefined)
  const hasRadiusKeyframe = kfs.some((kf) => kf.radius !== undefined)
  const hasFontSizeKeyframe = kfs.some((kf) => kf.fontSize !== undefined)
  const hasFontWeightKeyframe = kfs.some((kf) => kf.fontWeight !== undefined)
  const hasScaleKeyframe = kfs.some((kf) => kf.scale !== undefined)
  const hasDropShadowKeyframe = kfs.some((kf) => kf.dropShadow !== undefined)
  const hasInnerShadowKeyframe = kfs.some((kf) => kf.innerShadow !== undefined)

  const getKfColor = (kf: Keyframe): string | undefined => (kf.color !== undefined ? kf.color : layer.color)
  const getKfFill = (kf: Keyframe): string | undefined => (kf.fill !== undefined ? kf.fill : layer.fill)
  const getKfBlur = (kf: Keyframe): number => (kf.blur !== undefined ? kf.blur : (layer.blur ?? 0))
  const getKfRadius = (kf: Keyframe): number | undefined => (kf.radius !== undefined ? kf.radius : layer.radius)
  const getKfFontSize = (kf: Keyframe): number | undefined => (kf.fontSize !== undefined ? kf.fontSize : layer.fontSize)
  const getKfFontWeight = (kf: Keyframe): number | undefined => (kf.fontWeight !== undefined ? kf.fontWeight : layer.fontWeight)
  const getKfDropShadow = (kf: Keyframe) => (kf.dropShadow !== undefined ? kf.dropShadow : layer.dropShadow)
  const getKfInnerShadow = (kf: Keyframe) => (kf.innerShadow !== undefined ? kf.innerShadow : layer.innerShadow)

  // Boundary conditions: before first keyframe or after last keyframe
  const first = kfs[0]
  if (time <= first.time) {
    const pts = hasPointsKeyframe ? (first.points ? cloneVectorPoints(first.points) : layer.points) : layer.points
    return {
      ...layer,
      x: first.x,
      y: first.y,
      w: first.w,
      h: first.h,
      rotation: first.rotation,
      opacity: first.opacity,
      scale: hasScaleKeyframe ? (first.scale ?? 1) : (layer.scale ?? 1),
      fontSize: hasFontSizeKeyframe ? getKfFontSize(first) : layer.fontSize,
      fontWeight: hasFontWeightKeyframe ? getKfFontWeight(first) : layer.fontWeight,
      color: hasColorKeyframe ? getKfColor(first) : layer.color,
      fill: hasFillKeyframe ? getKfFill(first) : layer.fill,
      radius: hasRadiusKeyframe ? getKfRadius(first) : layer.radius,
      blur: hasBlurKeyframe ? getKfBlur(first) : layer.blur,
      dropShadow: hasDropShadowKeyframe ? getKfDropShadow(first) : layer.dropShadow,
      innerShadow: hasInnerShadowKeyframe ? getKfInnerShadow(first) : layer.innerShadow,
      points: pts,
      pathData: (layer.type === 'path' && pts) ? buildSvgPath(pts, layer.closed !== false, first.w, first.h) : layer.pathData,
    }
  }

  const last = kfs[kfs.length - 1]
  if (time >= last.time) {
    const pts = hasPointsKeyframe ? (last.points ? cloneVectorPoints(last.points) : layer.points) : layer.points
    return {
      ...layer,
      x: last.x,
      y: last.y,
      w: last.w,
      h: last.h,
      rotation: last.rotation,
      opacity: last.opacity,
      scale: hasScaleKeyframe ? (last.scale ?? 1) : (layer.scale ?? 1),
      fontSize: hasFontSizeKeyframe ? getKfFontSize(last) : layer.fontSize,
      fontWeight: hasFontWeightKeyframe ? getKfFontWeight(last) : layer.fontWeight,
      color: hasColorKeyframe ? getKfColor(last) : layer.color,
      fill: hasFillKeyframe ? getKfFill(last) : layer.fill,
      radius: hasRadiusKeyframe ? getKfRadius(last) : layer.radius,
      blur: hasBlurKeyframe ? getKfBlur(last) : layer.blur,
      dropShadow: hasDropShadowKeyframe ? getKfDropShadow(last) : layer.dropShadow,
      innerShadow: hasInnerShadowKeyframe ? getKfInnerShadow(last) : layer.innerShadow,
      points: pts,
      pathData: (layer.type === 'path' && pts) ? buildSvgPath(pts, layer.closed !== false, last.w, last.h) : layer.pathData,
    }
  }

  // Find adjacent keyframes k0 and k1 where k0.time <= time <= k1.time
  let k0 = first
  let k1 = last
  for (let i = 0; i < kfs.length - 1; i++) {
    if (time >= kfs[i].time && time <= kfs[i + 1].time) {
      k0 = kfs[i]
      k1 = kfs[i + 1]
      break
    }
  }

  const span = Math.max(1, k1.time - k0.time)
  const rawProgress = (time - k0.time) / span
  const p = easeInOut(rawProgress)

  // Interpolate transform properties
  const x = Math.round(k0.x + (k1.x - k0.x) * p)
  const y = Math.round(k0.y + (k1.y - k0.y) * p)
  const w = Math.round(k0.w + (k1.w - k0.w) * p)
  const h = Math.round(k0.h + (k1.h - k0.h) * p)
  const rotation = Number((k0.rotation + (k1.rotation - k0.rotation) * p).toFixed(2))
  const opacity = Number(Math.max(0, Math.min(1, k0.opacity + (k1.opacity - k0.opacity) * p)).toFixed(3))
  const scale = hasScaleKeyframe
    ? Number(((k0.scale ?? 1) + ((k1.scale ?? 1) - (k0.scale ?? 1)) * p).toFixed(3))
    : (layer.scale ?? 1)

  // Interpolate styles
  const fontSize = (hasFontSizeKeyframe && getKfFontSize(k0) !== undefined && getKfFontSize(k1) !== undefined)
    ? Math.round(getKfFontSize(k0)! + (getKfFontSize(k1)! - getKfFontSize(k0)!) * p)
    : (getKfFontSize(k1) ?? getKfFontSize(k0) ?? layer.fontSize)

  const fontWeight = (hasFontWeightKeyframe && getKfFontWeight(k0) !== undefined && getKfFontWeight(k1) !== undefined)
    ? Math.round(getKfFontWeight(k0)! + (getKfFontWeight(k1)! - getKfFontWeight(k0)!) * p)
    : (getKfFontWeight(k1) ?? getKfFontWeight(k0) ?? layer.fontWeight)

  const radius = (hasRadiusKeyframe && getKfRadius(k0) !== undefined && getKfRadius(k1) !== undefined)
    ? Math.round(getKfRadius(k0)! + (getKfRadius(k1)! - getKfRadius(k0)!) * p)
    : (getKfRadius(k1) ?? getKfRadius(k0) ?? layer.radius)

  const blur = hasBlurKeyframe
    ? Math.round(getKfBlur(k0) + (getKfBlur(k1) - getKfBlur(k0)) * p)
    : (layer.blur ?? 0)

  const color = hasColorKeyframe
    ? (lerpColor(getKfColor(k0) || layer.color, getKfColor(k1) || layer.color, p) || layer.color)
    : layer.color

  const fill = hasFillKeyframe
    ? (lerpColor(getKfFill(k0) || layer.fill, getKfFill(k1) || layer.fill, p) || layer.fill)
    : layer.fill

  const dropShadow = hasDropShadowKeyframe
    ? (lerpShadowEffect(getKfDropShadow(k0), getKfDropShadow(k1), p) ?? layer.dropShadow)
    : layer.dropShadow

  const innerShadow = hasInnerShadowKeyframe
    ? (lerpShadowEffect(getKfInnerShadow(k0), getKfInnerShadow(k1), p) ?? layer.innerShadow)
    : layer.innerShadow

  // Interpolate vector anchor points
  let points = layer.points
  if (hasPointsKeyframe) {
    const pts0 = k0.points || layer.points
    const pts1 = k1.points || layer.points
    if (pts0 && pts1) {
      points = interpolateVectorPoints(pts0, pts1, p, layer.closed !== false)
    } else {
      points = pts1 || pts0 || layer.points
    }
  }

  return {
    ...layer,
    x,
    y,
    w,
    h,
    rotation,
    opacity,
    scale,
    fontSize,
    fontWeight,
    color,
    fill,
    radius,
    blur,
    dropShadow,
    innerShadow,
    points,
    pathData: (layer.type === 'path' && points) ? buildSvgPath(points, layer.closed !== false, w, h) : layer.pathData,
  }
}

/**
 * Checks if a keyframe exists near the specified time (within tolerance).
 */
export function hasKeyframeAt(layer: Layer, time: number, tolerance = 60): boolean {
  if (!layer.keyframes || layer.keyframes.length === 0) return false
  return layer.keyframes.some((kf) => Math.abs(kf.time - time) <= tolerance)
}

/**
 * Gets the keyframe closest to the specified time (within tolerance).
 */
export function getKeyframeAt(layer: Layer, time: number, tolerance = 60): Keyframe | undefined {
  if (!layer.keyframes || layer.keyframes.length === 0) return undefined
  return layer.keyframes.find((kf) => Math.abs(kf.time - time) <= tolerance)
}

/**
 * Removes a keyframe near the given time.
 */
export function removeKeyframeAt(layer: Layer, time: number, tolerance = 60): Keyframe[] {
  if (!layer.keyframes) return []
  return layer.keyframes.filter((kf) => Math.abs(kf.time - time) > tolerance)
}

/**
 * Updates or inserts a keyframe at the specified timeline time.
 * Supports updating multiple attributes atomically (e.g. blur and color simultaneously).
 */
export function upsertKeyframe(layer: Layer, time: number, customProps?: Partial<Keyframe>): Keyframe[] {
  const clampedTime = Math.max(layer.start, Math.min(layer.end, Math.round(time)))
  const existing = layer.keyframes ? layer.keyframes.map((k) => ({ ...k })) : []

  // Check if there's already a keyframe at this time (matching tolerance 60ms)
  const matchIndex = existing.findIndex((kf) => Math.abs(kf.time - clampedTime) <= 60)

  // Before updating the target keyframe, preserve previous baseline values on any other
  // existing keyframe that does not have that specific attribute explicitly defined yet.
  // This allows independent attribute transitions (e.g. keyframe 1 has blur 20 + white color,
  // keyframe 2 has blur 0 + black color).
  if (customProps && existing.length > 0) {
    const animatableKeys: (keyof Keyframe)[] = [
      'color', 'fill', 'blur', 'opacity', 'radius', 'fontSize', 'fontWeight', 'rotation', 'x', 'y', 'w', 'h', 'scale',
      'dropShadow', 'innerShadow', 'points'
    ]

    for (const key of animatableKeys) {
      if (key in customProps && customProps[key] !== undefined) {
        for (let i = 0; i < existing.length; i++) {
          if (i !== matchIndex && existing[i][key] === undefined) {
            if (key === 'color') existing[i].color = layer.color
            else if (key === 'fill') existing[i].fill = layer.fill
            else if (key === 'blur') existing[i].blur = layer.blur ?? 0
            else if (key === 'radius') existing[i].radius = layer.radius ?? 0
            else if (key === 'opacity') existing[i].opacity = layer.opacity ?? 1
            else if (key === 'scale') existing[i].scale = layer.scale ?? 1
            else if (key === 'rotation') existing[i].rotation = layer.rotation ?? 0
            else if (key === 'fontSize') existing[i].fontSize = layer.fontSize
            else if (key === 'fontWeight') existing[i].fontWeight = layer.fontWeight
            else if (key === 'x') existing[i].x = layer.x
            else if (key === 'y') existing[i].y = layer.y
            else if (key === 'w') existing[i].w = layer.w
            else if (key === 'h') existing[i].h = layer.h
            else if (key === 'points') existing[i].points = layer.points ? cloneVectorPoints(layer.points) : undefined
            else if (key === 'dropShadow') existing[i].dropShadow = layer.dropShadow ? { ...layer.dropShadow } : undefined
            else if (key === 'innerShadow') existing[i].innerShadow = layer.innerShadow ? { ...layer.innerShadow } : undefined
          }
        }
      }
    }
  }

  if (matchIndex >= 0) {
    const updatedProps = { ...customProps }
    if (updatedProps.points) {
      updatedProps.points = cloneVectorPoints(updatedProps.points)
    }
    existing[matchIndex] = {
      ...existing[matchIndex],
      ...updatedProps,
    }
  } else {
    // Sample layer's interpolated values at clampedTime
    const currentSample = interpolateKeyframes(layer, clampedTime)
    const newKf: Keyframe = {
      id: uid(),
      time: clampedTime,
      x: currentSample.x,
      y: currentSample.y,
      w: currentSample.w,
      h: currentSample.h,
      rotation: currentSample.rotation || 0,
      opacity: currentSample.opacity ?? 1,
      scale: customProps?.scale !== undefined ? customProps.scale : (currentSample.scale ?? 1),
      fontSize: currentSample.fontSize,
      fontWeight: currentSample.fontWeight,
      color: customProps?.color !== undefined ? customProps.color : currentSample.color,
      fill: customProps?.fill !== undefined ? customProps.fill : currentSample.fill,
      radius: currentSample.radius,
      blur: customProps?.blur !== undefined ? customProps.blur : (currentSample.blur ?? 0),
      dropShadow: customProps && 'dropShadow' in customProps
        ? (customProps.dropShadow ? { ...customProps.dropShadow } : undefined)
        : currentSample.dropShadow,
      innerShadow: customProps && 'innerShadow' in customProps
        ? (customProps.innerShadow ? { ...customProps.innerShadow } : undefined)
        : currentSample.innerShadow,
      points: customProps?.points !== undefined
        ? cloneVectorPoints(customProps.points)
        : currentSample.points
          ? cloneVectorPoints(currentSample.points)
          : layer.points
            ? cloneVectorPoints(layer.points)
            : undefined,
      ...customProps,
    }
    if (customProps?.points) {
      newKf.points = cloneVectorPoints(customProps.points)
    }
    existing.push(newKf)
  }

  existing.sort((a, b) => a.time - b.time)
  return existing
}

/**
 * Finds the previous and next keyframes relative to the given time.
 */
export function getAdjacentKeyframes(
  keyframes: Keyframe[] | undefined,
  time: number,
  tolerance = 60
): { prev?: Keyframe; next?: Keyframe } {
  if (!keyframes || keyframes.length === 0) return {}

  let prev: Keyframe | undefined
  let next: Keyframe | undefined

  for (const kf of keyframes) {
    if (kf.time < time - tolerance) {
      prev = kf
    } else if (kf.time > time + tolerance && !next) {
      next = kf
    }
  }

  return { prev, next }
}
