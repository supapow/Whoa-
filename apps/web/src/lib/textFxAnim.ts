import type { Layer, TextFx } from '#/types'
import { isLoopingTextFx } from '#/lib/textFx'

// Shared in-animation state machine: progress (elapsed/dur, cubic ease-out) maps
// to { opacity, transform, filter }. Used by anim() (Canvas.tsx) for whole layers
// and by fxUnitState below per letter/word unit.
export function inAnimState(
  layer: Layer,
  type: Layer['anim'],
  elapsed: number,
  dur: number,
) {
  const baseRot = layer.rotation ? `rotate(${layer.rotation}deg)` : ''
  const baseScale = layer.scale !== undefined && Math.abs(layer.scale - 1) > 0.005 ? `scale(${layer.scale.toFixed(3)})` : ''
  const baseTransform = [baseScale, baseRot].filter(Boolean).join(' ')
  const baseBlur = (layer.blur && layer.blur > 0 && layer.blurType !== 'backdrop') ? `blur(${layer.blur}px)` : 'none'
  if (type === 'none' || dur <= 0) {
    return { opacity: layer.opacity, transform: baseTransform, filter: baseBlur, hidden: false }
  }
  const inP = Math.max(0, Math.min(1, elapsed / dur))
  const easeOut = 1 - Math.pow(1 - inP, 3) // cubic ease out

  let opacity = layer.opacity * easeOut
  let transform = baseRot
  let filter = baseBlur

  const t = type.toLowerCase()
  if (t.includes('fade')) {
    opacity = layer.opacity * easeOut
  } else if (t.includes('rise')) {
    const dy = (1 - easeOut) * 28
    transform = [dy > 0.1 ? `translateY(${dy.toFixed(1)}px)` : '', baseRot].filter(Boolean).join(' ')
  } else if (t.includes('pop')) {
    const scale = 0.72 + 0.28 * easeOut
    transform = [Math.abs(scale - 1) > 0.005 ? `scale(${scale.toFixed(3)})` : '', baseRot].filter(Boolean).join(' ')
  } else if (t.includes('slide')) {
    const dx = (1 - easeOut) * -48
    transform = [Math.abs(dx) > 0.1 ? `translateX(${dx.toFixed(1)}px)` : '', baseRot].filter(Boolean).join(' ')
  } else if (t.includes('blur')) {
    // Pure optical rack-focus: deep 28px blur smoothly resolving into razor-sharp focus (or layer blur)
    const falloff = Math.pow(1 - inP, 1.8)
    const addedBlur = layer.blurType !== 'backdrop' ? (layer.blur || 0) : 0
    const blurPx = falloff * 28 + addedBlur
    opacity = layer.opacity * easeOut
    filter = blurPx > 0.1 ? `blur(${blurPx.toFixed(1)}px)` : 'none'
    transform = baseRot
  } else if (t.includes('rotate')) {
    const startDeg = layer.inRotateStart ?? 0
    const endDeg = layer.inRotateEnd ?? 30
    const currentDeg = startDeg + (endDeg - startDeg) * easeOut
    const totalRot = (layer.rotation || 0) + currentDeg
    opacity = layer.opacity * easeOut
    transform = `rotate(${totalRot.toFixed(2)}deg)`
  } else if (t.includes('pulse')) {
    // Pulse entrance: enters with smooth opacity fade and a rhythmic scale pulse
    opacity = layer.opacity * Math.min(1, inP * 2)
    const pulseCycle = Math.sin(inP * Math.PI * 2) * Math.pow(1 - inP, 0.75) * 0.22
    const scale = 1 + pulseCycle
    transform = [Math.abs(scale - 1) > 0.005 ? `scale(${scale.toFixed(3)})` : '', baseRot].filter(Boolean).join(' ')
  }

  return { opacity, transform, filter, hidden: false }
}

// Per-unit state for a Text FX layer. `unitElapsed` is ms since this unit's slot
// started (negative = still waiting, >= fx.duration = at rest). The layer-level
// transform from getCompositeAnim still applies on the parent box, so the probe is
// normalized (opacity 1, no rotation/blur) to avoid double-applying resting props.
export function fxUnitState(layer: Layer, fx: TextFx, unitElapsed: number) {
  if (isLoopingTextFx(fx.kind)) {
    const period = 1400
    const phase = ((((unitElapsed % period) + period) % period) / period) * Math.PI * 2
    const dy = Math.sin(phase) * -7
    return {
      opacity: 1,
      transform: Math.abs(dy) > 0.1 ? `translateY(${dy.toFixed(1)}px)` : '',
      filter: 'none',
    }
  }
  if (unitElapsed >= fx.duration) {
    return { opacity: 1, transform: '', filter: 'none' }
  }
  const probe: Layer = { ...layer, opacity: 1, rotation: 0, blur: 0 }
  return inAnimState(probe, fx.anim, Math.max(0, unitElapsed), Math.max(1, fx.duration))
}
