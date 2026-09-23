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
 * Generous but bounded; keyed on the dominant dimension.
 */
export function shadowFilterRegion(w: number, h: number, e: ShadowEffect): { x: string; y: string; width: string; height: string } {
  const padX = Math.abs(e.x) + Math.abs(e.spread) + e.blur
  const padY = Math.abs(e.y) + Math.abs(e.spread) + e.blur
  const px = Math.min(300, Math.max(25, (padX / Math.max(1, w)) * 100))
  const py = Math.min(300, Math.max(25, (padY / Math.max(1, h)) * 100))
  return { x: `${-px}%`, y: `${-py}%`, width: `${100 + px * 2}%`, height: `${100 + py * 2}%` }
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
