/**
 * Text FX derivation (`lib/textFx.ts`): unit splitting + deterministic ordering.
 *
 * Run from `apps/web`: `bun test`.
 */
import { describe, expect, test } from 'bun:test'
import {
  effectiveFxIndex,
  isLoopingTextFx,
  segmentGraphemes,
  splitTextFxUnits,
  textFxFromPreset,
  TEXT_FX_PRESETS,
} from '#/lib/textFx'
import { fxUnitState, inAnimState } from '#/lib/textFxAnim'
import { PRESETS, createLayer } from '#/lib/data'

describe('splitTextFxUnits', () => {
  test('letter mode splits graphemes, one unit per character', () => {
    const lines = splitTextFxUnits('Hi!', 'letter')
    expect(lines).toHaveLength(1)
    expect(lines[0].map((u) => u.chars.join(''))).toEqual(['H', 'i', '!'])
    expect(lines[0].map((u) => u.unitIndex)).toEqual([0, 1, 2])
  })

  test('word mode keeps words and whitespace runs as separate units', () => {
    const lines = splitTextFxUnits('Hi  you', 'word')
    expect(lines).toHaveLength(1)
    expect(lines[0].map((u) => u.chars.join(''))).toEqual(['Hi', '  ', 'you'])
  })

  test('newlines become line breaks, units restart per line', () => {
    const lines = splitTextFxUnits('ab\nc', 'letter')
    expect(lines).toHaveLength(2)
    expect(lines[0].map((u) => u.chars.join(''))).toEqual(['a', 'b'])
    expect(lines[1].map((u) => u.chars.join(''))).toEqual(['c'])
    expect(lines[1][0].unitIndex).toBe(0)
  })

  test('empty text yields one empty line', () => {
    expect(splitTextFxUnits('', 'letter')).toEqual([[]])
  })

  test('emoji ZWJ sequences stay in one unit', () => {
    const chars = segmentGraphemes('👨‍👩‍👧 A')
    expect(chars).toEqual(['👨‍👩‍👧', ' ', 'A'])
    const lines = splitTextFxUnits('👨‍👩‍👧A', 'letter')
    expect(lines[0]).toHaveLength(2)
  })
})

describe('effectiveFxIndex', () => {
  test('ltr is identity, rtl is reversed', () => {
    expect([0, 1, 2, 3].map((i) => effectiveFxIndex(i, 4, 'ltr', 1))).toEqual([0, 1, 2, 3])
    expect([0, 1, 2, 3].map((i) => effectiveFxIndex(i, 4, 'rtl', 1))).toEqual([3, 2, 1, 0])
  })

  test('center radiates outward, ties go left-first', () => {
    // 5 units: middle (2) first, then 1, 3, then 0, 4
    expect([0, 1, 2, 3, 4].map((i) => effectiveFxIndex(i, 5, 'center', 1))).toEqual([3, 1, 0, 2, 4])
    // 4 units: 1 and 2 tie at 0.5 — left (1) first
    expect([0, 1, 2, 3].map((i) => effectiveFxIndex(i, 4, 'center', 1))).toEqual([2, 0, 1, 3])
  })

  test('random is a stable permutation per seed', () => {
    const a = [0, 1, 2, 3, 4, 5].map((i) => effectiveFxIndex(i, 6, 'random', 42))
    const b = [0, 1, 2, 3, 4, 5].map((i) => effectiveFxIndex(i, 6, 'random', 42))
    expect(a).toEqual(b)
    expect([...a].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5])
    const c = [0, 1, 2, 3, 4, 5].map((i) => effectiveFxIndex(i, 6, 'random', 7))
    expect(c).not.toEqual(a)
  })

  test('single unit always maps to slot 0', () => {
    expect(effectiveFxIndex(0, 1, 'random', 99)).toBe(0)
    expect(effectiveFxIndex(0, 1, 'center', 99)).toBe(0)
  })
})

