# Whoa! — Creative Scaling v1 PRD

Status: draft v1 (algorithmic, no AI)
Scope: Display Ads only, "usable draft" quality (user tweaks expected)
App: Whoa! (mobile-first, `apps/web` only)

## 1. Problem

Users build an ad in one size (e.g. 300x250) and need the same creative in other IAB sizes. Rebuilding manually per size is slow and error-prone. v1 should auto-generate a new size variant with the same elements and animations, re-laid-out to fit the target format.

## 2. Goals / non-goals

Goals:
- Add a format to the current ad set and get a usable draft instantly.
- Preserve content, style, animations, and brand (no distortion, readable text, visible CTA).
- Allow per-variant manual fixes without breaking content sync with master.
- Cover Display Ads sizes end to end, static + animated.

Non-goals (v1):
- No AI layout model. Deterministic algorithm only.
- No zero-touch guarantee. Extreme pairs (e.g. 300x250 -> 320x50) produce a fixable draft, not a shippable ad.
- No cross-category scaling (social/posters/video). No export-per-size batch changes.
- No live layout sync across variants after initial scale.

## 3. Scope: formats

V1 preset set (`apps/web/src/lib/data.ts:20-24`):
- `ad-mrec` 300x250 (default master), `ad-large` 336x280, `ad-lead` 728x90, `ad-mobile` 320x100, `ad-sky` 160x600.

Test matrix: master 300x250 -> each of the other 4 must pass acceptance (section 8).

## 4. Concepts

- `AdSet`: one creative idea in N sizes. `variants[0]` is the master (first picked size).
- `Variant`: one `Project` per size (reuse existing `Project` type in `apps/web/src/types.ts:166-175`).
- Per-layer link state (new fields on `Layer`):
  - `masterId: string` (source layer id in master variant)
  - `layoutDetached: boolean` — set on manual move/resize on a variant
  - `contentDetached: boolean` — set on manual content/style edit on a variant
- Split-link rule (user-confirmed):
  - Layout edits on a variant detach layout only for that layer.
  - Content/style edits on master (text, src/emoji, fill/color/font, background) still propagate to linked variant layers even when `layoutDetached=true`.
  - Layout edits on master do NOT auto-push after initial scale. Re-apply = explicit "Re-apply master layout" per layer or per variant (re-runs scaler).
  - "Break link" sets both flags; "Re-link" clears them and re-scales that layer.

## 5. UX flows (mobile-first)

Both entry points (user-confirmed):
1. Home multi-pick: preset picker allows selecting multiple Display Ads presets. First selected = master. Creating the ad set builds master layers (empty or from template) then auto-scales to the other picked sizes immediately.
2. Editor add-format: size button / switcher tabs show current variants + "Add format" sheet. Picking a new preset clones from master (or current variant? default: master), runs scaler, lands on the new variant.

Editor variant UI:
- Size switcher (tabs or dropdown, mobile sheet) to jump between variants. Unsaved per-variant edits stay local.
- Detached badge (subtle dot/icon) on layers with `layoutDetached` or `contentDetached`.
- Actions: "Re-apply master layout" (per layer + per variant), "Break link" / "Re-link".

## 6. Scaling algorithm (`lib/resize.ts`, new pure module)

Shape classes by aspect `a = w/h`: `wide (a>2) | square-ish (0.5-2) | tall (a<0.5)`.
300x250 (a=1.2) and 336x280 are square-ish; 728x90 and 320x100 are wide; 160x600 is tall.

Inputs: `sourceLayers: Layer[]`, `sourcePreset: Preset`, `targetPreset: Preset`. Output: `Layer[]` with fresh ids, `masterId` back-pointers, remapped geometry + keyframes.

Steps:
1. Compute `sx = tw/sw`, `sy = th/sh`, `s = min(sx,sy)`.
2. Same-family pairs: proportional map `x*sx, y*sy, w*sx, h*sy`.
3. Cross-family pairs (shape-aware re-layout):
   - Square -> wide: uniform scale each layer by `sy` (height-constrained), then horizontal pack: sort by `y`, distribute along x with padding, vertically center. CTA pinned right (see heuristic below).
   - Square -> tall: uniform scale each layer by `sx` (width-constrained), then vertical stack: sort by `y`, stack top-to-bottom centered on x. CTA pinned bottom.
   - Wide/tall -> square (secondary in v1, same logic inverted): fit long axis, center short axis.
4. CTA heuristic v1: smallest `shape: pill|rect` layer, or rect with a text layer overlapping it, = CTA. CTA gets placement priority (right slot in wide, bottom slot in tall) and a minimum size floor (e.g. max(scaled size, 44px touch height equivalent scaled to ad height)).
5. Safety pass (always): clamp every layer inside artboard bounds; resolve hard overlaps by nudging along the packing axis; then auto-fit text (section 7).

