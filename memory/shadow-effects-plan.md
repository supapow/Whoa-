# Implementation Plan — Drop Shadow & Inner Shadow

> **Status:** Steps **A–E code complete and lint-verified** (2026-09-24, second agent). `tsc --noEmit` exit 0; dev server `:3000` → 200 and all touched modules transform clean. **Step E's manual checklist is NOT done** — no desktop browser was connected to the session, so it needs Ola (or a connected browser). Committed on `feature/outer-and-inner-shadows`: `f1e55a4` (feat) + `613017c` (docs).
> **Handoff note (2026-09-24):** first session hit 73% context at Step A; second session implemented A–D. `file:line` refs below predate this session's edits (Canvas grew by ~+130 lines) — re-verify after edits anyway. See **Deviations** section for the four places implementation intentionally differs from the literal plan text.

## Feature

Add **drop shadow** and **inner shadow** effects to canvas elements in `apps/web`.

### Locked decisions (owner: Ola)
- **Two effects only in v1:** drop shadow + inner shadow. No glow yet (data model shaped so glow can be added later without migration — it is: extra optional fields on `ShadowEffect`-style objects).
- **Stackable:** a layer can have *both* active at once, each independently toggleable (presence of the optional field = enabled).
- **Spread:** Figma-style spread control on both effects.
- **Keyframes:** effects animatable on the timeline in v1.
- **UI:** new **"Effects"** panel from a new toolbar button beside "Blur". Not folded into `StylePanel`.
- **Targets:** text, CSS shapes, vector paths, images, stickers — all addable elements.
- **Multi-select:** changing the effect applies to **all selected elements**.
- **Groups:** effect cast by the group's **combined silhouette** — implemented via *shadow-caster duplicates* (see Step B), **chosen by Ola 2026-09-24** over per-child shadows and over deferring groups.

### Effect model (locked)
```ts
export interface ShadowEffect {
  x: number; y: number; blur: number; spread: number
  color: string   // hex
  opacity: number // 0..1
}
// Layer:  dropShadow?: ShadowEffect   innerShadow?: ShadowEffect
// Keyframe: same two optional fields
```
Defaults: drop `{x:0, y:4, blur:12, spread:0, color:'#000000', opacity:0.35}`,
inner `{x:0, y:2, blur:4, spread:0, color:'#000000', opacity:0.35}`.

---

## ✅ DONE (verified written this session)

- [x] **Types** — `apps/web/src/types.ts`: `ShadowEffect` interface added above `Keyframe`; `Keyframe.dropShadow?/innerShadow?`; `Layer.dropShadow?/innerShadow?` (next to `blurType`, L52).
- [x] **New helper lib** — `apps/web/src/lib/shadows.ts` (created):
  - `DEFAULT_DROP_SHADOW`, `DEFAULT_INNER_SHADOW`
  - `shadowFilterId(id)` → `wsh-{id}`, `dropCasterFilterId(id)` → `wsh-drop-{id}`, `innerCasterFilterId(id)` → `wsh-inner-{id}`
  - `shadowCssColor(effect)` (hex/rgb + opacity → `rgba()`), `dropShadowCss(effect)` → CSS `drop-shadow()` fast path
  - `layerNeedsSvgFilter(layer)` — true iff inner shadow present OR drop spread ≠ 0
  - `shadowFilterRegion(w, h, effect)` → `{x,y,width,height}` % strings so offset+blur+spread never clip
  - `lerpShadowEffect(a, b, p)` — numeric lerp + color step at t≥0.5
- [x] **Keyframe write gating** — `store/editor.tsx` `keyframePropKeys` (~L147): added `'dropShadow', 'innerShadow'`.
- [x] **Keyframe interpolation** — `lib/keyframes.ts`:
  - imports `lerpShadowEffect`
  - `sampleLayerKeyframeState`: clones both fields from layer
  - `convertAnimationToKeyframes` `base`: copies both
  - `interpolateKeyframes`: single-KF branch, `hasDropShadowKeyframe`/`hasInnerShadowKeyframe`, `getKfDropShadow`/`getKfInnerShadow` fallback getters, first-KF and last-KF boundary branches, midpoint lerp, both fields in final return
  - `upsertKeyframe`: both keys in `animatableKeys`, baseline backfill onto sibling KFs, new-KF creation uses `'dropShadow' in customProps` so an explicit `undefined` (toggle-off) is honored
