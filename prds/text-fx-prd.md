# Whoa! — Text FX PRD

Status: draft v1 (motion-only, derived spans, animated mode only)
Scope: `apps/web` only. Text layers with staggered per-unit in-animations.
App: Whoa! (mobile-first)

## 1. Problem

CapCut-style text in-animations (letters staggering in one by one) are a proven
engagement hook — observed first-hand with a young user picking exactly this
effect. Whoa! has the two halves of this feature but not the feature itself:

- per-letter decomposition exists (`convertTextLayerToVectors(mode:'group')` in
  `apps/web/src/lib/textToVector.ts`) but it is **destructive**: it replaces the
  text layer with N `path` layers, so the text is no longer editable as text;
- whole-layer in-animations exist (`anim()` in
  `apps/web/src/components/editor/Canvas.tsx:49`, presets
  `fade|rise|pop|slide|blur|rotate|pulse`) but there is **no stagger, delay, or
  per-child offset anywhere** in the codebase.

Goal: a text layer that *looks and behaves like a normal text layer* (double-tap
to edit, drag, resize, same panels) but plays a staggered letter/word
in-animation — with the effect surviving every text edit automatically.

## 2. Goals / non-goals

Goals:
- Add a Text FX to a text layer from the floating text toolbar; pick from a
  small motion preset gallery; tune unit (letters/words), order, stagger, speed.
- Editing the text (double-tap, type, commit) keeps the effect working with no
  user action — the derivation re-runs from the new text.
- The effect is timeline-driven: scrubbing, playback, undo/redo, and reload all
  show the same frame for the same `time` (deterministic, including `random`
  order via a stored seed).
- The effect composes with the layer's normal in/out animation and keyframes:
  stagger for entrance, whole-layer animation for exit, as today.
- The timeline and layers panel mark the layer so users can tell it is a
  Text FX layer.

Non-goals (v1):
- No vectorization in the render path (spans, not paths — see §3).
- No Text FX in static mode: entry points are hidden there, and effected layers
  render their resting (end) state.
- No text *style* presets (gradient/outline/glow galleries). Users build styles
  manually with existing per-layer controls and save them as components for
  reuse (existing `isComponent` / component library flow).
- No per-letter keyframes, no word/line granularity beyond `letter | word`.
- No export wiring — export is mocked repo-wide (`ExportSheet.tsx` is a fake
  progress bar; desktop/api have no pipeline). The derivation is kept pure so a
  future exporter can reuse it.

## 3. Core concept: derive, don't bake

The rejected design is "secretly vectorize after every edit and stagger the
letter layers": it materializes N layers into `project.layers`, needs group
wrapping (groups are logical-only with a flat DOM — `LayerContent` returns
`null` for `type:'group'`), needs cache invalidation on every text/font/size
edit, and multiplies timeline rows, undo entries, and sync surface.

v1 instead stores **one optional field** on the layer and derives the rest at
render time:

- Source of truth stays `layer.text` (+ font/size/weight/align, as today).
- `Layer.textFx?: TextFx` (§4) is the only new persisted state. Undo/redo,
  duplicate, multi-select, ad-set content sync all keep working untouched
  (plus one sync-keys addition, §8).
- At render time the text is split into per-unit `<span>`s (`inline-block`),
  each animated with the existing `anim()` evaluated at an offset time
  (`time - i * stagger`). No font files, no async, no layout shift vs. the
  plain-text render path: spans inherit the browser's exact text shaping.

Why not vector paths: for entrance motion, outlines buy nothing and cost
fidelity (opentype re-layout can re-flow the headline) plus a font-file
dependency (`loadFont()` rejects faux weights). If an outline-dependent effect
(morph, stroke-draw) ships later, `textToVector.ts` should first be refactored
into a pure `deriveGlyphPaths(text, font, …)` with no `Layer` objects in its
signature, consumable by effects without touching `project.layers`.

Known tradeoff: splitting into spans drops kerning/ligatures *across* unit
boundaries. Mitigation: the split is applied permanently on effected layers
(not only during playback), so the text never shifts when the user hits play.

