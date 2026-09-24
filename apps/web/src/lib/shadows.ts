import type { ShadowEffect } from '#/types'

export const DEFAULT_DROP_SHADOW: ShadowEffect = {
  x: 0, y: 4, blur: 12, spread: 0, color: '#000000', opacity: 0.35,
}

export const DEFAULT_INNER_SHADOW: ShadowEffect = {
  x: 0, y: 2, blur: 4, spread: 0, color: '#000000', opacity: 0.35,
}

/** Filter ids are shared through a single hidden <defs> in Canvas. */
export const shadowFilterId = (layerId: string) => `wsh-${layerId}`
export const dropCasterFilterId = (layerId: string) => `wsh-drop-${layerId}`
export const innerCasterFilterId = (layerId: string) => `wsh-inner-${layerId}`

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** hex/rgb color + opacity -> rgba() string for the CSS drop-shadow fast path. */
export function shadowCssColor(effect: ShadowEffect): string {
  const a = clamp01(effect.opacity)
  const c = (effect.color || '#000000').trim()
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1].length === 3
      ? hex[1].split('').map((ch) => ch + ch).join('')
      : hex[1]
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`
  }
  const rgb = c.match(/^rgba?\(([^)]+)\)$/i)
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean)
    const r = parts[0] ?? '0'
    const g = parts[1] ?? '0'
    const b = parts[2] ?? '0'
    return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`
  }
  return c
}

/**
 * CSS fast path: drop-shadow() has no spread, so only use it when spread === 0.
 * Inner shadow has no CSS equivalent at all — always SVG.
 */
export function dropShadowCss(effect: ShadowEffect): string {
  return `drop-shadow(${effect.x}px ${effect.y}px ${effect.blur}px ${shadowCssColor(effect)})`
}

export function layerNeedsSvgFilter(layer: { dropShadow?: ShadowEffect; innerShadow?: ShadowEffect }): boolean {
  if (layer.innerShadow) return true
  if (layer.dropShadow && layer.dropShadow.spread !== 0) return true
  return false
}

/**
 * Percent-based filter region so offset+blur+spread never clip.
 *
 * Percentages resolve against the filtered element's OWN box, so the
 * reference w/h must be that box — not the artboard. There is intentionally
 * no upper clamp: the absolute extension is pad px regardless of the box
 * size, so small boxes at large settings stay correct without blowing up
 * the filter surface. The 25% floor covers antialiasing on tiny pads.
 */
export function shadowFilterRegion(w: number, h: number, e: ShadowEffect): { x: string; y: string; width: string; height: string } {
  const padX = Math.abs(e.x) + Math.abs(e.spread) + e.blur
  const padY = Math.abs(e.y) + Math.abs(e.spread) + e.blur
  const px = Math.max(25, (padX / Math.max(1, w)) * 100)
  const py = Math.max(25, (padY / Math.max(1, h)) * 100)
  return { x: `${-px}%`, y: `${-py}%`, width: `${100 + px * 2}%`, height: `${100 + py * 2}%` }
}

let measureCtx: CanvasRenderingContext2D | null | undefined

function textMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx
  if (typeof document === 'undefined') {
    measureCtx = null
    return measureCtx
  }
  try {
    measureCtx = document.createElement('canvas').getContext('2d')
  } catch {
    measureCtx = null
  }
  return measureCtx
}

/**
 * Synchronous estimate of a text layer's rendered max-content box
 * (whiteSpace: pre, lineHeight 0.8 — matches the canvas text render).
 * Used as the filter-region reference until the live DOM measurement
 * arrives; deliberately approximate, since over-padding is harmless
 * and under-padding clips.
 */
export function estimateTextBoxSize(l: {
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
}): { w: number; h: number } | null {
  const ctx = textMeasureCtx()
  if (!ctx) return null
  const size = l.fontSize ?? 40
  try {
    const fam = (l.fontFamily ?? 'sans-serif').replace(/["']/g, '')
    ctx.font = `${l.fontWeight ?? 400} ${size}px "${fam}", sans-serif`
    const lines = (l.text ?? '').split('\n')
    let w = 0
    for (const line of lines) w = Math.max(w, ctx.measureText(line).width)
    w += (l.paddingLeft ?? 0) + (l.paddingRight ?? 0)
    const h = lines.length * size * 0.8 + (l.paddingTop ?? 0) + (l.paddingBottom ?? 0)
    return { w: Math.max(1, w), h: Math.max(1, h) }
  } catch {
    return null
  }
}

export function lerpShadowEffect(
  a: ShadowEffect | undefined,
  b: ShadowEffect | undefined,
  p: number,
): ShadowEffect | undefined {
  if (!a && !b) return undefined
  if (!a) return b
  if (!b) return a
  const t = clamp01(p)
  const mix = (x: number, y: number) => Number((x + (y - x) * t).toFixed(3))
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    blur: mix(a.blur, b.blur),
    spread: mix(a.spread, b.spread),
    color: t >= 0.5 ? b.color : a.color,
    opacity: mix(a.opacity, b.opacity),
  }
}
