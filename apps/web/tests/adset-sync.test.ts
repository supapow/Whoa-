/**
 * Regression tests for `diffAndSync()` (linked-size sync).
 *
 * Covers scenarios A–E from `prds/linked-size-animation-sync-prd.md` §3/§9
 * plus the §6.1 `mode` / §6.2 `duration` assertions this fix adds.
 *
 * Run from `apps/web`: `bun test` (package.json `test` script; `moon run web:test`).
 * The file lives under `tests/`, which is excluded from `tsconfig.json` because
 * `bun:test` types are not installed (adding them would break `bun run lint`).
 */
import { describe, expect, test } from 'bun:test'
import type { AdSet, Keyframe, Layer, Project } from '#/types'
import { PRESETS, createLayer } from '#/lib/data'
import { breakLayerLink, createAdSet, diffAndSync, getMaster, relinkLayer } from '#/lib/adset'

const masterPreset = PRESETS[0] // Instagram Post 1080x1080 (master)
const sizePreset = PRESETS[3] // YouTube Thumbnail 1280x720 (linked size)

interface Ctx {
  adSet: AdSet
  project: Project
  activeId: string
}

/** 2-size ad set, one text layer, mode 'static', duration 5000 (PRD §2 repro). */
function setup(): Ctx {
  const layer = createLayer('text', masterPreset)
  const adSet = createAdSet([masterPreset, sizePreset], 'Sync Check', [layer])
  // Pin the PRD §2 premise: sizes created before any animation (mode 'static').
  // New ad sets default to animated (lib/data.ts); the sync tests exercise the
  // static → animated transition, so the static start is set explicitly here.
  adSet.variants = adSet.variants.map((v) => ({ ...v, mode: 'static' as const }))
  const project = getMaster(adSet)
  return { adSet, project, activeId: project.id }
}

/** Simulate one store action: mutate the active project, run the link diff. */
function act(ctx: Ctx, mutate: (p: Project) => Project): Ctx {
  const prev = ctx.project
  const next = mutate({ ...prev })
  const synced = diffAndSync(prev, next, ctx.adSet, ctx.activeId)
  return {
    activeId: ctx.activeId,
    project: synced.project,
    adSet: { ...ctx.adSet, variants: synced.variants, updatedAt: Date.now() },
  }
}

/** The store's `switchVariant`: active project becomes the chosen variant. */
function switchTo(ctx: Ctx, index: number): Ctx {
  const v = ctx.adSet.variants[index]
  return { ...ctx, activeId: v.id, project: v }
}

function editLayer(p: Project, layerId: string, patch: Partial<Layer>): Project {
  return { ...p, layers: p.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) }
}

const mLayerIdOf = (ctx: Ctx): string => ctx.adSet.variants[0].layers[0].id
const linkedLayer = (ctx: Ctx, masterId: string): Layer | undefined =>
  ctx.adSet.variants[1].layers.find((l) => l.masterId === masterId)

