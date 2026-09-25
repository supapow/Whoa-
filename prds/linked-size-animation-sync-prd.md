# Whoa! — In/Out animations must follow master on linked sizes (PRD)

Status: diagnosis complete, fix not implemented
Scope: `apps/web` (ad set sync + canvas gating). No UI redesign.
App: Whoa! (mobile-first)
Diagnosed: 2026-09-25, verified live on `http://localhost:3000`

---

## 1. Problem

**Report:** in/out animations do not follow master onto linked sizes when the animations are
created *after* the linked sizes were created. Animation *data* is copied correctly — the linked
size's Animate panel shows the same preset selected — but nothing animates when you look at that
size.

**One-line root cause:** `Project.mode` (`'static' | 'animated'`) is per-size state that
`diffAndSync()` never syncs, and the canvas refuses to evaluate *any* animation unless
`mode === 'animated'`.

Order matters because `mode` is only copied from master **at size-creation time**
(`createAdSet` / `addVariant`). A size created before the animation exists inherits
`mode: 'static'` and stays that way forever; a size created after inherits `'animated'` and works.

## 2. Reproduction (verified in browser)

1. Home → New Banner → **Multi-size** → pick `Instagram Post` (1st = master) + `YouTube Thumbnail`
   → *Create ad set (2)*.
2. On master: add a Text layer → **Animate** → **Fade In**.
3. Open the timeline on master so `time > 0` or the timeline is open, and look at the layer:
   opacity `0` at `0.0s` → the fade-in is running. Export sheet offers **MP4 / GIF / PNG**
   (= `mode: 'animated'`).
4. Switch to **YouTube Thumbnail** (the size created *before* the animation). Timeline open,
   time `0.0s`:
   - Animate panel shows **Fade In selected** ✅ (data propagated)
   - layer opacity `1`, transform `none` ❌ (animation never evaluated)
   - Export sheet offers **PNG / JPG / SVG** (= `mode: 'static'`) ❌
5. Control: from the same (now animated) master, *add a new size* (`add-size-ig-story`) →
   new size renders the fade-in (opacity `0`) because `addVariant` copied `master.mode`.

## 3. Evidence

| Size | created | `Project.mode` | Export formats | layer opacity @0.0s, timeline open |
|---|---|---|---|---|
| Master 1080×1080 | — | `animated` | MP4 / GIF / PNG | **0** (fade-in running) |
| 1280×720 (YouTube) | **before** the anim | `static` | PNG / JPG / SVG | **1** (anim ignored) |
| 1080×1920 (Story) | **after** the anim | `animated` | MP4 / GIF / PNG | **0** (works) |

Unit-level checks against `diffAndSync()` (see §9) confirm:
- `inAnim` / `outAnim` / `anim` patches **do** propagate master → linked sizes (A, B) ✅
- `mode` and `duration` are **not** propagated (C) ❌
- a layer with `contentDetached` is skipped by design (D) ✅ (intended)
- a master action that adds/removes a layer in the same tick skips *all* per-layer sync (E) ❌

## 4. Code map (where it breaks)

| Concern | Location |
|---|---|
| Layer-level sync (works) | `apps/web/src/lib/adset.ts` — `diffAndSync()` L241-333, `CONTENT_SYNC_KEYS` L6-32 (`anim`, `inAnim`, `outAnim`, rotate params), `ANIM_SYNC_KEYS` L39-43 (`start`, `end`, `keyframes`) |
| Keyframe re-projection (works) | `apps/web/src/lib/resize.ts` — `remapKeyframesToBounds()` L91-116 |
| Project scalars that *do* sync | `adset.ts` L250-253: only `background`. Comment already claims "scalar project fields follow master" — never implemented for `mode`/`duration`. |
| **Gap 1 — `mode` never synced** | `adset.ts` `diffAndSync()` returns after handling background/layers; `Project.mode` is untouched on variants |
| **Gap 2 — `duration` never synced** | same function; `createAdSet` L127 and `addVariant` L141 copy `duration` only at creation |
| **Gap 3 — early return skips per-layer sync** | `adset.ts` L254-269: `if (onMaster && (added.length > 0 \|\| removedIds.length > 0 \|\| bgChanged))` returns before the per-layer loop, so an anim/content edit bundled with a layer add/remove never reaches linked sizes |
| Canvas gate | `apps/web/src/components/editor/Canvas.tsx` L1211 `const active = mode === 'animated' && (playing \|\| time > 0 \|\| timelineOpen)`; L53 `if (!active) return { opacity: layer.opacity, ... }` (resting state) |
| Where `mode` flips | `store/editor.tsx` L904 (`setMode` action), L584-588 (`addLayer` auto-flip when the new layer ships an anim), `components/editor/Panels.tsx` L3003 (`previewAnim()` → `setMode('animated')` when you pick an in/out preset) |
| Where `mode` is read | `store/editor.tsx` L1585 `mode: state.project.mode` → `Ctx.mode` → Canvas |
| Size creation copies scalars once | `lib/adset.ts` `createAdSet` L118-132, `addVariant` L135-144 (`v.duration`, `v.mode`) |
| Dead UI | `components/editor/TopBar.tsx` static/animated toggle — **imported nowhere**, so `mode` can never be changed by the user, only by animation entry points |

