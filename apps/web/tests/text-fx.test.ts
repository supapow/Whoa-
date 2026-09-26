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
