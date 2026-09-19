import { useRef, useState, useEffect } from 'react'
import {
  X, Upload, Type as TypeIcon, Folder, FolderPlus,
  Component as ComponentIcon, ChevronRight, ChevronLeft, ChevronDown, Plus, Trash2,
  Lock, Unlock, CircleDot, Diamond, Droplet, PenTool, Spline,
} from 'lucide-react'
import { useEditor } from '#/store/editor'
import type { ShapeKind, Layer } from '#/types'
import { hasKeyframeAt, getAdjacentKeyframes, interpolateKeyframes } from '#/lib/keyframes'
import {
  FONTS, PALETTE, GRADIENTS, BG_IMAGES, STOCK_IMAGES, STICKERS, SHAPES,
} from '#/lib/data'
import { getLibraryComponents, deleteComponentFromLibrary, type ComponentItem } from '#/lib/groups'
import { VECTOR_PRESETS, convertShapeToVector, buildSvgPath, tightenVectorLayer } from '#/lib/vector'

const TITLES: Record<string, string> = {
  text: 'Add Text', elements: 'Elements', stickers: 'Stickers', image: 'Image',
  components: 'Components Library',
  background: 'Background', layers: 'Layers', font: 'Font', color: 'Color',
  blur: 'Blur & Effects',
  style: 'Text Style', align: 'Alignment', shape: 'Shape', radius: 'Corner Radius',
  animate: 'Animation', mask: 'Mask & Cut', crop: 'Crop',
  vector: 'Vector Path & Béziers',
}

export default function ToolSheet() {
  const { tool, openTool } = useEditor()
  if (!tool) return null
  return (
    <div className="absolute inset-0 z-60 flex flex-col justify-end" data-testid="tool-sheet">
      <div className="absolute inset-0 bg-black/40 animate-fade" onClick={() => openTool(null)} />
      <div className="animate-sheet relative max-h-[82vh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface pb-8 no-scrollbar">
        <div className="sticky top-0 flex items-center justify-between bg-surface px-5 pt-4 pb-3 z-10">
          <h3 className="text-lg font-bold">{TITLES[tool] || 'Options'}</h3>
          <button onClick={() => openTool(null)} data-testid="sheet-close" className="grid h-8 w-8 place-items-center rounded-full bg-surface2 text-txt2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5">
          <PanelBody tool={tool} />
        </div>
      </div>
    </div>
  )
}

function PanelBody({ tool }: { tool: string }) {
  const { selected } = useEditor()
  const needsLayer = ['font', 'color', 'blur', 'style', 'align', 'shape', 'radius', 'animate', 'mask', 'crop', 'vector']
  if (needsLayer.includes(tool) && !selected) {
    return <MockPanel text="Select a layer on the canvas first." />
  }
  switch (tool) {
    case 'text': return <TextAdd />
    case 'elements': return <Elements />
    case 'stickers': return <Stickers />
    case 'image': return <Images />
    case 'components': return <ComponentsPanel />
    case 'background': return <BackgroundPanel />
    case 'layers': return <LayersPanel />
    case 'font': return <FontPanel />
    case 'color': return <ColorPanel />
    case 'blur': return <BlurPanel />
    case 'style': return <StylePanel />
    case 'align': return <AlignPanel />
    case 'shape': return <ShapePanel />
    case 'radius': return <RadiusPanel />
    case 'vector': return <VectorPanel />
    case 'animate': return <AnimatePanel />
    case 'mask': return <MaskPanel />
    case 'crop': return <MockPanel text="Pinch & drag on canvas to crop — full crop tool coming with the backend." />
    default: return null
  }
}