describe('presets', () => {
  test('gallery has the five v1 effects', () => {
    expect(TEXT_FX_PRESETS.map((p) => p.kind)).toEqual(['stagger-up', 'pop-in', 'blur-in', 'drop-in', 'wave'])
  })

  test('textFxFromPreset builds a complete TextFx with seed', () => {
    const fx = textFxFromPreset('stagger-up')
    expect(fx).toMatchObject({ kind: 'stagger-up', unit: 'letter', order: 'ltr', anim: 'rise' })
    expect(typeof fx!.seed).toBe('number')
    expect(textFxFromPreset('nope')).toBeUndefined()
  })

  test('only wave loops', () => {
    expect(isLoopingTextFx('wave')).toBe(true)
    expect(isLoopingTextFx('stagger-up')).toBe(false)
  })
})

describe('inAnimState', () => {
  const layer = createLayer('text', PRESETS[0], {
    text: 'Hi',
    opacity: 0.8,
    rotation: 15,
    blur: 5,
    start: 1000,
    end: 5000,
  })

  test('rise starts invisible below, ends at rest', () => {
    const s0 = inAnimState(layer, 'rise', 0, 380)
    expect(s0.opacity).toBe(0)
    expect(s0.transform).toContain('translateY(28.0px)')
    const s1 = inAnimState(layer, 'rise', 380, 380)
    expect(s1.opacity).toBe(0.8)
    // Rise offset resolved; the layer's own rotation remains (as in anim()).
    expect(s1.transform).toBe('rotate(15deg)')
  })

  test('fade midpoint follows cubic ease-out', () => {
    const s = inAnimState(layer, 'fade', 190, 380)
    expect(s.opacity).toBeCloseTo(0.8 * 0.875, 10)
  })

  test('none returns the resting state', () => {
    const s = inAnimState(layer, 'none', 10, 380)
    expect(s).toMatchObject({ opacity: 0.8, transform: 'rotate(15deg)' })
  })
})

describe('fxUnitState', () => {
  const layer = createLayer('text', PRESETS[0], {
    text: 'ABC',
    opacity: 0.8,
    rotation: 15,
    blur: 5,
    start: 1000,
    end: 5000,
  })
  const fx = textFxFromPreset('stagger-up')!

  test('waiting units render the progress-zero state', () => {
    const s = fxUnitState(layer, fx, -45)
    expect(s.opacity).toBe(0)
  })

  test('resting units are normalized (no double-applied layer props)', () => {
    const s = fxUnitState(layer, fx, fx.duration)
    // Probe normalization: opacity 1 (not 0.8²), no rotation/blur leak from the layer.
    expect(s).toEqual({ opacity: 1, transform: '', filter: 'none' })
  })

  test('mid-flight units are partially visible', () => {
    const s = fxUnitState(layer, fx, 190)
    expect(s.opacity).toBeGreaterThan(0)
    expect(s.opacity).toBeLessThan(1)
  })

  test('wave is deterministic and always opaque', () => {
    const wave = textFxFromPreset('wave')!
    const a = fxUnitState(layer, wave, 350)
    expect(fxUnitState(layer, wave, 350)).toEqual(a)
    expect(a.opacity).toBe(1)
    // Quarter period (1400ms): sin(π/2) → full 7px lift
    expect(a.transform).toBe('translateY(-7.0px)')
  })

  test('full stagger simulation mirrors the renderer composition', () => {
    // time - start - slot * stagger, slots ltr → [0, 1, 2]
    const units = splitTextFxUnits('ABC', fx.unit)[0]
    const opacityAt = (time: number) =>
      units.map((u) => {
        const slot = effectiveFxIndex(u.unitIndex, units.length, fx.order, fx.seed)
        return fxUnitState(layer, fx, time - 1000 - slot * fx.stagger).opacity
      })
    expect(opacityAt(1000)).toEqual([0, 0, 0])
    const mid = opacityAt(1000 + 45 + 380)
    expect(mid[0]).toBe(1)
    expect(mid[1]).toBe(1)
    expect(mid[2]).toBeGreaterThan(0)
    expect(mid[2]).toBeLessThan(1)
    expect(opacityAt(1000 + 2 * 45 + 380)).toEqual([1, 1, 1])
  })
})