- [x] **Repo facts verified** (no code needed):
  - Zero `<defs>`/`<filter>`/`feGaussianBlur` in `src/` — greenfield
  - **No test files exist** (`**/*.{test,spec}.*` → none). `apps/web/moon.yml` `test` task is known-broken (no `test` script) — ignore.
  - `duplicateLayerOrGroup`, `ungroupLayer`, `createGroupFromSelection` (children), `saveComponentToLibrary` all spread `...layer` → shadows survive. **No changes needed.**
  - `convertShapeToVector` returns a patch without shadow keys → merge keeps shadows. **No change needed.**
  - `tool` state type is `string | null` → adding tool `'effects'` needs **no type change**.
  - `LayerContent` returns `null` for `type === 'group'` (Canvas L5517). Layers render **flat** in `project.layers.map` (L3669) — group wrappers are empty siblings ⇒ plan's original "combined silhouette falls out naturally" assumption is **false** (this is why casters exist).

---

## ⬜ NEXT STEPS (in build order)

### Step A — Canvas: `<defs>` + inner wrapper ✅ (written + lint-verified)
Files: `apps/web/src/components/editor/Canvas.tsx`
1. Import from `#/lib/shadows` (`layerNeedsSvgFilter`, `shadowFilterId`, `dropShadowCss`, `shadowFilterRegion`, `dropCasterFilterId`, `innerCasterFilterId`, defaults not needed here).
2. Add a `ShadowFilterDefs({ layers, preset, time })` component rendering one hidden `<svg width={0} height={0}>` with `<defs>`; place it inside the artboard div (near L3461, e.g. right after `<div data-testid="artboard">` opens). For every **visible, effective** layer (apply `interpolateKeyframes` when `l.keyframes?.length`) where `layerNeedsSvgFilter(eff)` → emit `<filter id={shadowFilterId(id)} colorInterpolationFilters="sRGB" {...shadowFilterRegion(refW, refH, dominantEffect)}>` with this primitive chain (feGaussianBlur `stdDeviation = blur/2` to match CSS `drop-shadow` radius semantics):
   - **drop-spread branch:** `feMorphology in="SourceAlpha" operator={spread>0?'dilate':'erode'} radius={|spread|}` (skip node if spread===0, start from SourceAlpha) → `feOffset(dx,dy)` → `feGaussianBlur` → `feFlood floodColor floodOpacity` → `feComposite operator="in"` ⇒ `dropShadow` result. (Skip whole branch if no dropShadow.)
   - **inner branch:** `feMorphology in="SourceAlpha" operator={spread>0?'erode':'dilate'} radius={|spread|}` (erode thickens band inward; skip if spread===0) → `feOffset` → `feGaussianBlur` → `feComposite in="SourceAlpha" in2=blurred operator="out"` ⇒ band → `feFlood` → `feComposite operator="in"` ⇒ `innerShadow`. (Skip if no innerShadow.)
   - **final `feMerge`:** `dropShadow` (if any) → `SourceGraphic` → `innerShadow` (if any).
   - refW/refH: `eff.w`/`eff.h` (non-text) or `preset.w/preset.h` fallback.
3. **Inner wrapper** (fixes selection-border smear bug, L3789 border, L3814 LayerContent): wrap ONLY `<LayerContent>` in `<div style={{ width:'100%', height:'100%', filter: combinedFilter }}>`. Build `combinedFilter` parts in order:
   - `a.filter` **moved off the outer wrapper** onto this one (when !== 'none') — element/ancestor blur now inside, so the selection `<rect>` border (sibling, stays on outer) is never blurred/shadowed. Keep `backdropFilter`/`WebkitBackdropFilter` on the OUTER wrapper (they must see through).
   - `url(#wsh-{id})` when `layerNeedsSvgFilter(eff)`
   - `dropShadowCss(eff.dropShadow)` when drop present && spread===0 (CSS fast path; chains after url fine — drop silhouette unaffected by inner since inner keeps alpha)
   - join with spaces; omit / `'none'` when empty.
   - Outer wrapper: delete `filter: a.filter` line (L3768). Leave `willChange` as-is (harmless) or move to inner when filter active — optional.
   - Render the inner wrapper for all types incl. group (group content is null → harmless).

