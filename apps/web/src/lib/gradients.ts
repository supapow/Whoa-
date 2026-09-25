import type { BlurFade, LayerGradient } from '#/types'
import { colorToRgba } from '#/lib/shadows'
export const fillGradientDefId = (layerId: string) => `whoa-grad-${layerId}`

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** CSS `linear-gradient()` direction keyword for a compass angle (0 = to top, 90 = to right). */
export function gradientAngleKeyword(angle: number): string {
  const a = ((Math.round(angle) % 360) + 360) % 360
  if (a === 0) return 'to top'
  if (a === 45) return 'to top right'
  if (a === 90) return 'to right'
  if (a === 135) return 'to bottom right'
  if (a === 180) return 'to bottom'
  if (a === 225) return 'to bottom left'
  if (a === 270) return 'to left'
  if (a === 315) return 'to top left'
  return `${a}deg`
}

export function gradientStopsCss(g: LayerGradient): string {
  return [...g.stops]
    .sort((a, b) => a.at - b.at)
    .map((s) => `${colorToRgba(s.color, s.opacity)} ${clampN(Math.round(s.at), 0, 100)}%`)
    .join(', ')
}

/** Full CSS background for a layer gradient (linear or radial). */
export function layerGradientToCss(g: LayerGradient): string {
  const stops = gradientStopsCss(g)
  if (g.kind === 'radial') return `radial-gradient(circle, ${stops})`
  return `linear-gradient(${gradientAngleKeyword(g.angle)}, ${stops})`
}

/**
 * SVG gradient coordinates (objectBoundingBox) for a compass angle.
 * 0deg points up, 90deg points right (matches CSS linear-gradient semantics).
 */
export function gradientAngleCoords(angle: number): { x1: number; y1: number; x2: number; y2: number } {
  const rad = (((angle % 360) + 360) % 360 * Math.PI) / 180
  // CSS: 0deg = to top. Direction vector:
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  // Span the unit box edge-to-edge through the center:
  const len = Math.max(Math.abs(dx), Math.abs(dy)) || 1
  return {
    x1: 0.5 - (dx / 2 / len),
    y1: 0.5 - (dy / 2 / len),
    x2: 0.5 + (dx / 2 / len),
    y2: 0.5 + (dy / 2 / len),
  }
}

/** Unit direction vector for a compass angle (y grows downward). */
function angleDir(angle: number): { dx: number; dy: number } {
  const rad = (((angle % 360) + 360) % 360 * Math.PI) / 180
  return { dx: Math.sin(rad), dy: -Math.cos(rad) }
}

export interface GradientEndpoints {
  p1: { x: number; y: number }
  p2: { x: number; y: number }
}

/**
 * Render endpoints for a linear gradient: explicit drag handles when set,
 * otherwise a centered span derived from `angle`. Coordinates are unit-box
 * (0..1 inside the layer) and may lie outside for overhanging gradients.
 */
export function gradientEndpoints(g: LayerGradient): GradientEndpoints {
  if (g.p1 && g.p2) return { p1: { ...g.p1 }, p2: { ...g.p2 } }
  const { dx, dy } = angleDir(g.angle)
  return {
    p1: { x: 0.5 - dx / 2, y: 0.5 - dy / 2 },
    p2: { x: 0.5 + dx / 2, y: 0.5 + dy / 2 },
  }
}

/** Compass angle (0 = to top, 90 = to right) for a p1 → p2 drag vector. */
export function angleFromEndpoints(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 0
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
  return Math.round(((deg % 360) + 360) % 360)
}

/**
 * CSS mask that keeps the layer fully visible except for a fade ramp toward
 * one edge — used to dissolve (backdrop) blur to transparent.
 */
export function blurFadeMaskCss(fade: BlurFade): string {
  const len = clampN(Math.round(fade.length), 1, 100)
  // Mask ramps from transparent at the fading edge to opaque `len`% inward.
  switch (fade.side) {
    case 'top':
      return `linear-gradient(to bottom, transparent 0%, #000 ${len}%)`
    case 'bottom':
      return `linear-gradient(to top, transparent 0%, #000 ${len}%)`
    case 'left':
      return `linear-gradient(to right, transparent 0%, #000 ${len}%)`
    case 'right':
      return `linear-gradient(to left, transparent 0%, #000 ${len}%)`
  }
}