/* ---------- Grid helper ---------- */
function Grid({ children, cols = 4 }: { children: React.ReactNode; cols?: number }) {
  return <div className={`grid gap-3 pb-4`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>{children}</div>
}

/* ---------- Add panels ---------- */
function TextAdd() {
  const { addLayer, project } = useEditor()
  const presets = [
    { label: 'Add a heading', size: 0.11, weight: 800 },
    { label: 'Add a subheading', size: 0.07, weight: 700 },
    { label: 'Add body text', size: 0.045, weight: 500 },
  ]
  return (
    <div className="space-y-3 pb-4">
      {presets.map((p) => (
        <button
          key={p.label}
          data-testid={`add-text-${p.weight}`}
          onClick={() => addLayer('text', { text: p.label, fontSize: Math.round(project.preset.w * p.size), fontWeight: p.weight })}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface2 px-4 py-4 text-left transition-colors active:border-accent"
          style={{ fontWeight: p.weight, fontSize: 16 + (p.weight - 500) / 30 }}
        >
          <TypeIcon className="h-5 w-5 text-txt2" />
          {p.label}
        </button>
      ))}
    </div>
  )
}

function Elements() {
  const { addLayer, openTool } = useEditor()
  const [filter, setFilter] = useState<'all' | 'basic' | 'geometric' | 'symbol' | 'arrow' | 'organic'>('all')
  const labels: Record<ShapeKind, string> = { rect: 'Square', circle: 'Circle', triangle: 'Triangle', star: 'Star', line: 'Line' }

  const filteredVectorPresets = filter === 'all'
    ? VECTOR_PRESETS
    : VECTOR_PRESETS.filter((vp) => vp.category === filter || (filter === 'basic' && vp.isBasic))

  return (
    <div className="pb-6">
      {/* 2-Column Side-by-Side Layout: Minimalist, clean, borderless */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 items-start">
        {/* COLUMN 1: CSS Shapes */}
        <div className="sticky top-0 self-start">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-txt3">CSS Shapes</span>
            <span className="text-[10px] text-txt3">5</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {SHAPES.map((s) => (
              <button
                key={s}
                data-testid={`add-shape-${s}`}
                id={`add-shape-${s}`}
                aria-label={labels[s]}
                title={labels[s]}
                onClick={() => addLayer('shape', { shape: s })}
                className={`grid place-items-center rounded-2xl bg-surface2 transition-all hover:bg-surface2/75 active:scale-90 cursor-pointer ${
                  s === 'line' ? 'col-span-2 h-14' : 'aspect-square'
                }`}
              >
                <ShapeGlyph kind={s} />
              </button>
            ))}
          </div>
        </div>

        {/* COLUMN 2: Vector Shapes */}
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-txt3">Vector Shapes</span>
            <span className="text-[10px] text-indigo-400 font-medium">{VECTOR_PRESETS.length}</span>
          </div>

          {/* Minimalist Filter Chips */}
          <div className="mb-2 flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-[10px]">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'basic', label: 'Basic' },
                { id: 'geometric', label: 'Polygons' },
                { id: 'symbol', label: 'Symbols' },
                { id: 'arrow', label: 'Arrows' },
                { id: 'organic', label: 'Organic' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFilter(cat.id)}
                className={`shrink-0 rounded-lg px-2 py-0.5 text-[9px] font-semibold transition-colors ${
                  filter === cat.id
                    ? 'bg-accent text-white'
                    : 'bg-surface2 text-txt3 hover:text-txt2'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Grid of Vector Shapes without borders or text names */}
          <div className="grid grid-cols-2 gap-2">
            {filteredVectorPresets.map((vp) => (
              <button
                key={vp.id}
                data-testid={`add-vector-${vp.id}`}
                id={`add-vector-${vp.id}`}
                aria-label={vp.name}
                title={vp.name}
                onClick={() => {
                  const isSquare = vp.defaultW === vp.defaultH || (!vp.defaultW && (vp.isBasic || vp.id === 'heart' || vp.id === 'shield' || vp.id === 'sparkle' || vp.id === 'flower'))
                  const w = vp.defaultW || (isSquare ? 160 : 180)
                  const h = vp.defaultH || (isSquare ? 160 : (vp.id === 'line' ? 30 : 135))
                  addLayer('path', {
                    name: vp.name,
                    w,
                    h,
                    closed: vp.closed,
                    stroke: vp.strokeWidth ? '#007AFF' : undefined,
                    strokeWidth: vp.strokeWidth || 0,
                    fill: vp.closed ? '#007AFF' : 'transparent',
                    points: vp.getPoints(w, h),
                  })
                  openTool(null)
                }}
                className={`grid place-items-center rounded-2xl bg-surface2 transition-all hover:bg-surface2/75 active:scale-90 cursor-pointer ${
                  vp.id === 'line' ? 'col-span-2 h-14' : 'aspect-square'
                }`}
              >
                <svg viewBox="0 0 100 100" className="h-8 w-8">
                  <path
                    d={buildSvgPath(vp.getPoints(80, 80), vp.closed, 80, 80)}
                    transform="translate(10, 10)"
                    fill={vp.closed ? '#818cf8' : 'none'}
                    stroke="#818cf8"
                    strokeWidth={vp.strokeWidth ? 6 : 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ShapeGlyph({ kind }: { kind: ShapeKind }) {
  const c = 'h-8 w-8 bg-white'
  if (kind === 'circle') return <div className={`${c} rounded-full`} />
  if (kind === 'triangle') return <div style={{ width: 0, height: 0, borderLeft: '16px solid transparent', borderRight: '16px solid transparent', borderBottom: '28px solid #fff' }} />
  if (kind === 'star') return <div className="h-8 w-8 bg-white" style={{ clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }} />
  if (kind === 'line') return <div className="h-1.5 w-12 rounded-full bg-white" />
  return <div className={`${c} rounded-lg`} />
}

function Stickers() {
  const { selected, addLayer, updateLayer, openTool } = useEditor()
  const pick = (emoji: string) => {
    if (selected && selected.type === 'sticker') { updateLayer(selected.id, { emoji }); openTool(null) }
    else addLayer('sticker', { emoji })
  }
  return (
    <Grid cols={5}>
      {STICKERS.map((s) => (
        <button
          key={s}
          data-testid={`sticker-${s}`}
          onClick={() => pick(s)}
          className="grid aspect-square place-items-center rounded-2xl border border-line bg-surface2 text-3xl transition-colors active:border-accent"
        >
          {s}
        </button>
      ))}
    </Grid>
  )
}

function Images() {
  const { selected, addLayer, updateLayer, openTool } = useEditor()
  const fileRef = useRef<HTMLInputElement>(null)
  const apply = (src: string) => {
    if (selected && selected.type === 'image') { updateLayer(selected.id, { src }); openTool(null) }
    else addLayer('image', { src })
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => apply(r.result as string)
    r.readAsDataURL(f)
  }

  const isImageSelected = Boolean(selected && selected.type === 'image')
  const isLocked = isImageSelected ? Boolean(selected?.lockProportions) : false

  return (
    <div className="pb-4">
      {isImageSelected && selected && (
        <div
          id="image-lock-proportions-container"
          data-testid="image-lock-proportions-container"
          className="mb-4 flex items-center justify-between rounded-2xl border border-line bg-surface2 px-4 py-3"
        >
          <div className="flex items-center gap-2.5">
            <div className={`grid h-8 w-8 place-items-center rounded-xl transition-colors ${isLocked ? 'bg-accent/20 text-accent' : 'bg-surface text-txt3'}`}>
              {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </div>
            <div>
              <div className="text-sm font-semibold text-txt">Lock proportions</div>
              <div className="text-[11px] text-txt3">Maintain aspect ratio while resizing</div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isLocked}
            id="lock-proportions-toggle"
            data-testid="lock-proportions-toggle"
            aria-label={isLocked ? 'Unlock proportions' : 'Lock proportions'}
            title={isLocked ? 'Unlock proportions' : 'Lock proportions'}
            onClick={() => {
              const next = !isLocked
              updateLayer(selected.id, {
                lockProportions: next,
                ...(next ? { aspectRatio: selected.h > 0 ? selected.w / selected.h : 1 } : {}),
              })
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isLocked ? 'bg-accent' : 'bg-surface'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isLocked ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}
      <button
        onClick={() => fileRef.current?.click()}
        data-testid="upload-image-btn"
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface2 py-4 text-sm font-semibold text-txt2 active:border-accent"
      >
        <Upload className="h-4 w-4" /> Upload from device
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} data-testid="file-input" />
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-txt3">Stock</p>
      <Grid cols={3}>
        {STOCK_IMAGES.map((src, i) => (
          <button
            key={i}
            data-testid={`stock-image-${i}`}
            onClick={() => apply(src)}
            className="aspect-square overflow-hidden rounded-xl border border-line active:border-accent"
          >
            <img src={src} alt="" draggable={false} className="pointer-events-none h-full w-full select-none object-cover" />
          </button>
        ))}
      </Grid>
    </div>
  )
}

/* ---------- Background ---------- */
function BackgroundPanel() {
  const { setBackground, project } = useEditor()
  const cur = project.background.value
  const Swatch = ({ active, onClick, style, tid, children }: any) => (
    <button onClick={onClick} data-testid={tid} style={style}
      className={`aspect-square rounded-xl border-2 transition-transform active:scale-95 ${active ? 'border-accent' : 'border-line'}`}>{children}</button>
  )
  return (
    <div className="space-y-5 pb-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-txt3">Solid</p>
        <Grid cols={6}>
          {PALETTE.map((c) => (
            <Swatch key={c} tid={`bg-color-${c}`} active={cur === c} onClick={() => setBackground({ type: 'color', value: c })} style={{ background: c }} />
          ))}
        </Grid>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-txt3">Gradient</p>
        <Grid cols={4}>
          {GRADIENTS.map((g, i) => (
            <Swatch key={i} tid={`bg-gradient-${i}`} active={cur === g} onClick={() => setBackground({ type: 'gradient', value: g })} style={{ backgroundImage: g }} />
          ))}
        </Grid>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-txt3">Image</p>
        <Grid cols={4}>
          {BG_IMAGES.map((src, i) => (
            <Swatch key={i} tid={`bg-image-${i}`} active={cur === src} onClick={() => setBackground({ type: 'image', value: src })}
              style={{ backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
          ))}
        </Grid>
      </div>
    </div>
  )
}

/* ---------- Components Panel ---------- */
function ComponentsPanel() {
  const { selected, selectedIds, insertComponent, saveAsComponent, openTool } = useEditor()
  const [components, setComponents] = useState<ComponentItem[]>([])
  const [newCompName, setNewCompName] = useState('')
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null)

  const reload = () => {
    setComponents(getLibraryComponents())
  }

  useEffect(() => {
    reload()
  }, [])

  const handleSaveCurrent = () => {
    const name = newCompName.trim() || 'New Component'
    saveAsComponent(name, selected?.type === 'group' ? selected.id : undefined)
    setNewCompName('')
    setSavedFeedback(`"${name}" saved to library!`)
    reload()
    setTimeout(() => setSavedFeedback(null), 2500)
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteComponentFromLibrary(id)
    reload()
  }

  const handleInsert = (c: ComponentItem) => {
    insertComponent(c)
    openTool(null)
  }

  const customComponents = components.filter((c) => !c.id.startsWith('stock-'))
  const stockComponents = components.filter((c) => c.id.startsWith('stock-'))
  const hasSelection = selectedIds.length > 0 || selected != null

  return (
    <div className="space-y-4 pb-6">
      {/* Save Selection Card */}
      <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-3.5 space-y-2.5">
        <div className="flex items-center gap-2">
          <ComponentIcon className="h-4 w-4 text-purple-400" />
          <span className="text-xs font-semibold text-purple-200">
            {hasSelection ? 'Save Selection as Reusable Component' : 'Create Component'}
          </span>
        </div>
        <p className="text-[11px] text-txt3 leading-relaxed">
          Components preserve all included elements, hierarchy, styles, and animation effects for reuse across creatives.
        </p>
        {hasSelection ? (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Component name (e.g. Header Banner)"
              value={newCompName}
              onChange={(e) => setNewCompName(e.target.value)}
              className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-txt placeholder:text-txt3 focus:border-purple-400 focus:outline-none"
            />
            <button
              onClick={handleSaveCurrent}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-500 active:scale-95 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              Save
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-txt3 italic">
            Select one or more layers on the canvas to save them as a component.
          </p>
        )}
        {savedFeedback && (
          <p className="text-xs font-medium text-emerald-400 animate-fade">{savedFeedback}</p>
        )}
      </div>

      {/* User Saved Custom Components */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-txt3">Saved in Library</h4>
          <span className="text-[11px] text-txt3">{customComponents.length} custom</span>
        </div>

        {customComponents.length === 0 ? (
          <div className="rounded-xl border border-line/60 bg-surface2/50 p-4 text-center">
            <p className="text-xs text-txt3">No custom components saved yet</p>
            <p className="text-[11px] text-txt3/70 mt-1">Multi-select elements and click "Make Component" to save here.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {customComponents.map((c) => {
              const anims = Array.from(
                new Set(c.layers.map((l: Layer) => l.anim).filter((a) => Boolean(a && a !== 'none')))
              )
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface2 p-3 hover:border-purple-400/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ComponentIcon className="h-3.5 w-3.5 text-purple-400" />
                      <span className="text-xs font-semibold text-white">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-txt3">
                        {c.layers.length} elements
                      </span>
                      {anims.map((a: string) => (
                        <span key={a} className="rounded bg-purple-950/60 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 text-[10px]">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleInsert(c)}
                      className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 active:scale-95 transition-all"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Insert
                    </button>
                    <button
                      onClick={(e) => handleDelete(c.id, e)}
                      className="p-1.5 text-txt3 hover:text-danger rounded-lg transition-colors"
                      title="Delete component from library"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Preset Starter Components */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-txt3">Preset Components</h4>
          <span className="text-[11px] text-txt3">{stockComponents.length} templates</span>
        </div>
        <div className="grid gap-2">
          {stockComponents.map((c) => {
            const anims = Array.from(
              new Set(c.layers.map((l: Layer) => l.anim).filter((a) => Boolean(a && a !== 'none')))
            )
            return (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-line bg-surface2 p-3 hover:border-indigo-400/50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ComponentIcon className="h-3.5 w-3.5 text-indigo-400" />
                    <span className="text-xs font-semibold text-white">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-txt3">
                      {c.layers.length} elements
                    </span>
                    {anims.map((a: string) => (
                      <span key={a} className="rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 text-[10px]">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleInsert(c)}
                  className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 active:scale-95 transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Insert
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------- Layers ---------- */
function LayersPanel() {
  const {
    project, selectedId, selectedIds, select, updateLayer, deleteLayer,
    reorder, createGroup, ungroup, saveAsComponent, toggleGroupCollapse,
  } = useEditor()

  const label = (l: any) =>
    l.type === 'text' ? (l.text || 'Text').slice(0, 18) : l.type === 'sticker' ? `Sticker ${l.emoji}` : l.name

  // Hierarchical list of layers
  const layerMap = new Map(project.layers.map((l) => [l.id, l]))
  const rootLayers = project.layers.filter((l) => !l.groupId || !layerMap.has(l.groupId)).reverse()

  const renderNode = (layer: any, depth: number) => {
    const isGroup = layer.type === 'group'
    const isComponent = Boolean(layer.isComponent)
    const children = project.layers.filter((l: any) => l.groupId === layer.id).reverse()
    const isSelected = selectedId === layer.id || selectedIds.includes(layer.id)
    const collapsed = Boolean(layer.collapsed)

    return (
      <div key={layer.id} className="space-y-1">
        <div
          data-testid={`layer-row-${layer.id}`}
          onClick={() => select(layer.id)}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors cursor-pointer ${
            isSelected
              ? isComponent
                ? 'border-purple-500 bg-purple-950/30'
                : isGroup
                  ? 'border-indigo-500 bg-indigo-950/30'
                  : 'border-accent bg-accent/10'
              : 'border-line bg-surface2 hover:border-white/20'
          }`}
          style={{ marginLeft: `${depth * 16}px` }}
        >
          {isGroup && children.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleGroupCollapse(layer.id)
              }}
              className="p-0.5 text-txt3 hover:text-white"
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}

          {isComponent ? (
            <ComponentIcon className="h-4 w-4 text-purple-400 shrink-0" />
          ) : isGroup ? (
            <Folder className="h-4 w-4 text-indigo-400 shrink-0" />
          ) : (
            <span
              className="h-4 w-4 rounded-md shrink-0"
              style={{ background: layer.type === 'shape' ? layer.fill : layer.type === 'text' ? layer.color : '#3B82F6' }}
            />
          )}

          <span className="flex-1 truncate text-xs font-medium">
            {label(layer)}
          </span>

          {isGroup && (
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                isComponent ? 'bg-purple-500/30 text-purple-200' : 'bg-indigo-500/30 text-indigo-200'
              }`}
            >
              {isComponent ? 'COMPONENT' : 'GROUP'}
            </span>
          )}

          {isGroup && (
            <button
              data-testid={`ungroup-${layer.id}`}
              onClick={(e) => {
                e.stopPropagation()
                ungroup(layer.id)
              }}
              className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-txt2 hover:text-white"
              title="Ungroup"
            >
              Ungroup
            </button>
          )}

          <button
            data-testid={`layer-vis-${layer.id}`}
            onClick={(e) => {
              e.stopPropagation()
              updateLayer(layer.id, { visible: !(layer.visible !== false) })
            }}
            className="px-1 text-xs text-txt2 hover:text-white"
          >
            {layer.visible !== false ? 'Hide' : 'Show'}
          </button>
          <button
            data-testid={`layer-up-${layer.id}`}
            onClick={(e) => {
              e.stopPropagation()
              reorder(layer.id, 1)
            }}
            className="px-1 text-xs text-txt2 hover:text-white"
            title="Move up"
          >
            ↑
          </button>
          <button
            data-testid={`layer-down-${layer.id}`}
            onClick={(e) => {
              e.stopPropagation()
              reorder(layer.id, -1)
            }}
            className="px-1 text-xs text-txt2 hover:text-white"
            title="Move down"
          >
            ↓
          </button>
          <button
            data-testid={`layer-del-${layer.id}`}
            onClick={(e) => {
              e.stopPropagation()
              deleteLayer(layer.id)
            }}
            className="px-1 text-xs text-danger"
            title="Delete"
          >
            ✕
          </button>
        </div>

        {isGroup && !collapsed && (
          <div className="space-y-1">
            {children.map((child: any) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 pb-4">
      {/* Top actions if multi-selected */}
      {selectedIds.length > 1 && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => createGroup()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Group Selected ({selectedIds.length})
          </button>
          <button
            onClick={() => {
              const name = prompt('Component name:', 'New Component') || 'New Component'
              saveAsComponent(name)
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all"
          >
            <ComponentIcon className="h-3.5 w-3.5" />
            Make Component
          </button>
        </div>
      )}

      {rootLayers.length === 0 && <p className="py-8 text-center text-sm text-txt3">No layers yet</p>}
      {rootLayers.map((root) => renderNode(root, 0))}
    </div>
  )
}

/* ---------- Selected-layer panels ---------- */
function useSel() {
  const { selected, updateLayer } = useEditor()
  return { l: selected!, up: (patch: any) => selected && updateLayer(selected.id, patch) }
}

function FontPanel() {
  const { l, up } = useSel()
  return (
    <div className="space-y-2 pb-4">
      {FONTS.map((f) => (
        <button key={f} data-testid={`font-${f}`} onClick={() => up({ fontFamily: f })}
          style={{ fontFamily: f }}
          className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-lg ${l.fontFamily === f ? 'border-accent bg-accent/10' : 'border-line bg-surface2'}`}>
          <span>{f}</span>
          <span className="text-txt3">Ag</span>
        </button>
      ))}
    </div>
  )
}

