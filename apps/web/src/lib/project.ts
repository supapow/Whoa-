/**
 * Minimal shape `projectHasAnimation` needs. Structural (not `Layer`) on
 * purpose: `textFx` only exists on branches with Text FX, and an optional
 * probe prop keeps this compiling everywhere while still detecting it where
 * present.
 */
interface AnimationProbe {
  anim?: string
  inAnim?: string
  outAnim?: string
  keyframes?: unknown[]
  textFx?: unknown
}

function isActiveAnim(value: string | undefined): boolean {
  return value !== undefined && value !== 'none'
}

/**
 * Does this project contain anything that needs a timeline to express?
 *
 * New projects default to `mode: 'animated'` so animation features (including
 * Text FX) are discoverable immediately. Export uses this — not `mode` — to
 * decide between video and static formats, so an animation-less project is
 * still "flagged as static" where it matters.
 *
 * Deliberately excludes bare `start`/`end` trims: a trimmed but otherwise
 * static layout needs no video to express in a single-frame export.
 */
export function projectHasAnimation(project: { layers: AnimationProbe[] }): boolean {
  return project.layers.some(
    (l) =>
      isActiveAnim(l.anim) ||
      isActiveAnim(l.inAnim) ||
      isActiveAnim(l.outAnim) ||
      (l.keyframes !== undefined && l.keyframes.length > 0) ||
      l.textFx !== undefined,
  )
}
