# Implementation Plan — Drop Shadow & Inner Shadow

> **Status:** planned, no code written yet. Branch `feature/outer-and-inner-shadows` is checked out and clean (as of 2026-09-24).
> **How to use:** a fresh agent session can pick this up with *"read `memory/shadow-effects-plan.md` and implement it"*.
> Re-verify every `file:line` reference before editing — line numbers drift as the code changes.

## Feature

Add **drop shadow** and **inner shadow** effects to canvas elements in `apps/web`.

### Locked decisions (owner: Ola)
- **Two effects only in v1:** drop shadow + inner shadow. No outer glow / inner glow yet (the data model should be shaped so glow can be added later without migration).
- **Stackable:** a layer can have *both* active at the same time, each independently toggleable.
- **Spread:** include a Figma-style spread control on both effects.
- **Keyframes:** effects must be animatable on the timeline in v1 (not deferred).
- **UI:** a new **"Effects"** panel, reached from a new toolbar button beside "Blur". Do not fold into `StylePanel`.
- **Targets:** text, CSS shapes, vector paths, images, stickers — i.e. all addable canvas elements.
- **Multi-select:** changing the effect applies it to **all selected elements**.
- **Groups:** the effect is cast by the group's **combined silhouette** (shadow the whole group, not each child individually).

### Effect model (proposed)
```ts
export interface ShadowEffect {
  x: number        // offset px
  y: number
  blur: number     // px
  spread: number   // px
  color: string    // hex
  opacity: number  // 0..1
}
// Layer gains:  dropShadow?: ShadowEffect   innerShadow?: ShadowEffect
```
Sensible defaults: drop `{x:0, y:4, blur:12, spread:0, color:'#000000', opacity:0.35}`,
inner `{x:0, y:2, blur:4, spread:0, color:'#000000', opacity:0.35}`.

## Integration map (verified 2026-09-23/24)

| Concern | File | Hook |
|---|---|---|
| Layer / Keyframe types | `apps/web/src/types.ts` | `Layer` interface ~L40-113, `Keyframe` ~L19-38. Flat optional fields are the house style. |
| Keyframe write gating | `apps/web/src/store/editor.tsx` | `keyframePropKeys` ~L147-151 — **must add both new keys or slider drags won't create keyframes.** |
| Multi-select writes | `apps/web/src/store/editor.tsx` | `updateLayers(ids, patch)` ~L563 already exists — multi-select requirement is solved at store level. |
| History/undo coalescing | `apps/web/src/store/editor.tsx` | `updateLayer`/`updateLayers` are "continuous" actions → slider drags coalesce into one undo entry. No change needed. |
| Layer wrapper style (outer) | `apps/web/src/components/editor/Canvas.tsx` | `<div data-layer-id>` ~L3744-3786; `filter: a.filter` at ~L3768. |
| Animation filter builder | `apps/web/src/components/editor/Canvas.tsx` | `anim()` ~L46, `getCompositeAnim()` ~L234 — already emit `blur(Npx)` filter strings. |
| Content painter | `apps/web/src/components/editor/Canvas.tsx` | `LayerContent()` ~L5502. text → styled div; circle/triangle/star/line/pill/rectangle → inline `<svg>`; path → `<svg>`; image → `<img>` (~L5724/5758); sticker → div. |
| Panel switch | `apps/web/src/components/editor/Panels.tsx` | `PanelBody` cases ~L104-143 → add `case 'effects'`. |
| Panel template | `apps/web/src/components/editor/Panels.tsx` | `BlurPanel` ~L1483 — status header + Reset, slider, presets. Copy this shape. |
| Multi-select `up()` pattern | `apps/web/src/components/editor/Panels.tsx` | ~L1490 (`selectedIds.length > 1 → updateLayers`). **Do not copy** the single-select-only `up()` at ~L2455 / ~L2726. |
| Toolbar entry | `apps/web/src/components/editor/Toolbar.tsx` | item list ~L345 next to `{ key: 'blur', label: 'Blur' }`. |
| Keyframe interpolation | `apps/web/src/lib/keyframes.ts` | ~L131, 192, 403, 419, 442, 465, 512, 604 — add lerps for the new fields (numeric lerp + color blend). |
| Text→vector field copying | `apps/web/src/lib/textToVector.ts` | ~L355 explicitly copies `blurType` — **new shadow fields must be copied here too.** |