### Step B — Canvas: group shadow casters (combined silhouette) ✅ (written + lint-verified)
Still `Canvas.tsx`. Two casters per shadowed group; **both output SHADOW ONLY** (filter's `feMerge` omits `SourceGraphic`, so duplicate content pixels are discarded — only their alpha drives the shadow ⇒ no double-draw artifacts):
1. **Drop caster (paints BELOW group children):** precompute `Map<firstChildId, Layer[]>` — for each visible group `g` with `eff.dropShadow`: find first layer with `groupId === g.id` in `project.layers`; before rendering that child in the map loop, render `<div style={{ position:'absolute', inset:0, pointerEvents:'none', filter:`url(#${dropCasterFilterId(g.id)})` }}>` containing re-renders of all `getDescendantLayers(g.id, project.layers)` (skip nested group wrappers): same absolute `left/top/width/height/fontSize/…`, `a.opacity`, `a.transform`, `a.filter` per child (via `getCompositeAnim`), + `<LayerContent>` — **no** event handlers, **no** selection borders, `interpolateKeyframes` applied per child.
   - Filter def `wsh-drop-{gid}`: drop branch (same primitives as Step A.2 drop, including spread morphology when ≠0) → `feMerge` = **`dropShadow` only**. Region from `preset.w/h` + group effect.
2. **Inner caster (paints ABOVE group children):** the group wrapper itself renders AFTER its children (group spliced at `maxIdx+1`), so render the inner caster **inside the group's wrapper**: same duplicate-subtree div, `filter: url(#wsh-inner-{gid})`, region `preset`-based. Filter def `wsh-inner-{gid}`: inner branch primitives → output = **`innerShadow` band only** (final `feComposite in="iflood" in2="iband" operator="in"`, no SourceGraphic merge).
3. Skip both when `g.visible === false` or group hidden by `getCompositeAnim(...).hidden`.

### Step C — UI: EffectsPanel + toolbar ✅ (written + lint-verified)
Files: `components/editor/Panels.tsx`, `components/editor/Toolbar.tsx`
1. `Panels.tsx`:
   - `TITLES` (L28): add `effects: 'Effects'`
   - `PanelBody` `needsLayer` (L99): add `'effects'`; add `case 'effects': return <EffectsPanel />` (near L134)
   - New `EffectsPanel` **modeled exactly on `BlurPanel` (L1483)** incl. its multi-select-aware `up()` (L1490): `selectedIds.length > 1 → updateLayers(selectedIds, patch)` (⚠ do NOT copy the single-select-only `up()` at ~L2455/~L2726). Per effect: header status + Reset (mirrors L1510-1534), enable toggle (`up({ dropShadow: DEFAULT_DROP_SHADOW })` / `up({ dropShadow: undefined })`), sliders X/Y (−100..100), blur (0..80), spread (−20..60), opacity (0..100%), color = `PALETTE` swatch row (import exists) + expandable `<ColorPicker>` (props: `color`, `onChange(hex)`, `onClose` — usage example L1408-1416), quick presets grid matching BlurPanel tone (e.g. Off/Subtle/Soft/Deep for drop; Top/Inset/Carve for inner).
   - Read current values from `effective = l.keyframes?.length ? interpolateKeyframes(l, time) : l` (both imports exist).
2. `Toolbar.tsx`: in `common` array (L342, right after the `blur` item) add:
   ```ts
   { key: 'effects', label: 'Effects', icon: <Sparkles className="h-4 w-4" />,
     active: Boolean(selected.dropShadow || selected.innerShadow) },
   ```
   Import `Sparkles` from lucide-react (currently NOT imported in Toolbar). No `onClick` → `renderItem` falls through to `openTool('effects')` (L507).
   ✅ **Decision (Ola, 2026-09-24):** it *does* float — `'effects'` added to **both** `floatingActionKeys` and `toolbarExcludeKeys`, so it lives in the floating row beside Blur and out of the base toolbar.

### Step D — Parity ✅ (written + lint-verified)
1. `lib/textToVector.ts`:
   - `singleLayer` (after `blurType`, L355): `dropShadow: textLayer.dropShadow, innerShadow: textLayer.innerShadow`
   - `groupLayer` (L413-431): copy both too (group carries the effect over the letters' combined silhouette — matches group philosophy; children get none).
2. `lib/groups.ts` `instantiateComponent` → `rootLayer` (L720-738) is built **field-by-field** and currently DROPS shadows: add `dropShadow: comp.root.dropShadow, innerShadow: comp.root.innerShadow`. (childLayers spread `...l` ✓, save spreads ✓.)

### Step E — Verify ⬜ (lint + dev-server done; **manual checklist outstanding**)
```sh
bun run lint                         # from repo root: tsc --noEmit — ✅ exit 0 (2026-09-24)
cd apps/web && bun run dev           # http://localhost:3000 (strictPort) — ✅ 200, touched modules transform clean
```
Manual checklist (mobile viewport first) — unchanged from below; note selection-border item now also regression-tests the blur-smear fix.
**Blocked on:** no desktop browser connected to the session (`browser.tabs.open` → *disconnected*). Ola must run the checklist, or connect the browser and hand back to an agent.

---

## Deviations from the literal plan text (decided while implementing, 2026-09-24)

1. **Spread-0 drop is *never* put inside the SVG filter, even when inner shadow forces a filter.** Plan A.2 said "skip branch if no dropShadow" while A.3 said "add `dropShadowCss` when drop && spread===0" — taken literally that double-paints the drop (once in `feMerge`, once via CSS) whenever inner + spread-0 drop coexist. Implemented: SVG drop branch only when `spread !== 0`; CSS `drop-shadow()` whenever `spread === 0`. Exactly one paint in every combination, and the checklist's "spread===0 stays on the CSS fast path" still holds.
2. **Inner caster renders as a sibling *right after* the group wrapper, not nested inside it.** The group wrapper's box is `group.x/y/w/h`, which can be stale/0 (`computeGroupBounds` exists for that reason) — `inset: 0` inside it would put the duplicate subtree in the wrong coordinate space. As a sibling it inherits artboard coordinates directly, and since the group sits at `maxIdx + 1` (after every child), paint order is identical to the nested version.
3. **Caster filters use the last-primitive-is-output rule instead of a single-node `feMerge`.** `shadowFilterNodes(..., 'dropOnly' | 'innerOnly')` ends on `feComposite … result="dropShadow"/"innerShadow"`, which is the filter's output — same pixels as a one-node `feMerge`, less markup. `'full'` mode still uses the explicit `feMerge` with `SourceGraphic` in the middle.
4. **Extracted `layerBoxStyle()` (module-level in Canvas.tsx)** rather than duplicating the ~18-line geometry block in the caster: the caster silhouette must match the live render exactly, and two copies would drift. The main loop now spreads it and keeps only interaction props (cursor/touch/pointer-events/backdrop/willChange); the caster adds `filter: a.filter`.
5. **Caster children render with `editing={false}`** — two live `EditableText` instances for one layer would fight over the DOM. While a child text is being edited, the group shadow shows the last committed text.
6. **UI cosmetics:** inner-shader icon `Contrast`, drop icon `Sparkles` (also used on the toolbar button); presets in a 2×2 grid (`grid-cols-2`) rather than BlurPanel's `grid-cols-3`, and inner got an `Off` preset alongside Top/Inset/Carve so both effects have symmetric controls.
7. **Groups still get a (dead) `wsh-{gid}` filter + CSS drop-shadow on their empty inner wrapper** — kept Step A's "render the inner wrapper for all types incl. group" as written. Zero visual effect (group `LayerContent` is `null`); casters do the real work. Could be gated off with `l.type !== 'group'` later if the dead defs bother anyone.

---

## Gotchas (updated)

1. **Selection-border SVG is a child of the outer wrapper** (Canvas ~L3789) → shadows/blur go on the new inner wrapper (Step A.3). Side effect: fixes existing element-blur-smears-border bug.
2. **CSS `drop-shadow()` has no spread; inner has no CSS form at all.** Fast path: spread===0 drop → CSS; inner OR spread≠0 → SVG (per Step A.2 chain). SVG `stdDeviation = blur/2` for CSS parity.
3. **`colorInterpolationFilters="sRGB"` is mandatory** on every `<filter>` — default linearRGB washes shadow colors out.
4. **Groups are flat siblings** — group wrapper is empty; combined silhouette needs casters (Step B), not a filter on the wrapper. Drop caster = before first child; inner caster = inside group wrapper (it already paints after its children).
5. **Group stack order caveat:** drop caster sits under its own children but over everything painted before the group's first child — exact z vs. unrelated overlapping layers is best-effort (accepted).
6. **Export is mocked** (`ExportSheet.tsx` ~L60) — no export parity now; note for backend phase: future renderer must reproduce these effects.
7. **Multi-select writes:** always use the `up()` at Panels ~L1490 pattern.
8. `instantiateComponent` root copy is the **only** group/component path that doesn't spread (see Step D.2).
9. History/undo: `updateLayer`/`updateLayers` are already "continuous" actions → slider drags coalesce; no change needed.

---

## Verification checklist (manual)

- [ ] Drop shadow renders on text, each shape kind, path, image, sticker
- [ ] Inner shadow follows the *silhouette* (circle + triangle + star, not just rectangle)
- [ ] Both effects active simultaneously on one layer
- [ ] Multi-select 2+ elements → one change applies to all
- [ ] Selection outline / handles are **not** shadowed (and element blur no longer smears the border)
- [ ] Group shadow uses combined silhouette; shadow behind children, inner band over children
- [ ] `spread > 0` renders (SVG path); `spread === 0` drop stays on CSS fast path (inspect `filter` style)
- [ ] Keyframe: effect interpolates across playhead; slider drags coalesce to one undo entry; toggle-off with keyframes present writes `undefined`
- [ ] Convert text → vectors: effect survives (single AND group mode)
- [ ] Duplicate / group / ungroup / insert-component: effect survives
- [ ] Shadow colors look right (sRGB filters, not washed out); no clipping at max offset/blur/spread

## Repo context the agent needs

- Package manager is **Bun** (`bun.lock` committed, `.prototools` pins it). Never commit `package-lock.json`.
- See `AGENTS.md` for run/verify commands and known-stale docs (README port 5173→3000, PRD naming — do not trust them).
- Conventional Commits; branches are `type/description`. Suggested commit split: `feat(editor): add drop shadow and inner shadow effects` (code) — no lockfile change expected.