export interface LayerGradientPreset {
  label: string
  gradient: LayerGradient
  /** Optional paired look: applied together with the gradient (e.g. frosted fade). */
  effect?: {
    blur: number
    blurType: 'element' | 'backdrop'
    blurFade: BlurFade
  }
}

/** Quick presets for layer fills, including fades to transparent. */
export const LAYER_GRADIENT_PRESETS: LayerGradientPreset[] = [
  {
    label: 'Sunset',
    gradient: {
      kind: 'linear', angle: 135,
      stops: [
        { color: '#FF3B30', opacity: 1, at: 0 },
        { color: '#AF52DE', opacity: 1, at: 100 },
      ],
    },
  },
  {
    label: 'Ocean',
    gradient: {
      kind: 'linear', angle: 135,
      stops: [
        { color: '#4FACFE', opacity: 1, at: 0 },
        { color: '#00F2FE', opacity: 1, at: 100 },
      ],
    },
  },
  {
    label: 'Candy',
    gradient: {
      kind: 'linear', angle: 90,
      stops: [
        { color: '#F093FB', opacity: 1, at: 0 },
        { color: '#F5576C', opacity: 1, at: 100 },
      ],
    },
  },
  {
    label: 'Mint',
    gradient: {
      kind: 'linear', angle: 135,
      stops: [
        { color: '#00B09B', opacity: 1, at: 0 },
        { color: '#96C93D', opacity: 1, at: 100 },
      ],
    },
  },
  {
    label: 'Fade down',
    gradient: {
      kind: 'linear', angle: 180,
      stops: [
        { color: '#007AFF', opacity: 1, at: 0 },
        { color: '#007AFF', opacity: 0, at: 100 },
      ],
    },
  },
  {
    label: 'Fade up',
    gradient: {
      kind: 'linear', angle: 0,
      stops: [
        { color: '#000000', opacity: 1, at: 0 },
        { color: '#000000', opacity: 0, at: 100 },
      ],
    },
  },
  {
    label: 'Glow',
    gradient: {
      kind: 'radial', angle: 0,
      stops: [
        { color: '#FFFFFF', opacity: 1, at: 0 },
        { color: '#007AFF', opacity: 1, at: 100 },
      ],
    },
  },
  {
    label: 'Vignette',
    gradient: {
      kind: 'radial', angle: 0,
      stops: [
        { color: '#000000', opacity: 0, at: 40 },
        { color: '#000000', opacity: 0.75, at: 100 },
      ],
    },
  },
  {
    label: 'Frost fade down',
    gradient: {
      kind: 'linear', angle: 180,
      stops: [
        { color: '#FFFFFF', opacity: 0.55, at: 0 },
        { color: '#FFFFFF', opacity: 0.05, at: 100 },
      ],
    },
    effect: { blur: 24, blurType: 'backdrop', blurFade: { side: 'bottom', length: 60 } },
  },
  {
    label: 'Frost fade up',
    gradient: {
      kind: 'linear', angle: 0,
      stops: [
        { color: '#FFFFFF', opacity: 0.55, at: 0 },
        { color: '#FFFFFF', opacity: 0.05, at: 100 },
      ],
    },
    effect: { blur: 24, blurType: 'backdrop', blurFade: { side: 'top', length: 60 } },
  },
]

/** Transparent-fade presets for the canvas background. */
export const BG_FADE_PRESETS: string[] = [
  'linear-gradient(to bottom, #000000 0%, rgba(0, 0, 0, 0) 100%)',
  'linear-gradient(to top, #000000 0%, rgba(0, 0, 0, 0) 100%)',
  'linear-gradient(135deg, #007AFF 0%, rgba(0, 122, 255, 0) 100%)',
  'linear-gradient(135deg, #FF3B30 0%, rgba(255, 59, 48, 0) 100%)',
]

export function defaultGradientForLayerType(type: string): LayerGradient {
  if (type === 'text') {
    return {
      kind: 'linear', angle: 90,
      stops: [
        { color: '#FFFFFF', opacity: 1, at: 0 },
        { color: '#9ECBFF', opacity: 1, at: 100 },
      ],
    }
  }
  return {
    kind: 'linear', angle: 135,
    stops: [
      { color: '#007AFF', opacity: 1, at: 0 },
      { color: '#AF52DE', opacity: 1, at: 100 },
    ],
  }
}