describe('diffAndSync — layer-level sync (unchanged behaviour)', () => {
  test('A: in/out animation pushes from master to a size created before it', () => {
    let ctx = setup()
    const mLayerId = mLayerIdOf(ctx)
    ctx = act(ctx, (p) => editLayer(p, mLayerId, { inAnim: 'fade', outAnim: 'slide' }))
    const vLayer = linkedLayer(ctx, mLayerId)
    expect(vLayer?.inAnim).toBe('fade')
    expect(vLayer?.outAnim).toBe('slide')
  })

  test('B: anim timing pushes; keyframes re-project onto the size box', () => {
    let ctx = setup()
    const mLayerId = mLayerIdOf(ctx)
    const kf: Keyframe = { id: 'kf1', time: 500, x: 400, y: 300, w: 200, h: 80, rotation: 0, opacity: 1 }
    ctx = act(ctx, (p) => editLayer(p, mLayerId, { anim: 'fade', start: 0, end: 3000, keyframes: [kf] }))
    const vLayer = linkedLayer(ctx, mLayerId)
    expect(vLayer?.anim).toBe('fade')
    expect(vLayer?.end).toBe(3000)
    expect(vLayer?.keyframes?.length).toBe(1)
    expect(vLayer?.keyframes?.[0].x).not.toBe(kf.x)
    expect(vLayer?.keyframes?.[0].time).toBe(kf.time)
  })

  test('D: contentDetached layer skips master pushes; Re-link restores (§7.5)', () => {
    let ctx = setup()
    const dLayerId = mLayerIdOf(ctx)
    const sizeId = ctx.adSet.variants[1].id
    const detachedId = linkedLayer(ctx, dLayerId)!.id
    ctx = act(ctx, (p) => editLayer(p, dLayerId, { inAnim: 'fade' }))
    ctx = { ...ctx, adSet: breakLayerLink(ctx.adSet, sizeId, detachedId) }
    ctx = act(ctx, (p) => editLayer(p, dLayerId, { inAnim: 'rise' }))
    expect(linkedLayer(ctx, dLayerId)?.inAnim).toBe('fade')
    ctx = { ...ctx, adSet: relinkLayer(ctx.adSet, sizeId, detachedId) }
    expect(linkedLayer(ctx, dLayerId)?.inAnim).toBe('rise')
  })

  test('E: add + content edit in one tick still skips per-layer sync (known §6.3 gap)', () => {
    let ctx = setup()
    const eLayerId = mLayerIdOf(ctx)
    const added = createLayer('shape', masterPreset)
    ctx = act(ctx, (p) => ({
      ...p,
      layers: [...p.layers.map((l) => (l.id === eLayerId ? { ...l, text: 'Edited' } : l)), added],
    }))
    expect(ctx.adSet.variants[1].layers.length).toBe(2)
    // Known gap (PRD §6.3): the bundled text edit is not pushed.
    expect(linkedLayer(ctx, eLayerId)?.text).not.toBe('Edited')
  })
})

describe('diffAndSync — scalars (this fix)', () => {
  test('C1: mode follows master onto every variant (§6.1)', () => {
    let ctx = setup()
    ctx = act(ctx, (p) => ({ ...p, mode: 'animated' }))
    expect(ctx.adSet.variants[0].mode).toBe('animated')
    expect(ctx.adSet.variants[1].mode).toBe('animated')
    // ExportSheet formats derive from mode — every size must agree.
    expect(ctx.adSet.variants.every((v) => v.mode === 'animated')).toBe(true)
  })

  test('C2: mode flipped on a linked size mirrors back to master (§6.1)', () => {
    let ctx = switchTo(setup(), 1)
    ctx = act(ctx, (p) => ({ ...p, mode: 'animated' }))
    expect(ctx.project.mode).toBe('animated')
    expect(ctx.adSet.variants[0].mode).toBe('animated')
  })

  test('C3: duration follows master onto the linked size (§6.2)', () => {
    let ctx = setup()
    ctx = act(ctx, (p) => ({ ...p, duration: 8000 }))
    expect(ctx.adSet.variants[1].duration).toBe(8000)
  })

  test('C4: a size-local duration edit stays local (§6.2)', () => {
    let ctx = switchTo(setup(), 1)
    ctx = act(ctx, (p) => ({ ...p, duration: 2000 }))
    expect(ctx.adSet.variants[0].duration).toBe(5000)
    expect(ctx.project.duration).toBe(2000)
  })

  test('C5: mode/duration still sync on a tick that also adds a layer (early return)', () => {
    let ctx = setup()
    const fresh = createLayer('shape', masterPreset)
    ctx = act(ctx, (p) => ({ ...p, mode: 'animated', duration: 6000, layers: [...p.layers, fresh] }))
    expect(ctx.adSet.variants[1].layers.length).toBe(2)
    expect(ctx.adSet.variants[1].mode).toBe('animated')
    expect(ctx.adSet.variants[1].duration).toBe(6000)
  })

  test('F: variant identity stays stable when nothing changed', () => {
    const ctx = setup()
    const before = ctx.adSet.variants[1]
    const unchanged = diffAndSync(ctx.project, { ...ctx.project }, ctx.adSet, ctx.activeId)
    expect(unchanged.variants[1]).toBe(before)

    const modeFlip = diffAndSync(ctx.project, { ...ctx.project, mode: 'animated' }, ctx.adSet, ctx.activeId)
    expect(modeFlip.variants[1]).not.toBe(before)
    expect(modeFlip.variants[1].mode).toBe('animated')
    expect(modeFlip.project.mode).toBe('animated')
  })
})