Related prior work: commit `f7ff37a` "fix(scaling): propagate master animations to linked sizes"
(classified `start/end/keyframes` as sync keys + re-projected keyframes). This PRD covers what
that fix did *not* reach: project-level fields.

## 5. Goals / non-goals

Goals:
- A linked size created **before** an animation was added renders that animation exactly like the
  master does (same gate, same timing), for in-animations, out-animations, and keyframe anims.
- `duration` on every linked size matches master so `layer.end` (which *is* synced) never falls
  outside the size's own timeline (otherwise out-animations are clipped on export).
- No regression to the existing detach model: `layoutDetached` / `contentDetached` semantics,
  re-apply, break-link/re-link stay exactly as they are.

Non-goals:
- No change to *which* layer fields sync, and no change to `remapKeyframesToBounds` behaviour.
- No per-size static/animated toggle (there is no UI for it today; `TopBar` is dead code).
- No new backend/persistence — still in-memory mock data.

## 6. Proposed design

### 6.1 `mode` becomes an ad-set-wide flag (recommended)

`mode` answers "is this creative animated?" — it is not a per-size layout property, and there is no
way for a user to set it per size (only `previewAnim()` and `addLayer` ever touch it). So whichever
variant flips it, every variant in the ad set must follow.

In `diffAndSync()` (`lib/adset.ts`), alongside the existing `bgChanged` handling:

```ts
const modeChanged = prev.mode !== next.mode
// active project keeps next.mode; every other variant (master included) mirrors it
```

- Active = master → push `next.mode` to all variants (same shape as the `bgChanged` branch).
- Active = a size → also push to master + siblings (a `previewAnim()` on a size must not leave the
  master stuck in `static`, or the mirror bug reappears on the master).
- Only write when `modeChanged` is true, so variant object identity stays stable for React and
  undo snapshots.

### 6.2 `duration` follows master only

Treat it like `background` (already documented as "scalar project fields follow master"):
when `onMaster && prev.duration !== next.duration`, copy `next.duration` to every variant.
Variant-local duration edits are not part of the detach model today; leave them local, they are
overwritten the next time master changes duration. (Alternative — sync duration both ways like
`mode` — is acceptable if implementer prefers symmetry; call it out in the PR.)

### 6.3 Early-return gap (optional, same PR or follow-up)

`adset.ts` L254-269 returns before the per-layer loop whenever the master action also added or
removed a layer. Fix: run the add/remove propagation first, then run `contentUpdates` against the
resulting variant layers instead of returning early. Lower priority — it needs an action that
touches layer sets *and* content in the same tick.

### 6.4 Alternatives considered

- **B — push master `mode` to variants only (minimal):** fixes the reported case but leaves the
  mirror case broken (add an animation while on a linked size → master never plays it).
- **C — hoist `mode` off `Project` into `AdSet` / UI state:** cleanest model, but touches
  `types.ts`, history snapshots, export sheet, and every reader; not worth it while there is no
  mode UI. Revisit if a visible static/animated toggle ships.

## 7. Acceptance criteria