function ColorPanel() {
  const { selected, selectedIds, updateLayers, updateLayer, time } = useEditor()
  const [colorMode, setColorMode] = useState<'fill' | 'stroke'>('fill')
  const l = selected!
  const isPath = l.type === 'path'
  const key = isPath ? (colorMode === 'stroke' ? 'stroke' : 'fill') : (l.type === 'shape' ? 'fill' : 'color')
  const effective = l && l.keyframes && l.keyframes.length > 0 ? interpolateKeyframes(l, time) : l
  const cur = (effective as any)?.[key] || (l as any)?.[key]
  const up = (patch: Record<string, any>) => {
    if (selectedIds.length > 1) {
      updateLayers(selectedIds, patch)
    } else if (selected) {
      updateLayer(selected.id, patch)
    }
  }
  return (
    <>
      {isPath && (
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setColorMode('fill')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${colorMode === 'fill' ? 'border-accent bg-accent/20 text-white' : 'border-line bg-surface2 text-txt2'}`}
          >
            Fill Color
          </button>
          <button
            type="button"
            onClick={() => setColorMode('stroke')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${colorMode === 'stroke' ? 'border-accent bg-accent/20 text-white' : 'border-line bg-surface2 text-txt2'}`}
          >
            Stroke Color
          </button>
        </div>
      )}
      <div className="pb-1">
        <Grid cols={6}>
          {PALETTE.map((c) => (
            <button
              key={c}
              data-testid={`color-${c}`}
              onClick={() => {
                if (isPath && colorMode === 'stroke' && (!l.strokeWidth || l.strokeWidth === 0)) {
                  up({ stroke: c, strokeWidth: 3 })
                } else {
                  up({ [key]: c })
                }
              }}
              style={{ background: c }}
              className={`aspect-square rounded-full border-2 transition-transform active:scale-90 ${cur === c ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`}
            />
          ))}
          {isPath && colorMode === 'fill' && (
            <button
              data-testid="color-transparent"
              onClick={() => up({ fill: 'transparent' })}
              className={`aspect-square rounded-full border-2 border-line bg-surface2 text-[10px] text-txt3 font-bold flex items-center justify-center transition-transform active:scale-90 ${l.fill === 'transparent' ? 'border-accent ring-2 ring-accent/40 text-accent' : ''}`}
              title="No fill"
            >
              None
            </button>
          )}
        </Grid>
      </div>
      <Slider
        label="Opacity"
        tid="slider-opacity"
        value={Math.round((effective?.opacity ?? l?.opacity ?? 1) * 100)}
        min={0}
        max={100}
        suffix="%"
        onChange={(v: number) => {
          if (selectedIds.length > 1) {
            updateLayers(selectedIds, { opacity: v / 100 })
          } else if (selected) {
            updateLayer(selected.id, { opacity: v / 100 })
          }
        }}
      />
    </>
  )
}

