/**
 * Animated-by-default + export-time static detection (`lib/project.ts`).
 *
 * New projects ship with `mode: 'animated'`; `projectHasAnimation()` decides
 * whether there is anything timeline-worthy in the layers, so an
 * animation-less project still exports as static.
 *
 * Run from `apps/web`: `bun test`.
 */
import { describe, expect, test } from 'bun:test'
import { PRESETS, createLayer, newProject } from '#/lib/data'
import { projectHasAnimation } from '#/lib/project'

const preset = PRESETS[0] // Instagram Post 1080x1080

describe('project defaults', () => {
  test('new projects are animated', () => {
    expect(newProject(preset).mode).toBe('animated')
  })

  test('fresh projects have no animation', () => {
    expect(projectHasAnimation(newProject(preset))).toBe(false)
  })
})

describe('projectHasAnimation', () => {
  test('plain layers do not count', () => {
    const p = newProject(preset)
    p.layers = [createLayer('text', preset), createLayer('shape', preset, { shape: 'rect' })]
    expect(projectHasAnimation(p)).toBe(false)
  })

  test('in/out presets count, explicit none does not', () => {
    const p = newProject(preset)
    p.layers = [createLayer('text', preset, { anim: 'rise' })]
    expect(projectHasAnimation(p)).toBe(true)
    p.layers = [createLayer('text', preset, { inAnim: 'fade', outAnim: 'slide' })]
    expect(projectHasAnimation(p)).toBe(true)
    p.layers = [createLayer('text', preset, { anim: 'none', inAnim: 'none', outAnim: 'none' })]
    expect(projectHasAnimation(p)).toBe(false)
  })

  test('keyframes count', () => {
    const p = newProject(preset)
    const l = createLayer('shape', preset, { shape: 'rect' })
    l.keyframes = [{ id: 'kf1', time: 0, x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1 }]
    p.layers = [l]
    expect(projectHasAnimation(p)).toBe(true)
    l.keyframes = []
    expect(projectHasAnimation(p)).toBe(false)
  })

  test('bare start/end trims do not count', () => {
    const p = newProject(preset)
    p.layers = [createLayer('text', preset, { start: 2000, end: 3000 })]
    expect(projectHasAnimation(p)).toBe(false)
  })

  test('textFx-shaped layers count (forward-compatible probe)', () => {
    // `as any`: textFx lives on the Text FX branch, not on main's Layer type.
    const p = newProject(preset)
    p.layers = [{ ...createLayer('text', preset), textFx: { kind: 'stagger-up' } } as any]
    expect(projectHasAnimation(p)).toBe(true)
  })
})