Per-layer rules (never distort — one global rule, user-confirmed):
- All layers preserve aspect. No non-uniform `w*sx, h*sy` stretch except same-family case where source/target aspects are close (ratio delta < ~15%); otherwise uniform `s` + reflow.
- Honor existing `lockProportions` / `imageFit` fields on `Layer` (`apps/web/src/types.ts:140-144`).
- Background: color/gradient stretches trivially; background image = cover-crop to new artboard (center-crop).
- Image/sticker layers: cover their allocated box (crop overflow, never stretch). No per-layer logo-vs-photo distinction in v1.
- Effects scale by `s`: `radius`, `blur`, `strokeWidth`, `ShadowEffect{x,y,blur,spread}` (`apps/web/src/types.ts:19-26`), padding. Colors/opacity/rotation copied verbatim.
- Groups/masks: scale as units (children keep relative offsets), recompute group bounds via existing `computeGroupBounds`. Mask flags (`isMask`) preserved.
- Paths: scale points via existing `scaleVectorPoints` (`apps/web/src/lib/vector.ts:87-97`) and rebuild `pathData` with `buildSvgPath`.

## 7. Text auto-fit (user-confirmed)

- Initial `fontSize' = round(fontSize * s)`.
- Then shrink-to-fit loop using existing `estimateTextBoxSize` (`apps/web/src/lib/shadows.ts:104-129`): while estimated box wider than layer box or layer exceeds artboard, reduce `fontSize` (and if needed grow `h` with wrapping) until fits or floor reached (floor: 8px for display ads; flag layer if floored with overflow so UI can warn).
- Alignment preserved (`left|center|right`). Centered full-bleed template texts (`x==0, w==preset.w`) re-centered on target width.
- Keyframe `fontSize` values scaled by same factor, then clamped by the same fit result.

## 8. Animations in v1 (user-confirmed)

- Copy timing verbatim: `start`, `end`, `inAnim/outAnim` (+ rotate params), `duration`.
- Remap all spatial values through the same layer transform: base `x/y/w/h`, every `Keyframe{x,y,w,h}` (`apps/web/src/types.ts:51-73`), keyframed `fontSize/radius/blur/shadows/points`.
- No re-timing, no anim-type exclusions. Preset anim offsets (e.g. rise +28px, slide -48px in `apps/web/src/lib/keyframes.ts:143-377`) are positional deltas — scale them by `s` when generating keyframes post-scale, or remap already-generated keyframes. Implementation: if layer has `keyframes`, remap them; else copy preset anim fields through and let existing `convertAnimationToKeyframes` run at render time (verify offsets scale — may need a follow-up tweak).

## 9. Data / store changes

- `apps/web/src/types.ts`: add `AdSet { id, name, masterPresetId, variantIds / variants }`, extend `Layer` with `masterId?, layoutDetached?, contentDetached?`. Decide: `AdSet` holds `Project[]` vs `Record<presetId, Project>` — recommend array with `preset` per variant (reuses export, timeline, duration per variant).
- New `apps/web/src/lib/resize.ts`: `classifyShape`, `scaleAdSetLayers`, `autoFitText`, CTA detect, safety pass. Pure functions, unit-testable (note: `apps/web/moon.yml` test task has no backing script — use `bun` directly or add a script).
- New or extended sync helper (`lib/adsetSync.ts` or in store): `propagateContentEdit(masterLayer, variants)`, `markLayoutDetached`, `reapplyLayout`.
- `apps/web/src/store/editor.tsx`: state grows from single `project` to active variant + ad set; add actions `addVariant(preset)`, `switchVariant(id)`, `reapplyLayout`, `breakLink/relink`. Undo/redo (`HistoryEntry`) must scope per variant or snapshot whole ad set — recommend whole-ad-set snapshot for v1 simplicity.
- Home (`src/screens/Home.tsx`) + Editor (`src/screens/Editor.tsx`) + preset picker: multi-select UI + add-format sheet + switcher. Details to be specced at implementation time; keep mobile sheet patterns.

## 10. Acceptance criteria ("usable draft")

For each pair in the test matrix, after auto-scale with no manual edits:
- No layer extends outside the artboard; no two opaque layers overlap such that text is unreadable.
- No text clipping/overflow; CTA fully visible with >= minimum size.
- Same layer count, z-order, names, content (text/src), and animation types/timings as master.
- Background covers artboard with no gaps or distortion.
- Animated variants play/scrub without errors (`start/end` within duration).
- Manual smoke: move logo on variant -> `layoutDetached` set, then change logo src on master -> variant logo src updates, position stays.

## 11. Risks / unknowns

- Text measurement without DOM (canvas measure in `estimateTextBoxSize` needs document; fallback estimator needed for tests/background runs).
- Overlap resolution on ultra-thin 728x90 / 320x100 with 4+ layers may still need manual fixes — acceptable per "usable draft" but needs real-ad trials.
- Group/mask bounds after non-uniform reflow need verification against `computeGroupBounds`.
- `convertAnimationToKeyframes` hard-coded px offsets (rise 28, slide 48) are tuned for large canvases; small display ads may need proportional offsets.
- Store migration single-project -> ad set touches undo history, persistence mocks, export sheet.

## 12. Plan (suggested milestones)

1. Types + `lib/resize.ts` pure scaler (same-family + square->wide/tall + safety + text fit) with unit tests on mock layers.
2. Keyframe remapping + background/cover + effects scaling.
3. AdSet store wiring (add/switch/reapply/detach/sync) behind existing single-project UI.
4. Home multi-pick + editor switcher/add-format UI + detached badges.
5. Test-matrix pass on all 5 display sizes + fix loop; then PR.