function BlurPanel() {
  const { selected, selectedIds, updateLayers, updateLayer, time } = useEditor()
  const l = selected!
  const effective = l && l.keyframes && l.keyframes.length > 0 ? interpolateKeyframes(l, time) : l
  const currentBlur = effective?.blur ?? l?.blur ?? 0
  const currentType = l?.blurType ?? 'element'

  const up = (patch: Partial<Layer>) => {
    if (selectedIds.length > 1) {
      updateLayers(selectedIds, patch)
    } else if (selected) {
      updateLayer(selected.id, patch)
    }
  }

  const presets = [
    { label: 'Off', val: 0, desc: '0px' },
    { label: 'Subtle', val: 4, desc: '4px' },
    { label: 'Soft', val: 10, desc: '10px' },
    { label: 'Medium', val: 20, desc: '20px' },
    { label: 'Heavy', val: 36, desc: '36px' },
    { label: 'Deep', val: 64, desc: '64px' },
  ]

  return (
    <div className="space-y-5 pb-6" data-testid="panel-blur">
      {/* Quick Status / Reset header */}
      <div className="flex items-center justify-between rounded-xl bg-surface2 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className={`grid h-8 w-8 place-items-center rounded-lg ${currentBlur > 0 ? 'bg-accent/15 text-accent' : 'bg-surface text-txt3'}`}>
            <Droplet className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-txt">
              {currentBlur > 0 ? `${currentBlur}px Blur Active` : 'No Blur Applied'}
            </div>
            <div className="text-[11px] text-txt3">
              {currentType === 'backdrop' ? 'Backdrop frosted glass' : 'Element blur'}
            </div>
          </div>
        </div>
        {currentBlur > 0 && (
          <button
            type="button"
            data-testid="blur-reset-btn"
            onClick={() => up({ blur: 0 })}
            className="text-xs font-medium text-txt3 hover:text-danger active:scale-95 transition-colors cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      {/* Main Blur Radius Slider */}
      <Slider
        label="Blur Radius"
        tid="slider-blur"
        value={currentBlur}
        min={0}
        max={80}
        step={1}
        suffix="px"
        onChange={(v: number) => up({ blur: v })}
      />

      {/* Quick Presets */}
      <div>
        <div className="mb-2.5 text-xs font-medium text-txt2">Quick Presets</div>
        <div className="grid grid-cols-3 gap-2">
          {presets.map((p) => {
            const isSelected = currentBlur === p.val
            return (
              <button
                key={p.label}
                type="button"
                data-testid={`blur-preset-${p.val}`}
                onClick={() => up({ blur: p.val })}
                className={`flex flex-col items-center justify-center rounded-xl border py-2 px-1 text-center transition-all active:scale-95 cursor-pointer ${
                  isSelected
                    ? 'border-accent bg-accent/10 text-accent font-semibold shadow-xs'
                    : 'border-line bg-surface2 text-txt hover:bg-surface2/80'
                }`}
              >
                <span className="text-xs">{p.label}</span>
                <span className="text-[10px] text-txt3">{p.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Blur Mode / Target Setting */}
      <div>
        <div className="mb-2.5 text-xs font-medium text-txt2">Blur Style</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="blur-type-element"
            onClick={() => up({ blurType: 'element' })}
            className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all active:scale-95 cursor-pointer ${
              currentType !== 'backdrop'
                ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/30'
                : 'border-line bg-surface2 text-txt hover:bg-surface2/80'
            }`}
          >
            <span className="text-xs font-semibold">Element Blur</span>
            <span className="text-[10px] text-txt3 mt-0.5">Blurs this element itself</span>
          </button>

          <button
            type="button"
            data-testid="blur-type-backdrop"
            onClick={() => up({ blurType: 'backdrop' })}
            className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all active:scale-95 cursor-pointer ${
              currentType === 'backdrop'
                ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/30'
                : 'border-line bg-surface2 text-txt hover:bg-surface2/80'
            }`}
          >
            <span className="text-xs font-semibold">Backdrop Frost</span>
            <span className="text-[10px] text-txt3 mt-0.5">Blurs content underneath</span>
          </button>
        </div>
      </div>

      {/* Opacity slider for convenient pairing with blur / frosted glass */}
      <Slider
        label="Layer Opacity"
        tid="slider-blur-opacity"
        value={Math.round((effective?.opacity ?? l?.opacity ?? 1) * 100)}
        min={0}
        max={100}
        suffix="%"
        onChange={(v: number) => up({ opacity: v / 100 })}
      />
    </div>
  )
}


function Slider({ label, value, min, max, step = 1, onChange, tid, suffix = '' }: any) {
  return (
    <div className="pb-5">
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-txt2">{label}</span>
        <span className="font-semibold">{Math.round(value)}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} data-testid={tid}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#007AFF]" />
    </div>
  )
}

function StylePanel() {
  const { l, up } = useSel()
  return (
    <div className="pb-4">
      <Slider label="Size" tid="slider-size" value={l.fontSize || 40} min={10} max={400} onChange={(v: number) => up({ fontSize: v })} />
      <Slider label="Weight" tid="slider-weight" value={l.fontWeight || 700} min={400} max={800} step={100} onChange={(v: number) => up({ fontWeight: v })} />
        </div>
  )
}

function AlignPanel() {
  const { l, up } = useSel()
  return (
    <div className="flex gap-3 pb-4">
      {(['left', 'center', 'right'] as const).map((a) => (
        <button key={a} data-testid={`align-${a}`} onClick={() => up({ align: a })}
          className={`flex-1 rounded-xl border py-4 text-sm font-semibold capitalize ${l.align === a ? 'border-accent bg-accent/10 text-white' : 'border-line bg-surface2 text-txt2'}`}>{a}</button>
      ))}
    </div>
  )
}

function ShapePanel() {
  const { l, up } = useSel()
  const { updateLayer, openTool } = useEditor()
  return (
    <div className="space-y-4 pb-4">
      <Grid cols={3}>
        {SHAPES.map((s) => (
          <button key={s} data-testid={`swap-shape-${s}`} onClick={() => up({ shape: s })}
            className={`flex aspect-square items-center justify-center rounded-2xl border ${l.shape === s ? 'border-accent bg-accent/10' : 'border-line bg-surface2'}`}>
            <ShapeGlyph kind={s} />
          </button>
        ))}
      </Grid>

      <div className="rounded-2xl border border-line bg-surface2/60 p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <PenTool className="h-4 w-4 text-accent" />
            <span className="text-xs font-semibold text-txt1">Convert to Vector Path</span>
          </div>
          <span className="text-[10px] text-txt3 uppercase tracking-wider font-semibold">SVG / Bézier</span>
        </div>
        <p className="text-[11px] text-txt3 mb-3 leading-relaxed">
          Transforms this basic shape into an editable vector element with anchor points and Bézier curve control handles.
        </p>
        <button
          type="button"
          data-testid="convert-shape-to-vector-btn"
          onClick={() => {
            const patch = convertShapeToVector(l)
            updateLayer(l.id, patch)
            openTool('vector')
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 px-3 text-xs font-semibold text-white shadow-sm transition-all hover:bg-accent/90 active:scale-[0.99]"
        >
          <Spline className="h-3.5 w-3.5" />
          <span>Convert Shape to Vector</span>
        </button>
      </div>
    </div>
  )
}

function RadiusPanel() {
  const { l, up } = useSel()
  return <div className="pb-4"><Slider label="Corner radius" tid="slider-radius" value={l.radius || 0} min={0} max={200} onChange={(v: number) => up({ radius: v })} /></div>
}


  function AnimatePanel() {
    const { l, up } = useSel()
    const { setMode, animationSide, setAnimationSide, setTime, time, toggleKeyframe, clearKeyframes, deleteKeyframe } = useEditor()
    const [configOpen, setConfigOpen] = useState(false)

    const hasKeyframes = Boolean(l.keyframes && l.keyframes.length > 0)

    if (hasKeyframes) {
      const isAtKf = hasKeyframeAt(l, time, 60)
      const { prev: prevKf, next: nextKf } = getAdjacentKeyframes(l.keyframes, time)
      const sortedKfs = [...(l.keyframes || [])].sort((a, b) => a.time - b.time)

      return (
        <div className="pb-4 space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-amber-400/20 text-amber-300">
                <Diamond className="h-4 w-4 fill-amber-400" />
              </div>
              <div>
                <span className="text-xs font-bold text-amber-300">Keyframe Animation</span>
                <p className="text-[11px] text-txt2">{sortedKfs.length} keyframes on timeline</p>
              </div>
            </div>
            <button
              type="button"
              data-testid="reset-to-presets-btn"
              onClick={() => clearKeyframes(l.id)}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-txt2 hover:bg-white/10 hover:text-white transition-colors"
            >
              Reset to Presets
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="panel-prev-kf-btn"
              disabled={!prevKf}
              onClick={() => prevKf && setTime(prevKf.time)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface2 text-txt2 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Jump to previous keyframe"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              data-testid="panel-toggle-kf-btn"
              onClick={() => toggleKeyframe(l.id, time)}
              className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold transition-all ${
                isAtKf
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 hover:bg-amber-400/30'
                  : 'bg-amber-500 text-black hover:bg-amber-400'
              }`}
            >
              <Diamond className={`h-3.5 w-3.5 ${isAtKf ? 'fill-amber-400' : ''}`} />
              <span>{isAtKf ? `Remove Keyframe at ${(time / 1000).toFixed(2)}s` : `Add Keyframe at ${(time / 1000).toFixed(2)}s`}</span>
            </button>

            <button
              type="button"
              data-testid="panel-next-kf-btn"
              disabled={!nextKf}
              onClick={() => nextKf && setTime(nextKf.time)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface2 text-txt2 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Jump to next keyframe"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div>
            <span className="text-xs font-semibold text-txt2 block mb-2">Keyframe Points</span>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {sortedKfs.map((kf) => {
                const isActive = Math.abs(time - kf.time) <= 60
                const summary = [
                  kf.scale !== undefined && Math.abs(kf.scale - 1) > 0.01 ? `Scale ${kf.scale}x` : null,
                  kf.blur !== undefined && kf.blur > 0 ? `Blur ${kf.blur}px` : (kf.blur === 0 ? 'No Blur' : null),
                  kf.color !== undefined ? `Color ${kf.color}` : (kf.fill !== undefined ? `Fill ${kf.fill}` : null),
                  kf.opacity !== undefined && kf.opacity < 1 ? `Opacity ${Math.round(kf.opacity * 100)}%` : null,
                  kf.rotation !== undefined && kf.rotation !== 0 ? `Rot ${kf.rotation}°` : null,
                  kf.fontSize !== undefined ? `${kf.fontSize}px` : null,
                  kf.x !== undefined ? `X:${Math.round(kf.x)}` : null,
                  kf.y !== undefined ? `Y:${Math.round(kf.y)}` : null,
                ].filter(Boolean).slice(0, 4).join(' • ')

                return (
                  <div
                    key={kf.id}
                    data-testid={`panel-kf-item-${kf.id}`}
                    onClick={() => setTime(kf.time)}
                    className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                      isActive
                        ? 'border-amber-400 bg-amber-400/15 text-white ring-1 ring-amber-400/50'
                        : 'border-line bg-surface2 text-txt2 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Diamond className={`h-3 w-3 shrink-0 ${isActive ? 'text-amber-400 fill-amber-400' : 'text-txt3'}`} />
                      <span className="font-mono text-xs font-semibold">{(kf.time / 1000).toFixed(2)}s</span>
                      <span className="text-[11px] text-txt3 truncate">{summary || 'Keyframe state'}</span>
                    </div>
                    <button
                      type="button"
                      data-testid={`delete-kf-${kf.id}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteKeyframe(l.id, kf.id)
                      }}
                      className="grid h-6 w-6 place-items-center rounded-lg text-txt3 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                      title="Delete keyframe"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }

    const anims = [
      { k: 'none', label: 'None' },
      { k: 'fade', label: animationSide === 'in' ? 'Fade In' : 'Fade Out' },
      { k: 'rise', label: animationSide === 'in' ? 'Rise Up' : 'Rise Out' },
      { k: 'pop', label: animationSide === 'in' ? 'Pop In' : 'Pop Out' },
      { k: 'slide', label: animationSide === 'in' ? 'Slide In' : 'Slide Out' },
      { k: 'blur', label: animationSide === 'in' ? 'Blur In' : 'Blur Out' },
      { k: 'pulse', label: animationSide === 'in' ? 'Pulse In' : 'Pulse Out' },
      { k: 'rotate', label: 'Rotate' },
    ]
    const current = animationSide === 'in' ? (l.inAnim || l.anim || 'none') : (l.outAnim || 'none')

    const isRotate = current === 'rotate'
    const startDeg = animationSide === 'in' ? (l.inRotateStart ?? 0) : (l.outRotateStart ?? 0)
    const endDeg = animationSide === 'in' ? (l.inRotateEnd ?? 30) : (l.outRotateEnd ?? 30)
    const msVal = animationSide === 'in' ? (l.inRotateMs ?? 150) : (l.outRotateMs ?? 150)

    const previewAnim = (animType: string, customMs?: number) => {
      setMode('animated')
      if (animationSide === 'in') {
        setTime(l.start)
      } else {
        const dur = animType === 'blur' ? 650 : animType === 'rotate' ? (customMs ?? msVal) : animType === 'pulse' ? 500 : 380
        setTime(Math.max(0, l.end - dur))
      }
    }

    return (
      <div className="pb-4">
        <div className="mb-3 flex rounded-xl bg-surface2 p-1">
          {(['in', 'out'] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => {
                setAnimationSide(side)
                if (side === 'in') {
                  setTime(l.start)
                } else {
                  const outType = l.outAnim || 'none'
                  const dur = outType === 'blur' ? 650 : outType === 'rotate' ? (l.outRotateMs ?? 150) : outType === 'pulse' ? 500 : 380
                  setTime(Math.max(0, l.end - dur))
                }
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                animationSide === side ? 'bg-accent text-white' : 'text-txt3'
              }`}
            >
              {side === 'in' ? 'In-animation' : 'Out-animation'}
            </button>
          ))}
        </div>
        <p className="mb-2.5 text-xs text-txt2">
          Choose the {animationSide === 'in' ? 'entrance' : 'exit'} animation for this layer.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-3">
          {anims.map((a) => {
            const isRotateBtn = a.k === 'rotate'
            const isSel = current === a.k
            return (
              <div key={a.k} className="relative">
                <button
                  data-testid={`anim-${animationSide}-${a.k}`}
                  type="button"
                  onClick={() => {
                    up(animationSide === 'in' ? { anim: a.k, inAnim: a.k } : { outAnim: a.k })
                    if (a.k !== 'none') {
                      previewAnim(a.k)
                    }
                  }}
                  className={`flex h-11 w-full items-center justify-center rounded-xl border py-2 text-xs font-semibold transition-all ${
                    isRotateBtn ? 'pr-7 pl-2.5' : 'px-2.5'
                  } ${
                    isSel
                      ? 'border-accent bg-accent/10 text-white shadow-sm ring-1 ring-accent/30'
                      : 'border-line bg-surface2 text-txt2 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <span className="truncate">{a.label}</span>
                </button>

                {/* Dot icon button for Rotate animation options */}
                {isRotateBtn && (
                  <button
                    type="button"
                    data-testid={`anim-rotate-config-btn-${animationSide}`}
                    title="Rotate animation settings"
                    aria-label="Rotate animation settings"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!isSel) {
                        up(animationSide === 'in' ? { anim: 'rotate', inAnim: 'rotate' } : { outAnim: 'rotate' })
                        previewAnim('rotate')
                      }
                      setConfigOpen((prev) => !prev)
                    }}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full transition-colors ${
                      configOpen
                        ? 'bg-accent text-white ring-2 ring-accent/30'
                        : isSel
                        ? 'bg-white/20 text-white hover:bg-white/30'
                        : 'bg-white/10 text-txt2 hover:bg-white/20 hover:text-white'
                    }`}
                  >
                    <CircleDot className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Rotate configuration drawer / panel when open or active */}
        {isRotate && configOpen && (
          <div
            data-testid="rotate-config-panel"
            className="mt-3 rounded-2xl border border-line bg-surface2/80 p-4 animate-fade"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CircleDot className="h-4 w-4 text-accent" />
                <span className="text-sm font-semibold text-white">Rotate Settings ({animationSide === 'in' ? 'In' : 'Out'})</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (animationSide === 'in') {
                    up({ inRotateStart: 0, inRotateEnd: 30, inRotateMs: 150 })
                  } else {
                    up({ outRotateStart: 0, outRotateEnd: 30, outRotateMs: 150 })
                  }
                  previewAnim('rotate', 150)
                }}
                className="text-[11px] text-accent hover:underline"
              >
                Reset (0° to 30°, 150ms)
              </button>
            </div>

            <div className="space-y-3">
              <Slider
                label="Start Degree"
                tid="slider-rotate-start"
                value={startDeg}
                min={-360}
                max={360}
                step={5}
                suffix="°"
                onChange={(v: number) => {
                  up(animationSide === 'in' ? { inRotateStart: v } : { outRotateStart: v })
                  previewAnim('rotate')
                }}
              />

              <Slider
                label="End Degree"
                tid="slider-rotate-end"
                value={endDeg}
                min={-360}
                max={360}
                step={5}
                suffix="°"
                onChange={(v: number) => {
                  up(animationSide === 'in' ? { inRotateEnd: v } : { outRotateEnd: v })
                  previewAnim('rotate')
                }}
              />

              <Slider
                label="Duration (ms)"
                tid="slider-rotate-ms"
                value={msVal}
                min={50}
                max={1500}
                step={25}
                suffix="ms"
                onChange={(v: number) => {
                  up(animationSide === 'in' ? { inRotateMs: v } : { outRotateMs: v })
                  previewAnim('rotate', v)
                }}
              />
            </div>
          </div>
        )}

        <button
          data-testid="convert-to-keyframes-btn"
          type="button"
          onClick={() => toggleKeyframe(l.id, time)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 py-2.5 px-3 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 active:scale-[0.99] transition-all"
        >
          <Diamond className="h-4 w-4 fill-amber-400" />
          <span>Convert to Keyframe Animation</span>
        </button>
      </div>
    )
  }


export function VectorFloatingPanel() {
  const { selected, tool, updateLayer } = useEditor()
  const l = selected
  const pts = l?.type === 'path' ? (l.points || []) : []
  const up = (patch: any) => l && updateLayer(l.id, patch)

  if (!l || l.type !== 'path' || tool) return null

  const updatePoint = (idx: number, patch: Partial<NonNullable<typeof pts>[number]>) => {
    const next = pts.map((point, pointIndex) => pointIndex === idx ? { ...point, ...patch } : point)
    up({ points: next })
  }

  const togglePointType = (idx: number) => {
    const point = pts[idx]
    if (!point) return
    const isSmooth = point.cp1 !== undefined || point.cp2 !== undefined
    if (!isSmooth) {
      const previous = pts[(idx - 1 + pts.length) % pts.length] || point
      const next = pts[(idx + 1) % pts.length] || point
      const dx = (next.x - previous.x) * 0.2
      const dy = (next.y - previous.y) * 0.2
      updatePoint(idx, {
        cp1: { x: Math.round(point.x - dx), y: Math.round(point.y - dy) },
        cp2: { x: Math.round(point.x + dx), y: Math.round(point.y + dy) },
      })
    } else {
      up({ points: pts.map((item, pointIndex) => pointIndex === idx ? { x: item.x, y: item.y } : item) })
    }
  }

  const addPoint = () => {
    if (pts.length === 0) {
      up({ points: [{ x: l.w / 2, y: l.h / 2 }] })
      return
    }
    const last = pts[pts.length - 1]
    const previous = pts[pts.length - 2] || { x: 0, y: 0 }
    const x = Math.round(Math.min(l.w, Math.max(0, last.x + (last.x - previous.x || 30))))
    const y = Math.round(Math.min(l.h, Math.max(0, last.y + (last.y - previous.y || 30))))
    up({ points: [...pts, { x, y }] })
  }

  const removePoint = (idx: number) => {
    if (pts.length <= 2) return
    up({ points: pts.filter((_, pointIndex) => pointIndex !== idx) })
  }

  return (
    <section
      aria-label="Vector point tools"
      data-testid="floating-vector-panel"
      className="pointer-events-auto absolute inset-x-3 bottom-20 z-30 mx-auto max-w-xl rounded-2xl border border-white/10 bg-black/75 p-2.5 text-white shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <div className="shrink-0 px-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Vector</p>
          <p className="text-xs font-medium">{pts.length} points</p>
        </div>
        <div className="h-8 w-px shrink-0 bg-white/10" />
        <button type="button" data-testid="floating-vector-add" onClick={addPoint} className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-semibold transition-transform active:scale-95">
          <Plus className="h-3.5 w-3.5" /> Add point
        </button>
        <button type="button" data-testid="floating-vector-toggle-closed" onClick={() => up({ closed: !l.closed })} className={`h-9 shrink-0 rounded-xl px-3 text-xs font-semibold ${l.closed ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60'}`}>
          {l.closed ? 'Closed' : 'Open'}
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {pts.map((point, idx) => {
            const smooth = point.cp1 !== undefined || point.cp2 !== undefined
            return (
              <div key={idx} className="flex items-center gap-0.5 rounded-xl bg-white/5 p-0.5">
                <button type="button" aria-label={`Point ${idx + 1} ${smooth ? 'smooth' : 'sharp'}`} data-testid={`floating-vector-point-type-${idx}`} onClick={() => togglePointType(idx)} className={`grid size-8 place-items-center rounded-lg text-[10px] font-bold ${smooth ? 'bg-accent text-white' : 'text-white/60 hover:bg-white/10'}`} title={smooth ? 'Smooth point' : 'Sharp point'}>
                  {smooth ? <Spline className="h-3.5 w-3.5" /> : <Diamond className="h-3.5 w-3.5" />}
                </button>
                <button type="button" aria-label={`Remove point ${idx + 1}`} data-testid={`floating-vector-remove-${idx}`} onClick={() => removePoint(idx)} disabled={pts.length <= 2} className="grid size-8 place-items-center rounded-lg text-white/40 hover:bg-danger/20 hover:text-danger disabled:pointer-events-none disabled:opacity-25" title="Remove point">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function VectorPanel() {
  const { l, up } = useSel()
  const pts = l.points || []

  const toggleClosed = () => {
    up({ closed: !l.closed })
  }

  const addPoint = () => {
    if (pts.length === 0) {
      const tight = tightenVectorLayer({ ...l, points: [{ x: l.w * 0.5, y: l.h * 0.5 }] })
      up(tight)
      return
    }
    const last = pts[pts.length - 1]
    const prev = pts.length > 1 ? pts[pts.length - 2] : { x: 0, y: 0 }
    const nx = Math.round(Math.min(l.w, Math.max(0, last.x + (last.x - prev.x || 30))))
    const ny = Math.round(Math.min(l.h, Math.max(0, last.y + (last.y - prev.y || 30))))
    const tight = tightenVectorLayer({ ...l, points: [...pts, { x: nx, y: ny }] })
    up(tight)
  }

  const removePoint = (idx: number) => {
    if (pts.length <= 2) return
    const updated = pts.filter((_, i) => i !== idx)
    const tight = tightenVectorLayer({ ...l, points: updated })
    up(tight)
  }

  const toggleSmooth = (idx: number) => {
    const pt = pts[idx]
    const isCurved = pt.cp1 !== undefined || pt.cp2 !== undefined
    const updated = [...pts]
    if (isCurved) {
      // Make sharp / linear
      updated[idx] = { x: pt.x, y: pt.y }
    } else {
      // Add smooth control handles
      const prev = pts[(idx - 1 + pts.length) % pts.length]
      const next = pts[(idx + 1) % pts.length]
      const dx = (next.x - prev.x) * 0.2
      const dy = (next.y - prev.y) * 0.2
      updated[idx] = {
        x: pt.x,
        y: pt.y,
        cp1: { x: Math.round(pt.x - dx), y: Math.round(pt.y - dy) },
        cp2: { x: Math.round(pt.x + dx), y: Math.round(pt.y + dy) },
      }
    }
    const tight = tightenVectorLayer({ ...l, points: updated })
    up(tight)
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Path state summary */}
      <div className="flex items-center justify-between rounded-xl bg-surface2 px-3.5 py-2.5 text-xs">
        <span className="text-txt2 font-medium">Anchor Points: <strong className="text-txt1">{pts.length}</strong></span>
        <button
          type="button"
          data-testid="vector-toggle-closed"
          onClick={toggleClosed}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${l.closed ? 'bg-accent text-white' : 'bg-surface border border-line text-txt2'}`}
        >
          {l.closed ? 'Closed Path' : 'Open Stroke'}
        </button>
      </div>

      {/* Stroke width & cap controls */}
      <div className="rounded-xl border border-line bg-surface2/50 p-3 space-y-3">
        <Slider
          label="Stroke Width"
          tid="slider-stroke-width"
          value={l.strokeWidth ?? (l.stroke ? 2 : 0)}
          min={0}
          max={40}
          suffix="px"
          onChange={(v: number) => up({ strokeWidth: v, stroke: v > 0 ? (l.stroke || '#007AFF') : undefined })}
        />

        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="text-txt2">Line Cap</span>
          <div className="flex gap-1.5">
            {(['butt', 'round', 'square'] as const).map((cap) => (
              <button
                key={cap}
                type="button"
                data-testid={`stroke-cap-${cap}`}
                onClick={() => up({ strokeLinecap: cap })}
                className={`rounded px-2 py-1 text-[10px] font-semibold capitalize border ${l.strokeLinecap === cap || (!l.strokeLinecap && cap === 'round') ? 'border-accent bg-accent/20 text-white' : 'border-line text-txt3 bg-surface'}`}
              >
                {cap}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Anchor Points List */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-txt3">Points & Béziers</span>
          <button
            type="button"
            data-testid="add-anchor-point-btn"
            onClick={addPoint}
            className="flex items-center gap-1 rounded-lg bg-surface2 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-surface2/80 active:scale-95"
          >
            <Plus className="h-3 w-3" />
            <span>Add Anchor</span>
          </button>
        </div>

        <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
          {pts.map((pt, i) => {
            const hasHandles = pt.cp1 !== undefined || pt.cp2 !== undefined
            return (
              <div
                key={i}
                data-testid={`vector-point-row-${i}`}
                className="flex items-center justify-between rounded-xl border border-line bg-surface2 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-surface text-[10px] font-bold text-txt3">
                    {i + 1}
                  </span>
                  <span className="font-mono text-[11px] text-txt2">
                    X: {Math.round(pt.x)}, Y: {Math.round(pt.y)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid={`vector-point-curve-${i}`}
                    onClick={() => toggleSmooth(i)}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${hasHandles ? 'border-accent bg-accent/20 text-white' : 'border-line text-txt3 bg-surface'}`}
                    title={hasHandles ? 'Curved (Bézier handles active)' : 'Linear (Sharp corner)'}
                  >
                    {hasHandles ? 'Smooth' : 'Sharp'}
                  </button>

                  {pts.length > 2 && (
                    <button
                      type="button"
                      data-testid={`vector-point-delete-${i}`}
                      onClick={() => removePoint(i)}
                      className="grid h-6 w-6 place-items-center rounded text-txt3 hover:text-danger hover:bg-danger/10"
                      title="Remove point"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MaskPanel() {
  const { l, up } = useSel()
  const masks = [
    { label: 'None', r: 0 }, { label: 'Rounded', r: 40 }, { label: 'Pill', r: 999 }, { label: 'Circle', r: 9999 },
  ]
  return (
    <div className="pb-4">
      <p className="mb-3 text-sm text-txt2">Masks clip your layer to a shape. Cut & merge (boolean) operations arrive with the backend.</p>
      <Grid cols={4}>
        {masks.map((m) => (
          <button key={m.label} data-testid={`mask-${m.label}`} onClick={() => up({ radius: m.r })}
            className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface2 py-3 active:border-accent">
            <div className="h-10 w-10 bg-white" style={{ borderRadius: m.r > 200 ? '9999px' : m.r }} />
            <span className="text-[11px] text-txt2">{m.label}</span>
          </button>
        ))}
      </Grid>
      <div className="mt-4 flex gap-3">
        <button data-testid="cut-btn" className="flex-1 rounded-xl border border-line bg-surface2 py-3 text-sm font-semibold text-txt2">Cut</button>
        <button data-testid="merge-btn" className="flex-1 rounded-xl border border-line bg-surface2 py-3 text-sm font-semibold text-txt2">Merge</button>
      </div>
      <p className="mt-2 text-center text-xs text-txt3">Current radius: {l.radius || 0}px</p>
    </div>
  )
}

function MockPanel({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-txt2">{text}</p>
}