## Gotchas

1. **The selection-border SVG is a child of the filtered wrapper** (`Canvas.tsx` ~L3789+). Applying the shadow filter on the outer wrapper would cast a shadow on the selection outline itself.
   → Put the effect filter on a **new inner wrapper around `LayerContent` only**. This also fixes an existing bug where element blur smears the selection border.
2. **CSS `drop-shadow()` has no spread.** With spread included, the general path must be a generated SVG filter:
   `feMorphology dilate (spread)` → `feGaussianBlur` → `feOffset(dx,dy)` → `feFlood(color)` → `feComposite` over `SourceAlpha`, composited under `SourceGraphic`.
   Inner shadow: `SourceAlpha` → `feOffset` → `feGaussianBlur` → `feComposite out/in` against `SourceAlpha` → `feFlood` → `feBlend` over source.
   **Fast path:** when `spread === 0`, use plain CSS `drop-shadow(x y blur color)` (cheap, mobile-friendly) and only use the SVG filter when spread ≠ 0. Inner shadow is always SVG — there is no CSS equivalent.
3. **`<defs>` does not exist yet** — grep confirms zero `<defs>`/`<filter>`/`feGaussianBlur` anywhere in `src/`. Add one shared hidden `<svg><defs>` in `Canvas`, generating one filter per layer id that has effects.
4. **Export is mocked** (`ExportSheet.tsx` ~L60: "Saving is mocked"). No export-parity work now — but note it for the backend phase: the future renderer must reproduce these effects.
5. **Only two layers currently build a multi-select-aware `up()`** — several panels don't. Always use the ~L1490 pattern so all selected elements receive the patch.

## Build order

1. **Types + defaults** — `ShadowEffect`, two optional `Layer` fields, two optional `Keyframe` fields, add both keys to `keyframePropKeys`.
2. **Render** — `<defs>` filter generator, inner wrapper around `LayerContent`, CSS fast-path when `spread === 0`, group wrapper behavior (combined silhouette falls out naturally).
3. **UI** — `EffectsPanel` (modeled on `BlurPanel`), multi-select-aware `up()`, `case 'effects'` in `PanelBody`, toolbar button beside `blur`.
   Panel needs per effect: enable toggle, X / Y offset, blur, spread, color, opacity — plus header status + Reset, and quick presets (match BlurPanel's tone).
4. **Keyframes** — interpolation in `lib/keyframes.ts`, read interpolated values in `anim()` / `getCompositeAnim()`.
5. **Parity** — `textToVector.ts` field copying; confirm duplicate/group/component paths carry the new fields automatically (they spread the layer object — verify, don't assume).
6. **Verify** — see below.

## Verification checklist

```sh
bun run lint                      # tsc --noEmit, expect exit 0
cd apps/web && bun run dev        # http://localhost:3000 (strictPort — kill stale server first)
```
Manual (mobile viewport first — the app is mobile-first):
- [ ] Drop shadow renders on text, each shape kind, path, image, sticker
- [ ] Inner shadow follows the *silhouette* (verify on circle + triangle + star, not just rectangle)
- [ ] Both effects active simultaneously on one layer
- [ ] Multi-select 2+ elements → one change applies to all
- [ ] Selection outline / handles are **not** shadowed
- [ ] Group shadow uses combined silhouette
- [ ] `spread > 0` renders correctly (SVG path) and `spread === 0` stays crisp/fast
- [ ] Keyframe: set effect, move playhead, value interpolates; undo/redo coalesces slider drags into one entry
- [ ] Convert text → vectors: effect survives
- [ ] Duplicate / group / component-save: effect survives

## Repo context the agent needs

- Package manager is **Bun** (`bun.lock` committed, `.prototools` pins it). Never commit `package-lock.json`.
- See `AGENTS.md` for run/verify commands and known-stale docs (README port, PRD naming, etc. — do not trust them).
- Conventional Commits; branches are `type/description`.