Browser (mobile viewport first):
1. Ad set with sizes created **before** any animation: add Fade In + Slide Out on master →
   switch to each linked size → timeline open, `0.0s` → layer opacity `0`; scrub to mid-life →
   resting; near `end` → out-anim runs.
2. Export formats on **every** size are `MP4 / GIF / PNG` once master is animated.
3. Add an animation while a **linked size** is active → master also becomes animated and plays it.
4. Change duration on master → linked size timelines show the same total (`time-display`).
5. Existing detach behaviour unchanged: edit text on a size (`contentDetached`) → master in/out
   anim changes no longer push to that layer; *Re-link* restores them.
6. Undo/redo across a mode change restores all sizes consistently (history stores whole `AdSet`).

Unit (no runner exists yet — `apps/web/moon.yml`'s `test` task has no backing script):
- Assert `diffAndSync()` propagates `mode`, and `duration` master → variants, in both the
  "master edit" and "size edit" paths; assert variant identity is untouched when nothing changed.

## 8. Risks / open questions

- `ExportSheet` derives formats from `mode` (`formats = mode === 'animated' ? …`) — after the fix
  every size of an animated ad set exports MP4/GIF; confirm that is the desired product behaviour
  (it should be — master and size must produce the same creative).
- Syncing `mode` on *any* variant change means an ad set becomes "animated" permanently the moment
  any animation exists anywhere; there is no un-flip path today (choosing *None* in the Animate
  panel does not set `mode` back). Decide: leave as-is (recommended) or add "downgrade to static
  when no layer has an anim".
- `updatedAt` churn: writing `mode`/`duration` to every variant bumps `Date.now()` per variant —
  harmless, but keep it inside the `modeChanged` guard.
- Open question: should a *variant*-side duration edit detach, sync to master, or stay local?
  Current proposal keeps it local (§6.2).
- **§7.3 only half-holds after §6.1:** adding an animation while a size is active *does* make
  master animated (mode mirrors, export formats match), but master does not **play** it — anim
  data flows master → size only, and a size-side edit marks `contentDetached`, which §5 pins as
  out of scope. Verified in the browser: master's Animate panel shows *None*, layer opacity stays
  `1` at `0.0s`. Making master play size-authored animations is separate work (reverse content
  sync) and was not done here.
- **§7.4 has no UI:** `setDuration` is dispatched by no component today, so duration sync is
  only covered by the unit tests (C3/C4) — it cannot be exercised in the browser.

## 9. Test assets

- **Regression tests ship as `apps/web/tests/adset-sync.test.ts`** (`bun test`) — scenarios A–E
  from §3 plus the §6.1 `mode` / §6.2 `duration` assertions, run with
  `cd apps/web && bun run test` (or `moon run web:test`). The original diagnostic was a plain
  `bun run` script (`apps/web/scripts/sync-check.ts`); when implementing, it was folded into
  `bun test` instead of deleted. `apps/web/tests/` is excluded from `tsconfig.json` because
  `bun:test` types are not installed (adding them would leak Bun globals into the app's
  type-check), so `bun run lint` stays at the pre-existing baseline.
- Manual repro steps are in §2; both the master and the linked size must be measured at
  `time-display = 0.0s` with the timeline open, otherwise `active` is false for unrelated reasons
  (`active = mode === 'animated' && (playing || time > 0 || timelineOpen)`).

## 10. Suggested implementation steps

1. Branch `fix/linked-size-anim-mode-sync` off `main`.
2. `lib/adset.ts`: add `modeChanged` handling (§6.1) + `duration` master push (§6.2) inside
   `diffAndSync()`; update the L230-240 doc comment (it already promises scalar sync).
3. Re-create the §9 diagnostic covering scenarios A–E plus `mode`/`duration` assertions, run it.
4. Manual pass over the 6 acceptance criteria in §7 (mobile viewport first).
5. `bun run lint` — the baseline on `main` already fails with ~55 pre-existing errors
   (`Layer.shadowEnabled` / `innerShadow*` missing from `types.ts`, in `Toolbar.tsx`,
   `textToVector.ts`, `vector.ts`); require **no new** errors rather than exit 0, or fix that
   baseline first.
   → commit `fix(editor): sync mode and duration from master to linked sizes`.
6. Optional follow-up issue for the early-return gap (§6.3).
