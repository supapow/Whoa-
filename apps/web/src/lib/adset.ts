import type { AdSet, Layer, Preset, Project } from '#/types'
import { uid, newProject } from '#/lib/data'
import { scaleLayersToPreset, scaleSingleLayer } from '#/lib/resize'

/** Fields that sync from master to linked variant layers (content + style). */
export const CONTENT_SYNC_KEYS = [
  'text',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'color',
  'align',
  'fill',
  'fillGradient',
  'stroke',
  'src',
  'emoji',
  'imagePosition',
  'imageFit',
  'opacity',
  'visible',
  'locked',
  'anim',
  'inAnim',
  'outAnim',
  'inRotateStart',
  'inRotateEnd',
  'inRotateMs',
  'outRotateStart',
  'outRotateEnd',
  'outRotateMs',
] as const

/** Fields that are per-size layout (detach on variant edit, never auto-push). */
export const LAYOUT_KEYS = [
  'x',
  'y',
  'w',
  'h',
  'rotation',
  'scale',
  'crop',
  'points',
  'pathData',
  'radius',
  'blur',
  'blurType',
  'blurFade',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'dropShadow',
  'innerShadow',
  'start',
  'end',
  'keyframes',
  'groupId',
  'isMask',
  'type',
] as const

type Key = keyof Layer

const CONTENT_SET = new Set<string>(CONTENT_SYNC_KEYS)
const LAYOUT_SET = new Set<string>(LAYOUT_KEYS)

function changedKeys(a: Layer, b: Layer): Key[] {
  const out: Key[] = []
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (k === 'id' || k === 'masterId' || k === 'layoutDetached' || k === 'contentDetached') continue
    const av = (a as unknown as Record<string, unknown>)[k]
    const bv = (b as unknown as Record<string, unknown>)[k]
    if (JSON.stringify(av) !== JSON.stringify(bv)) out.push(k as Key)
  }
  return out
}

export function getMaster(adSet: AdSet): Project {
  return adSet.variants[0]
}

export function isMasterVariant(adSet: AdSet, variantId: string): boolean {
  return adSet.variants[0]?.id === variantId
}

export function findVariant(adSet: AdSet, variantId: string): Project | undefined {
  return adSet.variants.find((v) => v.id === variantId)
}

/** A layer counts as a master layer when it has no foreign masterId. */
function masterKeyOf(l: Layer): string {
  return l.masterId ?? l.id
}

export function adSetFromProject(p: Project): AdSet {
  return { id: uid(), name: p.name, masterPresetId: p.preset.id, variants: [p], updatedAt: Date.now() }
}

/**
 * Build an ad set from presets. The first preset is the master; its layers
 * seed every other variant through the scaler. Master layers may be empty
 * (blank creation flow) — scaling an empty list yields empty variants.
 */
export function createAdSet(presets: Preset[], name = 'Untitled Banner', masterLayers: Layer[] = []): AdSet {
  const [masterPreset, ...rest] = presets
  const master = newProject(masterPreset, name)
  master.layers = masterLayers
  const variants: Project[] = [master]
  for (const preset of rest) {
    const v = newProject(preset, name)
    v.background = { ...master.background }
    v.layers = scaleLayersToPreset(masterLayers, masterPreset, preset)
    v.duration = master.duration
    v.mode = master.mode
    variants.push(v)
  }
  return { id: uid(), name, masterPresetId: masterPreset.id, variants, updatedAt: Date.now() }
}

/** Scale master layers into a new variant and append it. No-op when preset exists. */
export function addVariant(adSet: AdSet, preset: Preset): AdSet {
  if (adSet.variants.some((v) => v.preset.id === preset.id)) return adSet
  const master = getMaster(adSet)
  const v = newProject(preset, adSet.name)
  v.background = { ...master.background }
  v.layers = scaleLayersToPreset(master.layers, master.preset, preset)
  v.duration = master.duration
  v.mode = master.mode
  return { ...adSet, variants: [...adSet.variants, v], updatedAt: Date.now() }
}

export function removeVariant(adSet: AdSet, variantId: string): AdSet {
  if (isMasterVariant(adSet, variantId)) return adSet
  return { ...adSet, variants: adSet.variants.filter((v) => v.id !== variantId), updatedAt: Date.now() }
}

/**
 * Re-run the scaler for one variant. Layers the user customized on the
 * variant (contentDetached) keep their content; fully custom layers
 * (no masterId) are preserved and clamped into bounds.
 */
export function reapplyVariantLayout(adSet: AdSet, variantId: string): AdSet {
  const master = getMaster(adSet)
  const variant = findVariant(adSet, variantId)
  if (!variant || isMasterVariant(adSet, variantId)) return adSet
  const prevByMaster = new Map<string, Layer>()
  for (const l of variant.layers) {
    if (l.masterId) prevByMaster.set(l.masterId, l)
  }
  const customs = variant.layers.filter((l) => !l.masterId)
  const fresh = scaleLayersToPreset(master.layers, master.preset, variant.preset)
  const merged = fresh.map((l) => {
    const prev = l.masterId ? prevByMaster.get(l.masterId) : undefined
    if (prev?.contentDetached) {
      const restored: Layer = { ...l }
      for (const k of CONTENT_SET) {
        ;(restored as unknown as Record<string, unknown>)[k] = (prev as unknown as Record<string, unknown>)[k]
      }
      restored.contentDetached = true
      return restored
    }
    return l
  })
  for (const c of customs) {
    merged.push({
      ...c,
      x: Math.max(0, Math.min(variant.preset.w - c.w, c.x)),
      y: Math.max(0, Math.min(variant.preset.h - c.h, c.y)),
    })
  }
  const variants = adSet.variants.map((v) =>
    v.id === variantId ? { ...v, layers: merged, updatedAt: Date.now() } : v,
  )
  return { ...adSet, variants, updatedAt: Date.now() }
}

