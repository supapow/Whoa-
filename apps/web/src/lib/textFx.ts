import type { TextFx, TextFxOrder, TextFxUnit } from '#/types'

/** One animatable chunk of a Text FX layer: a word, a separator run, or one letter. */
export interface TextFxUnitChunk {
  /** Graphemes in this unit (a word, whitespace run, or single letter). */
  chars: string[]
  /** Position of this unit among its line's units (0-based). */
  unitIndex: number
}

/** Split a single line (no `\n`) into units. Whitespace runs stay verbatim so
 *  spacing/kerning context inside the line is preserved as much as spans allow. */
function splitLine(line: string, unit: TextFxUnit): TextFxUnitChunk[] {
  if (unit === 'word') {
    // Keep separators as their own (unanimated-looking) units so words keep offsets.
    const parts = line.split(/(\s+)/).filter((p) => p.length > 0)
    return parts.map((p, i) => ({ chars: segmentGraphemes(p), unitIndex: i }))
  }
  const graphemes = segmentGraphemes(line)
  return graphemes.map((g, i) => ({ chars: [g], unitIndex: i }))
}

/** Split text into lines of units. `\n` boundaries are returned as line breaks
 *  (rendered as `<br/>`) because a newline inside an inline-block span is unreliable. */
export function splitTextFxUnits(text: string, unit: TextFxUnit): TextFxUnitChunk[][] {
  return text.split('\n').map((line) => splitLine(line, unit))
}

/** Grapheme-cluster split (emoji ZWJ sequences stay together). Falls back to
 *  code points where `Intl.Segmenter` is unavailable. */
export function segmentGraphemes(s: string): string[] {
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(seg.segment(s), (part) => part.segment)
  } catch {
    return Array.from(s)
  }
}

/** Mulberry32 — tiny deterministic PRNG for the 'random' order. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Map a unit's position to its animation slot (0 = animates first).
 * Deterministic in `(unitIndex, total, order, seed)` — same inputs always give
 * the same slot, so scrubbing, undo/redo, reload, and export all agree.
 */
export function effectiveFxIndex(unitIndex: number, total: number, order: TextFxOrder, seed: number): number {
  if (total <= 1) return 0
  switch (order) {
    case 'rtl':
      return total - 1 - unitIndex
    case 'center': {
      const center = (total - 1) / 2
      const ranked = Array.from({ length: total }, (_, i) => i).sort(
        (a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b,
      )
      return ranked.indexOf(unitIndex)
    }
    case 'random': {
      const rand = mulberry32(seed)
      const arr = Array.from({ length: total }, (_, i) => i)
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr.indexOf(unitIndex)
    }
    case 'ltr':
    default:
      return unitIndex
  }
}

/** Gallery preset: a Text FX kind is fully described by one of these. */
export interface TextFxPreset {
  kind: string
  label: string
  anim: TextFx['anim']
  unit: TextFxUnit
  order: TextFxOrder
  stagger: number // ms between units
  duration: number // ms per unit's in-animation
}

export const TEXT_FX_PRESETS: TextFxPreset[] = [
  { kind: 'stagger-up', label: 'Stagger Up', anim: 'rise', unit: 'letter', order: 'ltr', stagger: 45, duration: 380 },
  { kind: 'pop-in', label: 'Pop In', anim: 'pop', unit: 'letter', order: 'center', stagger: 40, duration: 380 },
  { kind: 'blur-in', label: 'Blur In', anim: 'blur', unit: 'letter', order: 'ltr', stagger: 55, duration: 500 },
  { kind: 'drop-in', label: 'Drop In', anim: 'slide', unit: 'word', order: 'rtl', stagger: 90, duration: 380 },
  { kind: 'wave', label: 'Wave', anim: 'rise', unit: 'letter', order: 'ltr', stagger: 70, duration: 380 },
]

/** The wave effect loops while the layer is alive (all others are entrances). */
export function isLoopingTextFx(kind: string): boolean {
  return kind === 'wave'
}

export function textFxPreset(kind: string): TextFxPreset | undefined {
  return TEXT_FX_PRESETS.find((p) => p.kind === kind)
}

/** Fresh random seed, fixed on the layer so 'random' order is stable. */
export function makeTextFxSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

/** Build a `TextFx` from a gallery preset id (seed included). */
export function textFxFromPreset(kind: string): TextFx | undefined {
  const p = textFxPreset(kind)
  if (!p) return undefined
  return { kind: p.kind, unit: p.unit, order: p.order, stagger: p.stagger, duration: p.duration, anim: p.anim, seed: makeTextFxSeed() }
}