## 4. Data model (`apps/web/src/types.ts`)

```ts
type TextFxUnit = 'letter' | 'word'
type TextFxOrder = 'ltr' | 'rtl' | 'center' | 'random'

interface TextFx {
  kind: string   // effect id from the gallery (§7)
  unit: TextFxUnit
  order: TextFxOrder
  stagger: number  // ms between units
  duration: number // ms per unit's in-animation
  anim: 'fade' | 'rise' | 'pop' | 'slide' | 'blur' | 'rotate' | 'pulse'
  seed: number     // fixed at creation; stabilizes 'random' order
}
// on Layer (next to the text fields, types.ts:109-115):
textFx?: TextFx
```

Reuse the existing preset union (same literals as `Layer.anim`, `types.ts:97`)
so every gallery effect is a config, not new animation code. `Wave` (continuous)
is the one exception — see §7.

## 5. Derivation — new `apps/web/src/lib/textFx.ts`

Pure, sync, unit-testable:

```ts
splitTextFxUnits(text: string, unit: TextFxUnit):
  Array<{ chars: string[]; unitIndex: number }>  // preserves spaces/newlines
effectiveFxIndex(unitIndex: number, total: number, order: TextFxOrder, seed: number): number
```

Memoized in the renderer by `(text, unit, order, seed)`. This module is the
piece a future exporter reuses verbatim.

## 6. Animation — `anim()` gains a time offset

`anim(layer, time, active, allLayers?)` (`Canvas.tsx:49`) is a pure function of
`(layer, time, active)` — the property that makes scrubbing work today and that
a future frame-stepper needs. Add an optional 5th parameter, e.g.
`opts?: { inOffsetMs?: number }`:

- `inStart = layerStart + (opts?.inOffsetMs ?? 0)` — shifts **only the in-phase
  start**. Lifespan hiding and the **out-phase are untouched**, so the whole
  layer still exits together under its normal `outAnim`.
- Per-unit call: `anim(layer, time - effectiveIndex * stagger, active,
  allLayers, { inOffsetMs: 0 })` is equivalent; implement whichever reads
  cleaner, but the offset must apply to the in-phase only.

No changes to `getCompositeAnim()` (`Canvas.tsx:237`): letter transforms render
as children of the layer div, so the layer-level transform (presets + keyframes)
composes with letter transforms through normal CSS nesting.

## 7. v1 gallery

All five are thin configs over existing `anim()` presets + `unit/order/
stagger/duration` params:

1. **Stagger Up** (default) — `rise` + fade, `ltr`, letters. The CapCut effect
   from the original request.
2. **Pop In** — `pop` (scale), `center`-out order, letters.
3. **Blur In** — `blur` → sharp, `ltr`, letters.
4. **Drop In** — `slide` from above + fade, `rtl`, words.
5. **Wave** — `rise`/`fall` alternating, continuous loop while the layer is
   alive. Only effect needing bespoke time math (phase from
   `(time - layerStart)` mod period); still rendered through the same span
   pipeline.

Panel also offers an **Off** tile (removes `textFx`) and unit toggle
**Letters/Words**, order selector, stagger + duration sliders.

## 8. UX flows (mobile-first)

Entry (animated mode only — both hidden when `project.mode === 'static'`):
- `TextFloatingPanel` (`Panels.tsx:3668`): new row after the Spline
  (`convertText`) button → `openTool('textFx')`.
- Bottom toolbar text list (`Toolbar.tsx:406`): new
  `{ key: 'textFx', label: 'Text FX', icon: <Sparkles/> }` next to
  `convert-vector` (`Toolbar.tsx:413`). Default click routes via
  `openTool(it.key)` — no custom handler needed.

Panel (`Panels.tsx`): `TITLES` entry ("Text FX"), `PanelBody` case, add
`'textFx'` to `needsLayer` (`Panels.tsx:110`). New `TextFxPanel`: preset grid
with animated CSS thumbnails + the unit/order/stagger/duration controls from
§7. All existing text panels (font, color, style, align, shadow, blur,
To Vector) work unchanged — the layer stays `type: 'text'`.