export function breakLayerLink(adSet: AdSet, variantId: string, layerId: string): AdSet {
  const variants = adSet.variants.map((v) =>
    v.id !== variantId
      ? v
      : {
          ...v,
          layers: v.layers.map((l) =>
            l.id === layerId ? { ...l, layoutDetached: true, contentDetached: true } : l,
          ),
        },
  )
  return { ...adSet, variants, updatedAt: Date.now() }
}

/** Re-link one layer: re-scale it from its master counterpart. */
export function relinkLayer(adSet: AdSet, variantId: string, layerId: string): AdSet {
  const master = getMaster(adSet)
  const variant = findVariant(adSet, variantId)
  if (!variant) return adSet
  const current = variant.layers.find((l) => l.id === layerId)
  const source = current?.masterId ? master.layers.find((l) => masterKeyOf(l) === current.masterId) : undefined
  if (!current || !source) return adSet
  const scaled = scaleSingleLayer(source, master.preset.w, master.preset.h, variant.preset.w, variant.preset.h)
  scaled.id = current.id // keep selection / z-order stable
  const variants = adSet.variants.map((v) =>
    v.id !== variantId ? v : { ...v, layers: v.layers.map((l) => (l.id === layerId ? scaled : l)) },
  )
  return { ...adSet, variants, updatedAt: Date.now() }
}

export interface DiffResult {
  project: Project
  variants: Project[]
}

/**
 * Generic layer diff between the pre- and post-action active project.
 * - Master edits: added layers propagate (scaled) to variants; removed
 *   master layers delete linked variant layers; content changes push to
 *   linked (!contentDetached) variant layers. Layout changes stay local.
 * - Variant edits: layout changes set layoutDetached, content changes set
 *   contentDetached on the edited layers.
 * Returns the updated active project plus updated other-variants.
 */
export function diffAndSync(prev: Project, next: Project, adSet: AdSet, activeId: string): DiffResult {
  const prevById = new Map(prev.layers.map((l) => [l.id, l]))
  const nextById = new Map(next.layers.map((l) => [l.id, l]))
  const onMaster = isMasterVariant(adSet, activeId)
  let project = next

  const added = next.layers.filter((l) => !prevById.has(l.id))
  const removedIds = prev.layers.filter((l) => !nextById.has(l.id)).map((l) => l.id)

  // Background + scalar project fields follow master.
  let bgChanged = false
  if (onMaster && JSON.stringify(prev.background) !== JSON.stringify(next.background)) bgChanged = true

  if (onMaster && (added.length > 0 || removedIds.length > 0 || bgChanged)) {
    const removedMasterKeys = new Set(
      prev.layers.filter((l) => removedIds.includes(l.id)).map((l) => masterKeyOf(l)),
    )
    const variants = adSet.variants.map((v) => {
      if (v.id === activeId) return next
      let layers = v.layers.filter((l) => !(l.masterId && removedMasterKeys.has(l.masterId)))
      for (const a of added) {
        // Skip internal group-box layers of a fresh group op? They render
        // nothing without children — still propagate so re-apply stays exact.
        layers = [...layers, scaleSingleLayer(a, prev.preset.w, prev.preset.h, v.preset.w, v.preset.h)]
      }
      return { ...v, background: bgChanged ? { ...next.background } : v.background, layers }
    })
    return { project: next, variants }
  }

  // Per-layer updates.
  const contentUpdates: { key: string; patch: Partial<Layer> }[] = []
  let activeLayers = next.layers
  for (const l of next.layers) {
    const p = prevById.get(l.id)
    if (!p) continue
    const changed = changedKeys(p, l)
    if (changed.length === 0) continue
    const isContent = changed.some((k) => CONTENT_SET.has(k))
    const isLayout = changed.some((k) => LAYOUT_SET.has(k))
    if (onMaster) {
      if (isContent) {
        const patch: Partial<Layer> = {}
        for (const k of changed) {
          if (CONTENT_SET.has(k)) (patch as Record<string, unknown>)[k] = (l as unknown as Record<string, unknown>)[k]
        }
        contentUpdates.push({ key: masterKeyOf(l), patch })
      }
    } else {
      activeLayers = activeLayers.map((x) =>
        x.id !== l.id
          ? x
          : {
              ...x,
              layoutDetached: x.layoutDetached || isLayout || undefined,
              contentDetached: x.contentDetached || isContent || undefined,
            },
      )
    }
  }
  project = { ...next, layers: activeLayers }

  if (contentUpdates.length === 0) {
    const variants = adSet.variants.map((v) => (v.id === activeId ? project : v))
    return { project, variants }
  }
  const variants = adSet.variants.map((v) => {
    if (v.id === activeId) return project
    let layers = v.layers
    for (const u of contentUpdates) {
      layers = layers.map((l) =>
        l.masterId === u.key && !l.contentDetached ? { ...l, ...u.patch } : l,
      )
    }
    return { ...v, layers }
  })
  return { project, variants }
}