Editing: while `editingId === layer.id` (`Canvas.tsx:3406`, `EditableText`
commit path) the layer renders **plain text, effect paused**; on commit the
derivation re-runs and the effect resumes. (No strobing while typing.)

Timeline (`Timeline.tsx`): `FX` badge in the clip-variant ternary (alongside
the keyframed `◆` and `isGroup` branches, `~L990-1010`), keeping the `text`
track color (`TRACK_COLOR`, `Timeline.tsx:12`) so the row still reads as text.
Label dot fallback (`#3B82F6`, L770/L1110) is unaffected. Layers panel: small FX
glyph next to the layer name.

Static mode: `active` is hard-false (`Canvas.tsx:1222`), so `anim()` returns
resting state and an effected layer renders as **normal, fully-visible text**.
No clock, no autoplay, no special case — inert by construction. (Confirmed
decision; revisit only if static banners want motion.)

Ad-set sync: `textFx` must be added to the content sync keys in
`apps/web/src/lib/adset.ts` (`CONTENT_SYNC_KEYS`) so linked sizes follow the
master, and `Project.mode` propagation from the linked-size fix applies as-is
(a size stuck in `static` would show the effect's end state — consistent, but
worth an acceptance check, §9.6).

## 9. Acceptance criteria

Renderer (animated mode, mobile viewport first):
1. Text + Stagger Up: scrub `time` from `layer.start` → letters appear left to
   right, each running the rise+fade over `duration`, spaced `stagger` apart;
   scrubbing back reverses exactly (pure function of `time`).
2. Scrub to mid-life → all letters at rest, pixel-comparable to the same text
   with the effect removed (modulo the accepted kerning caveat, §3).
3. Near `layer.end` → whole-layer `outAnim` runs once, letters exit together.
4. Double-tap → plain-text editing, no animation; commit new text → effect
   replays from the new string, same timing rules.
5. `order: random` → identical frames after reload and across undo/redo (seed).
6. Ad set: master with Text FX → linked sizes created before *and* after show
   the same frames at the same `time` (mode propagation per the linked-size
   fix; `textFx` in sync keys).

Static mode:
7. Effected layer renders fully-visible plain text; Text FX entry points hidden
   in both the floating panel and the toolbar.

Regression:
8. Undo/redo across effect add/remove/tune; duplicate layer keeps effect;
   keyframed text + Text FX compose (keyframes move the box, stagger moves
   letters inside it).
9. `bun run lint` with no new errors; unit tests for `splitTextFxUnits` and
   offset determinism run under `cd apps/web && bun run test`
   (`apps/web/tests/`, excluded from `tsconfig.json` per the bun:test-types
   convention).

## 10. Risks / unknowns

- Cross-letter kerning/ligature loss on split (§3) — accepted for display type;
  verify on the bundled font set, worst case restrict v1 gallery to `unit:
  'word'` for scripts where it matters.
- `Wave` is the only looping effect: define its behaviour at `time` beyond one
  period and against `outAnim` (proposal: loop while alive, exit together).
- Span splitting vs. `whiteSpace: 'pre'` + `max-content` text box
  (`Canvas.tsx` text branch): verify long/wrapping text measures identically
  with and without the effect.
- `estimateTextBoxSize` / centered-template-text logic must see the same box
  for effected and plain text.
- Emoji/sticker-adjacent text, RTL text, and multi-line alignment need manual
  passes (grapheme splitting, not char splitting, for emoji).

## 11. Plan (suggested milestones)

1. Types (`TextFx`, `Layer.textFx`) + `lib/textFx.ts` pure derivation with unit
   tests.
2. `anim({ inOffsetMs })` + span renderer in `LayerContent` + Stagger Up only;
   verify §9.1–9.4, static inertness (§9.7), editing pause.
3. `TextFxPanel` (gallery grid + controls), floating-panel row + toolbar item
   (animated-mode gating), `FX` timeline badge, layers-panel glyph, ad-set sync
   key.
4. Remaining 4 effects incl. `Wave` loop semantics; seed-stability tests
   (§9.5); full acceptance pass (§9) + PR.
