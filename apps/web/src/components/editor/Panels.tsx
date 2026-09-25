import { useRef, useState, useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  X, Upload, Type as TypeIcon, Folder, FolderPlus,
  Component as ComponentIcon, ChevronRight, ChevronLeft, ChevronDown, Plus, Trash2,
  Lock, Unlock, CircleDot, Diamond, Droplet, PenTool, Spline, Magnet, Check, CheckSquare,
  Wand2, Globe, FileUp, Pipette, Search, Sparkles, Contrast, Scissors,
} from 'lucide-react'
import ColorPicker from '#/components/editor/ColorPicker'
import { DEFAULT_DROP_SHADOW, DEFAULT_INNER_SHADOW } from '#/lib/shadows'
import { useEditor } from '#/store/editor'
import type { ShapeKind, Layer, LayerGradient, BlurFade, ShadowEffect, VectorPoint } from '#/types'
import { hasKeyframeAt, getAdjacentKeyframes, interpolateKeyframes } from '#/lib/keyframes'
import {
  PALETTE, GRADIENTS, BG_IMAGES, STOCK_IMAGES, STICKERS, SHAPES,
} from '#/lib/data'
import {
  LAYER_GRADIENT_PRESETS, BG_FADE_PRESETS, layerGradientToCss, defaultGradientForLayerType,
} from '#/lib/gradients'
import { colorToRgba } from '#/lib/shadows'
import {
  getAllFonts, getAvailableWeightsForFont, getClosestAvailableWeight,
  registerUploadedFontFile, addGoogleFontFamily, subscribeFonts,
  parseGoogleFontsInput, verifyGoogleFontExists,
} from '#/lib/fonts'
import GoogleFontsSearchView from '#/components/editor/GoogleFontsSearchView'
import { getLibraryComponents, deleteComponentFromLibrary, type ComponentItem } from '#/lib/groups'
import {
  VECTOR_PRESETS, convertShapeToVector, buildSvgPath, tightenVectorLayer, simplifyVectorPoints,
  createShapeVectorPoints, fitVectorPointsToBounds, getPointBezierMode, switchPointBezierMode,
  getAdjacentVectorPoints, getVectorBoundingBox,
} from '#/lib/vector'

const TITLES: Record<string, string> = {
  text: 'Add Text', elements: 'Elements', stickers: 'Stickers', image: 'Image',
  components: 'Components Library',
  background: 'Background', layers: 'Layers', font: 'Font', color: 'Color',
  blur: 'Blur & Effects',
  effects: 'Effects',
  style: 'Text Style', align: 'Alignment', shape: 'Shape', radius: 'Corner Radius',
  animate: 'Animation', mask: 'Mask & Cut', crop: 'Crop',
  vector: 'Vector Path & Béziers',
  convertText: 'Convert Text to Vector',
}

export default function ToolSheet() {
  const { tool, openTool } = useEditor()
  const [fontSubView, setFontSubView] = useState<'standard' | 'googleSearch'>('standard')

  useEffect(() => {
    if (tool !== 'font') {
      setFontSubView('standard')
    }
  }, [tool])

  if (!tool) return null
  if (tool === 'vector') return <VectorToolPanel />

  const isFont = tool === 'font'
  const isFullHeightFont = isFont && fontSubView === 'googleSearch'
  const sheetHeightClass = isFullHeightFont ? 'max-h-[85vh] h-[82vh] pb-8' : 'max-h-[40vh] pb-4'

  return (
    <div className="absolute inset-0 z-60 flex flex-col justify-end" data-testid="tool-sheet">
      <div className="absolute inset-0 bg-black/40 animate-fade" onClick={() => openTool(null)} />
      <div className={`animate-sheet relative ${sheetHeightClass} overflow-y-auto rounded-t-3xl border-t border-line bg-surface no-scrollbar`}>
        <div className={`sticky top-0 flex items-center justify-between bg-surface px-5 ${isFont && !isFullHeightFont ? 'pt-3 pb-2' : 'pt-4 pb-3'} z-10 border-b border-line/40`}>
          <div className="flex items-center gap-2">
            {isFullHeightFont && (
              <button
                type="button"
                data-testid="font-google-back-btn"
                onClick={() => setFontSubView('standard')}
                className="grid h-8 w-8 place-items-center rounded-full bg-surface2 text-txt2 hover:text-white transition-colors cursor-pointer"
                title="Back to Font list"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <h3 className="text-lg font-bold">
              {isFullHeightFont ? 'Search Google Fonts' : (TITLES[tool] || 'Options')}
            </h3>
          </div>
          <button onClick={() => openTool(null)} data-testid="sheet-close" className="grid h-8 w-8 place-items-center rounded-full bg-surface2 text-txt2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5">
          <PanelBody tool={tool} fontSubView={fontSubView} setFontSubView={setFontSubView} />
        </div>
      </div>
    </div>
  )
}

function PanelBody({
  tool,
  fontSubView = 'standard',
  setFontSubView,
}: {
  tool: string
  fontSubView?: 'standard' | 'googleSearch'
  setFontSubView?: (v: 'standard' | 'googleSearch') => void
}) {
  const { selected, updateLayer } = useEditor()
  const needsLayer = ['font', 'color', 'blur', 'effects', 'style', 'align', 'shape', 'radius', 'animate', 'mask', 'crop', 'vector', 'convertText']
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
    case 'font': {
      if (fontSubView === 'googleSearch') {
        return (
          <GoogleFontsSearchView
            key="google-fonts-search-view"
            onBack={() => setFontSubView?.('standard')}
            selectedLayer={selected!}
            onApplyFont={(family, weight) => {
              if (selected) {
                updateLayer(selected.id, { fontFamily: family, fontWeight: weight || 700 })
              }
            }}
          />
        )
      }
      return (
        <FontPanel
          key="font-panel-standard"
          onOpenGoogleSearch={() => setFontSubView?.('googleSearch')}
        />
      )
    }
    case 'color': return <ColorPanel />
    case 'blur': return <BlurPanel />
    case 'effects': return <EffectsPanel />
    case 'style': return <StylePanel />
    case 'convertText': return <ConvertTextPanel />
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
  const labels: Record<ShapeKind, string> = {
    rectangle: 'Rectangle',
    rect: 'Square',
    pill: 'Pill Shape',
    circle: 'Circle',
    triangle: 'Triangle',
    star: 'Star',
    line: 'Line',
  }

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
            <span className="text-[10px] text-txt3">{SHAPES.length}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {SHAPES.map((s) => (
              <button
                key={s}
                data-testid={`add-shape-${s}`}
                id={`add-shape-${s}`}
                aria-label={labels[s]}
                title={labels[s]}
                onClick={() => {
                  if (s === 'pill') {
                    addLayer('shape', {
                      shape: 'pill',
                      w: 220,
                      h: 64,
                      radius: 9999,
                      name: 'Pill Button',
                    })
                  } else if (s === 'rectangle') {
                    addLayer('shape', {
                      shape: 'rectangle',
                      w: 220,
                      h: 140,
                      radius: 0,
                      name: 'Rectangle',
                    })
                  } else if (s === 'rect') {
                    addLayer('shape', {
                      shape: 'rect',
                      w: 160,
                      h: 160,
                      radius: 0,
                      name: 'Square',
                    })
                  } else {
                    addLayer('shape', { shape: s })
                  }
                }}
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
            {filteredVectorPresets.map((vp) => {
              const baseW = vp.defaultW || 160
              const baseH = vp.defaultH || (vp.id === 'line' ? 30 : 160)
              const previewPts = vp.getPoints(baseW, baseH)
              const bbox = getVectorBoundingBox(previewPts, vp.closed)
              const padX = bbox.width * 0.12
              const padY = bbox.height * 0.12
              const vbMinX = bbox.minX - padX
              const vbMinY = bbox.minY - padY
              const vbW = Math.max(1, bbox.width + padX * 2)
              const vbH = Math.max(1, bbox.height + padY * 2)
              const pathD = buildSvgPath(previewPts, vp.closed, baseW, baseH)

              return (
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
                      shape: vp.id === 'rectangle' ? 'rectangle' : vp.id === 'rect' ? 'rect' : vp.id === 'pill' ? 'pill' : undefined,
                      closed: vp.closed,
                      stroke: vp.strokeWidth ? '#007AFF' : undefined,
                      strokeWidth: vp.strokeWidth || 0,
                      fill: vp.closed ? '#007AFF' : 'transparent',
                      points: vp.getPoints(w, h),
                      radius: vp.id === 'rectangle' || vp.id === 'rect' ? 0 : (vp.id === 'pill' ? Math.min(w, h) / 2 : undefined),
                    })
                    openTool(null)
                  }}
                  className={`grid place-items-center rounded-2xl bg-surface2 transition-all hover:bg-surface2/75 active:scale-90 cursor-pointer ${
                    vp.id === 'line' ? 'col-span-2 h-14' : 'aspect-square'
                  }`}
                >
                  <svg
                    viewBox={`${vbMinX} ${vbMinY} ${vbW} ${vbH}`}
                    className={vp.id === 'line' ? 'h-5 w-24' : 'h-8 w-8'}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <path
                      d={pathD}
                      fill={vp.closed ? '#818cf8' : 'none'}
                      stroke="#818cf8"
                      strokeWidth={vp.strokeWidth ? Math.max(2, vbH * 0.1) : Math.max(1.5, Math.min(vbW, vbH) * 0.04)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function ShapeGlyph({ kind }: { kind: ShapeKind }) {
  if (kind === 'rectangle') return <div className="h-5 w-9 rounded-none bg-white shadow-sm" />
  if (kind === 'rect') return <div className="h-7 w-7 rounded-none bg-white" />
  if (kind === 'pill') return <div className="h-4 w-9 rounded-full bg-white shadow-sm" />
  if (kind === 'circle') return <div className="h-7 w-7 rounded-full bg-white" />
  if (kind === 'triangle') return <div style={{ width: 0, height: 0, borderLeft: '14px solid transparent', borderRight: '14px solid transparent', borderBottom: '24px solid #fff' }} />
  if (kind === 'star') return <div className="h-7 w-7 bg-white" style={{ clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }} />
  if (kind === 'line') return <div className="h-1.5 w-11 rounded-full bg-white" />
  return <div className="h-7 w-7 rounded-none bg-white" />
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
  const { setBackground, project, startEyedropper } = useEditor()
  const [isBgPickerExpanded, setIsBgPickerExpanded] = useState(false)
  const [customGrad, setCustomGrad] = useState<LayerGradient | null>(null)
  const cur = project.background.value
  const isSolid = project.background.type === 'color'

  const handleStartBgEyedropper = () => {
    startEyedropper({
      target: 'background',
      initialColor: isSolid ? cur : '#FFFFFF',
      currentColor: isSolid ? cur : '#FFFFFF',
    })
  }

  const Swatch = ({ active, onClick, style, tid, children }: any) => (
    <button onClick={onClick} data-testid={tid} style={style}
      className={`aspect-square rounded-xl border-2 transition-transform active:scale-95 ${active ? 'border-accent' : 'border-line'}`}>{children}</button>
  )
  return (
    <div className="space-y-5 pb-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-txt3">Solid</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="bg-color-loupe-toggle"
              data-testid="bg-color-loupe-toggle"
              onClick={handleStartBgEyedropper}
              className="flex items-center gap-1 text-[11px] text-accent hover:underline font-semibold cursor-pointer"
            >
              <Pipette className="h-3 w-3" />
              <span>Color Loupe</span>
            </button>
            <span className="text-line">|</span>
            <button
              type="button"
              id="bg-color-picker-toggle"
              data-testid="bg-color-picker-toggle"
              onClick={() => setIsBgPickerExpanded((v) => !v)}
              className="text-[11px] text-txt3 hover:text-white font-medium cursor-pointer"
            >
              <span>{isBgPickerExpanded ? 'Hide Sliders' : 'Hex / Sliders'}</span>
            </button>
          </div>
        </div>

        {isBgPickerExpanded && (
          <div className="mb-3 animate-in fade-in slide-in-from-top-2">
            <ColorPicker
              color={isSolid ? cur : '#FFFFFF'}
              onChange={(c) => setBackground({ type: 'color', value: c })}
              onClose={() => setIsBgPickerExpanded(false)}
            />
          </div>
        )}

        <Grid cols={6}>
          {/* Rainbow Color Picker Icon in the Background Grid triggers Color Loupe */}
          <button
            type="button"
            id="bg-palette-color-picker-icon"
            data-testid="bg-palette-color-picker-icon"
            aria-label="Open screen color loupe"
            title="Pick color from screen with circular magnifier"
            onClick={handleStartBgEyedropper}
            className="aspect-square rounded-xl border-2 border-line hover:border-accent transition-all active:scale-90 flex items-center justify-center relative cursor-pointer group shadow-sm hover:scale-105"
            style={{
              background: 'conic-gradient(from 0deg, #FF3B30, #FF9500, #FFCC00, #34C759, #00C7BE, #007AFF, #5856D6, #AF52DE, #FF2D55, #FF3B30)',
            }}
          >
            <div className="grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white shadow-xs group-hover:scale-110 transition-transform">
              <Pipette className="h-3 w-3" />
            </div>
          </button>

          {PALETTE.map((c) => (
            <Swatch key={c} tid={`bg-color-${c}`} active={isSolid && cur === c} onClick={() => setBackground({ type: 'color', value: c })} style={{ background: c }} />
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
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-txt3">Fades</p>
          <span className="text-[10px] text-txt3">to transparent</span>
        </div>
        <Grid cols={4}>
          {BG_FADE_PRESETS.map((g, i) => (
            <Swatch key={i} tid={`bg-fade-${i}`} active={cur === g} onClick={() => setBackground({ type: 'gradient', value: g })} style={{ backgroundImage: g }} />
          ))}
        </Grid>
        <button
          type="button"
          data-testid="bg-gradient-custom-toggle"
          onClick={() => setCustomGrad((v) => v ?? defaultGradientForLayerType('shape'))}
          className="mb-2 w-full py-2 text-xs font-semibold rounded-xl border border-line bg-surface2 text-txt2 hover:text-white transition-colors"
        >
          {customGrad ? 'Hide custom gradient' : 'Custom gradient…'}
        </button>
        {customGrad && (
          <div className="rounded-2xl border border-line bg-surface2/40 p-3">
            <GradientEditor value={customGrad} onChange={setCustomGrad} />
            <button
              type="button"
              data-testid="bg-gradient-custom-apply"
              onClick={() => {
                setBackground({ type: 'gradient', value: layerGradientToCss(customGrad) })
                setCustomGrad(null)
              }}
              className="mt-3 w-full py-2 text-xs font-bold rounded-xl bg-accent text-white transition-transform active:scale-95"
            >
              Apply as background
            </button>
          </div>
        )}
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
    reorder, createGroup, maskSelection, unmaskGroup, ungroup, saveAsComponent, toggleGroupCollapse,
  } = useEditor()

  const label = (l: any) =>
    l.type === 'text' ? (l.text || 'Text').slice(0, 18) : l.type === 'sticker' ? `Sticker ${l.emoji}` : l.name

  // Hierarchical list of layers
  const layerMap = new Map(project.layers.map((l) => [l.id, l]))
  const rootLayers = project.layers.filter((l) => !l.groupId || !layerMap.has(l.groupId)).reverse()

  const renderNode = (layer: any, depth: number) => {
    const isGroup = layer.type === 'group'
    const isComponent = Boolean(layer.isComponent)
    const isMask = Boolean(layer.isMask)
    const children = project.layers.filter((l: any) => l.groupId === layer.id).reverse()
    const hasMasks = isGroup && children.some((c: any) => c.isMask)
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

          {isMask && (
            <span className="rounded bg-teal-500/30 px-1.5 py-0.5 text-[9px] font-bold text-teal-200">
              MASK
            </span>
          )}

          {hasMasks && (
            <span className="rounded bg-teal-500/30 px-1.5 py-0.5 text-[9px] font-bold text-teal-200">
              MASKED
            </span>
          )}

          {isGroup && (
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                isComponent ? 'bg-purple-500/30 text-purple-200' : 'bg-indigo-500/30 text-indigo-200'
              }`}
            >
              {isComponent ? 'COMPONENT' : 'GROUP'}
            </span>
          )}

          {isGroup && hasMasks && (
            <button
              data-testid={`unmask-${layer.id}`}
              onClick={(e) => {
                e.stopPropagation()
                unmaskGroup(layer.id)
                window.dispatchEvent(new Event('whoa:selection-commit'))
              }}
              className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-txt2 hover:text-white"
              title="Release mask (keep group)"
            >
              Unmask
            </button>
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
            onClick={() => {
              maskSelection()
              window.dispatchEvent(new Event('whoa:selection-commit'))
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all"
          >
            <Scissors className="h-3.5 w-3.5" />
            Mask ({selectedIds.length})
          </button>
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

interface FontPanelProps {
  onOpenGoogleSearch?: () => void
}

function FontPanel({
  onOpenGoogleSearch,
}: FontPanelProps) {
  const { l, up } = useSel()
  const { openTool } = useEditor()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'google' | 'custom'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [googleFontInput, setGoogleFontInput] = useState('')
  const [showAddGoogle, setShowAddGoogle] = useState(false)
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null)

  // Reactive subscription to dynamic fonts and uploaded fonts
  const allFonts = useSyncExternalStore(subscribeFonts, getAllFonts, getAllFonts)

  const selectedFamily = l?.fontFamily || 'Manrope'
  const availableWeights = useMemo(() => getAvailableWeightsForFont(selectedFamily), [selectedFamily])
  const currentWeight = getClosestAvailableWeight(selectedFamily, l?.fontWeight || 700)

  // Filter fonts by tab and search (deduplicated by family)
  const filteredFonts = useMemo(() => {
    const seen = new Set<string>()
    return allFonts.filter((f) => {
      const norm = f.family.toLowerCase()
      if (seen.has(norm)) return false
      seen.add(norm)
      if (activeTab === 'google' && f.source !== 'google') return false
      if (activeTab === 'custom' && f.source !== 'custom') return false
      if (searchQuery) {
        return norm.includes(searchQuery.toLowerCase())
      }
      return true
    })
  }, [allFonts, activeTab, searchQuery])

  // Handle font upload from user's device (TTF / OTF / WOFF)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    setUploadFeedback(null)
    try {
      const res = await registerUploadedFontFile(file)
      if (res) {
        up({ fontFamily: res.family, fontWeight: res.weight })
        setUploadFeedback(`Added "${res.family}" (${res.weight})`)
        setTimeout(() => setUploadFeedback(null), 3000)
      } else {
        setUploadFeedback('Could not read font file. Please use a valid TTF/OTF.')
        setTimeout(() => setUploadFeedback(null), 4000)
      }
    } catch {
      setUploadFeedback('Failed to upload font.')
      setTimeout(() => setUploadFeedback(null), 3000)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleAddGoogleFont = async () => {
    const raw = googleFontInput.trim()
    if (!raw) return
    setIsUploading(true)
    setUploadFeedback(null)
    try {
      const parsed = parseGoogleFontsInput(raw)
      if (parsed.length === 0) {
        setUploadFeedback('Could not read font name. Try typing it directly.')
        setTimeout(() => setUploadFeedback(null), 3000)
        return
      }

      const item = parsed[0]
      const exists = await verifyGoogleFontExists(item.family)
      if (!exists) {
        setUploadFeedback(`"${item.family}" was not found on Google Fonts.`)
        setTimeout(() => setUploadFeedback(null), 3500)
        return
      }

      const def = await addGoogleFontFamily(item.family, item.weights)
      if (def) {
        const nextWeight = getClosestAvailableWeight(def.family, l.fontWeight || 700)
        up({ fontFamily: def.family, fontWeight: nextWeight })
        setUploadFeedback(`Added Google Font "${def.family}" (${nextWeight})`)
        setGoogleFontInput('')
        setShowAddGoogle(false)
        setTimeout(() => setUploadFeedback(null), 3000)
      }
    } catch {
      setUploadFeedback(`Failed to load font. Check your connection.`)
      setTimeout(() => setUploadFeedback(null), 4000)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-1.5 pb-2">
      {/* Hidden file input for uploading from device */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ttf,.otf,.woff"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Top action row: Filter tabs + Upload button + Add Google Font */}
      <div className="flex items-center justify-between gap-1 pb-0.5">
        <div className="flex items-center gap-0.5 bg-surface2/80 p-0.5 rounded-md text-[10px]">
          {(['all', 'google', 'custom'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-1.5 py-0.5 rounded capitalize transition-colors ${
                activeTab === tab ? 'bg-surface font-semibold text-white shadow-xs' : 'text-txt3 hover:text-txt2'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'google' ? 'Google' : 'Custom'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="font-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="Upload font from your device (TTF, OTF)"
            className="flex items-center gap-1 rounded bg-surface2/90 hover:bg-surface2 px-1.5 py-0.5 text-[10px] font-medium text-txt hover:text-white transition-colors cursor-pointer"
          >
            <FileUp className="h-3 w-3 text-accent" />
            <span>Upload</span>
          </button>

          <button
            type="button"
            data-testid="font-browse-google-btn"
            onClick={onOpenGoogleSearch}
            title="Search & browse Google Fonts catalog (expands full panel)"
            className="flex items-center gap-1 rounded bg-accent/20 hover:bg-accent/30 text-accent px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer border border-accent/30"
          >
            <Search className="h-3 w-3" />
            <span>Search Google Fonts</span>
          </button>

          <button
            type="button"
            data-testid="font-add-google-btn"
            onClick={() => setShowAddGoogle((v) => !v)}
            title="Quick paste Google Fonts link, @import, or name"
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
              showAddGoogle ? 'bg-accent text-white' : 'bg-surface2/90 hover:bg-surface2 text-txt hover:text-white'
            }`}
          >
            <span>+ Paste</span>
          </button>
        </div>
      </div>

      {/* Font Search Filter */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search installed fonts..."
          className="w-full rounded-md bg-surface2/80 px-2 py-1 text-[11px] text-txt placeholder:text-txt3 outline-none focus:ring-1 focus:ring-accent"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-txt3 hover:text-white text-xs"
          >
            ×
          </button>
        )}
      </div>

      {/* Quick Google Font input dialog */}
      {showAddGoogle && (
        <div className="space-y-1.5 rounded-xl bg-surface2 p-2 animate-in fade-in border border-line">
          <div className="flex items-center justify-between text-[10px] text-txt3">
            <span>Paste Google Fonts link, @import, URL, or name:</span>
            <button
              type="button"
              onClick={onOpenGoogleSearch}
              className="text-accent hover:underline font-semibold cursor-pointer"
            >
              Search 130+ Library →
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="e.g. <link href='...'>, fonts.google.com/..., or Outfit"
              value={googleFontInput}
              onChange={(e) => setGoogleFontInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddGoogleFont()}
              className="flex-1 rounded bg-surface px-2 py-1 text-xs text-white placeholder:text-txt3 outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAddGoogleFont}
              disabled={!googleFontInput.trim() || isUploading}
              className="rounded bg-accent px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer shrink-0"
            >
              {isUploading ? 'Loading...' : 'Import'}
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Google Fonts banner when on Google tab */}
      {activeTab === 'google' && !showAddGoogle && (
        <div className="flex items-center justify-between rounded-xl bg-accent/10 border border-accent/25 px-2.5 py-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 text-accent font-medium">
            <Globe className="h-3.5 w-3.5" />
            <span>Search 130+ Google Fonts</span>
          </div>
          <button
            type="button"
            onClick={onOpenGoogleSearch}
            className="rounded bg-accent px-2 py-0.5 text-[10px] font-bold text-white hover:bg-accent/90 transition-colors cursor-pointer flex items-center gap-1"
          >
            <Search className="h-3 w-3" />
            <span>Search Catalog</span>
          </button>
        </div>
      )}

      {uploadFeedback && (
        <div className="rounded-md bg-accent/15 px-2 py-1 text-[11px] text-accent font-medium text-center animate-in fade-in">
          {uploadFeedback}
        </div>
      )}

      {/* Real weights selector for currently active font (eliminates fake synthetic weights) */}
      <div className="rounded-lg bg-surface2/50 px-2 py-1 flex items-center justify-between gap-1.5 border-0">
        <span className="text-[9px] font-medium text-txt3 uppercase tracking-wider shrink-0">
          Real Weights:
        </span>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {availableWeights.map((w) => {
            const isWeightActive = currentWeight === w.weight
            return (
              <button
                key={w.weight}
                type="button"
                data-testid={`weight-${w.weight}`}
                onClick={() => up({ fontWeight: w.weight })}
                className={`px-1.5 py-0.5 rounded text-[9.5px] whitespace-nowrap transition-colors cursor-pointer ${
                  isWeightActive
                    ? 'bg-accent text-white font-bold'
                    : 'bg-surface/80 hover:bg-surface text-txt2 hover:text-white'
                }`}
              >
                {w.label} ({w.weight})
              </button>
            )
          })}
        </div>
      </div>

      {/* Font list buttons: strictly borderless, compact height, text-xs */}
      <div className="space-y-0.5 max-h-[19vh] overflow-y-auto no-scrollbar">
        {filteredFonts.map((f) => {
          const isSelected = selectedFamily.toLowerCase() === f.family.toLowerCase()
          return (
            <button
              key={`${f.source || 'font'}-${f.family}`}
              data-testid={`font-${f.family}`}
              onClick={() => {
                const nextWeight = getClosestAvailableWeight(f.family, l.fontWeight || 700)
                up({ fontFamily: f.family, fontWeight: nextWeight })
              }}
              style={{ fontFamily: f.family }}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer border-0 ${
                isSelected
                  ? 'bg-accent/15 text-accent font-semibold'
                  : 'bg-surface2/60 hover:bg-surface2 text-txt hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">{f.family}</span>
                {f.source === 'custom' && (
                  <span className="rounded bg-indigo-500/20 px-1 py-0.2 text-[8px] font-semibold text-indigo-300 shrink-0">
                    Uploaded
                  </span>
                )}
                {f.source === 'google' && (
                  <span className="rounded bg-sky-500/15 px-1 py-0.2 text-[8px] font-semibold text-sky-300 shrink-0">
                    Google
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] text-txt3">
                  {f.variants.length} {f.variants.length === 1 ? 'wt' : 'wts'}
                </span>
                <span className={isSelected ? 'text-accent/80 font-bold' : 'text-txt3'}>Ag</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Vector conversion button */}
      <div className="pt-0.5">
        <button
          type="button"
          data-testid="font-convert-vector-btn"
          onClick={() => openTool('convertText')}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 py-1.5 text-xs font-semibold text-accent transition-all active:scale-98 cursor-pointer border-0"
        >
          <Spline className="h-3.5 w-3.5" />
          <span>Convert Text to Vector Paths</span>
        </button>
      </div>
    </div>
  )
}

/* ---------- Gradient editor (layer fills + backgrounds) ---------- */
function GradientEditor({
  value,
  onChange,
  onPreset,
}: {
  value: LayerGradient
  onChange: (g: LayerGradient) => void
  /** When set, preset taps go here (lets callers pair extra effects, e.g. frost). */
  onPreset?: (p: (typeof LAYER_GRADIENT_PRESETS)[number]) => void
}) {
  const [selIdx, setSelIdx] = useState(0)
  const stops = value.stops
  const sel = stops[Math.min(selIdx, stops.length - 1)]

  const setStops = (next: LayerGradient['stops']) => onChange({ ...value, stops: next })
  const patchSel = (patch: Partial<{ color: string; opacity: number; at: number }>) =>
    setStops(stops.map((s, i) => (i === Math.min(selIdx, stops.length - 1) ? { ...s, ...patch } : s)))

  const addStop = () => {
    if (stops.length >= 4) return
    const sorted = [...stops].sort((a, b) => a.at - b.at)
    const last = sorted[sorted.length - 1]
    const prev = sorted[sorted.length - 2] ?? { color: '#FFFFFF', opacity: 1, at: 0 }
    const next = [...stops, { color: last.color, opacity: last.opacity, at: Math.min(100, Math.round((prev.at + 100) / 2)) }]
    setStops(next)
    setSelIdx(next.length - 1)
  }

  const removeStop = () => {
    if (stops.length <= 2) return
    const idx = Math.min(selIdx, stops.length - 1)
    setStops(stops.filter((_, i) => i !== idx))
    setSelIdx(Math.max(0, idx - 1))
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-txt3">Presets</p>
          <span className="text-[10px] text-txt3">incl. fades</span>
        </div>
        <Grid cols={6}>
          {LAYER_GRADIENT_PRESETS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              data-testid={`gradient-preset-${i}`}
              title={p.label}
              onClick={() => {
                if (onPreset) {
                  onPreset(p)
                } else {
                  onChange({ ...p.gradient, stops: p.gradient.stops.map((s) => ({ ...s })) })
                }
                setSelIdx(0)
              }}
              style={{ backgroundImage: layerGradientToCss(p.gradient) }}
              className="aspect-square rounded-xl border-2 border-line transition-transform active:scale-95 hover:border-line-strong"
            />
          ))}
        </Grid>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-txt2">Style</div>
        <div className="grid grid-cols-2 gap-2">
          {(['linear', 'radial'] as const).map((k) => (
            <button
              key={k}
              type="button"
              data-testid={`gradient-kind-${k}`}
              onClick={() => onChange({ ...value, kind: k })}
              className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors capitalize ${value.kind === k ? 'border-accent bg-accent/20 text-white' : 'border-line bg-surface2 text-txt2'}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {value.kind === 'linear' && (
        <Slider
          label="Angle"
          tid="gradient-angle"
          value={Math.round(value.angle)}
          min={0}
          max={360}
          suffix="°"
          onChange={(v: number) => onChange({ ...value, angle: v, p1: undefined, p2: undefined })}
        />
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-txt2">Stops</p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="gradient-add-stop"
              onClick={addStop}
              disabled={stops.length >= 4}
              className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface2 text-txt2 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Add stop"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-testid="gradient-remove-stop"
              onClick={removeStop}
              disabled={stops.length <= 2}
              className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface2 text-txt2 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Remove selected stop"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          {stops.map((s, i) => (
            <button
              key={i}
              type="button"
              data-testid={`gradient-stop-${i}`}
              onClick={() => setSelIdx(i)}
              style={{ background: colorToRgba(s.color, s.opacity) }}
              className={`h-9 flex-1 rounded-lg border-2 transition-all active:scale-95 ${i === Math.min(selIdx, stops.length - 1) ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`}
              title={`Stop ${i + 1}: ${s.color} @ ${Math.round(s.at)}%`}
            />
          ))}
        </div>
      </div>

      {sel && (
        <div className="space-y-3 rounded-2xl border border-line bg-surface2/40 p-3">
          <div>
            <div className="mb-2 text-xs font-medium text-txt2">Stop color</div>
            <Grid cols={6}>
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  data-testid={`gradient-stop-color-${c}`}
                  onClick={() => patchSel({ color: c })}
                  style={{ background: c }}
                  className={`aspect-square rounded-full border-2 transition-transform active:scale-90 ${sel.color === c ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`}
                />
              ))}
            </Grid>
          </div>
          <Slider
            label="Stop opacity"
            tid="gradient-stop-opacity"
            value={Math.round(sel.opacity * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(v: number) => patchSel({ opacity: v / 100 })}
          />
          <Slider
            label="Stop position"
            tid="gradient-stop-at"
            value={Math.round(sel.at)}
            min={0}
            max={100}
            suffix="%"
            onChange={(v: number) => patchSel({ at: v })}
          />
        </div>
      )}
    </div>
  )
}

function ColorPanel() {
  const { selected, selectedIds, updateLayers, updateLayer, time, startEyedropper } = useEditor()
  const [colorMode, setColorMode] = useState<'fill' | 'stroke'>('fill')
  const [isPickerExpanded, setIsPickerExpanded] = useState(false)
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

  const handleStartEyedropper = () => {
    startEyedropper({
      target: 'layer',
      layerId: l.id,
      key: key as 'fill' | 'stroke' | 'color',
      initialColor: cur === 'transparent' ? '#007AFF' : (cur || '#007AFF'),
      currentColor: cur === 'transparent' ? '#007AFF' : (cur || '#007AFF'),
    })
  }

  const handleColorChange = (newColor: string) => {
    if (isPath && colorMode === 'stroke' && (!l.strokeWidth || l.strokeWidth === 0)) {
      up({ stroke: newColor, strokeWidth: 3 })
    } else {
      up({ [key]: newColor })
    }
  }

  const activeDisplayColor = cur === 'transparent' ? 'transparent' : (cur || '#007AFF')
  const isStrokeMode = isPath && colorMode === 'stroke'
  const canGradient = !isStrokeMode
  const curGradient = (l as Layer).fillGradient
  const isGradient = canGradient && Boolean(curGradient && curGradient.stops.length > 0)

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

      {/* Primary Color Picker Action: Triggers on-canvas Circular Magnifier Loupe */}
      <div
        id="color-picker-toggle-card"
        data-testid="color-picker-toggle-card"
        className="mb-3 rounded-2xl border border-line bg-surface2/70 p-2.5 transition-all"
      >
        <div className="flex w-full items-center justify-between gap-3 text-left">
          <button
            type="button"
            id="color-picker-toggle-btn"
            data-testid="color-picker-toggle-btn"
            onClick={handleStartEyedropper}
            className="flex flex-1 items-center gap-2.5 min-w-0 cursor-pointer group select-none text-left"
            aria-label="Pick color from canvas using circular magnifier"
            title="Color Picker (Magnifier Loupe)"
          >
            {/* Tappable Color Icon (Conic Rainbow Wheel with Pipette icon) */}
            <div
              id="color-icon"
              data-testid="color-icon"
              className="relative grid h-8 w-8 place-items-center rounded-full shadow-sm ring-1 ring-white/20 transition-transform group-hover:scale-105 active:scale-95 shrink-0"
              style={{
                background: 'conic-gradient(from 0deg, #FF3B30, #FF9500, #FFCC00, #34C759, #00C7BE, #007AFF, #5856D6, #AF52DE, #FF2D55, #FF3B30)',
              }}
            >
              <div className="grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white backdrop-blur-xs">
                <Pipette className="h-2.5 w-2.5" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-txt group-hover:text-accent transition-colors">Color Picker</span>
                <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-mono text-txt2 uppercase truncate">
                  {cur === 'transparent' ? 'None' : (cur || '#007AFF')}
                </span>
              </div>
              <span className="text-[10px] text-txt3 block truncate">
                Tap to pick from canvas with magnifier
              </span>
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <div
              id="color-current-preview"
              data-testid="color-current-preview"
              onClick={handleStartEyedropper}
              className="h-6 w-6 rounded-full border border-white/20 shadow-xs ring-1 ring-black/20 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
              style={isGradient && curGradient ? { backgroundImage: layerGradientToCss(curGradient) } : { background: activeDisplayColor }}
              title={isGradient ? 'Current: gradient' : `Current: ${cur || '#007AFF'} (Tap to sample)`}
            />
            <button
              type="button"
              onClick={() => setIsPickerExpanded((prev) => !prev)}
              aria-label={isPickerExpanded ? 'Hide manual sliders' : 'Show manual sliders and hex'}
              title="Manual Hex & Sliders"
              className={`grid h-6 w-6 place-items-center rounded-full bg-surface text-txt2 hover:text-white transition-all cursor-pointer ${
                isPickerExpanded ? 'rotate-180 text-accent' : ''
              }`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Expanded Manual Color Picker Sliders */}
        {isPickerExpanded && (
          <div className="mt-3 pt-3 border-t border-line/60">
            <ColorPicker
              color={cur === 'transparent' ? '#007AFF' : (cur || '#007AFF')}
              onChange={handleColorChange}
              onClose={() => setIsPickerExpanded(false)}
            />
          </div>
        )}
      </div>

      {canGradient && (
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            data-testid="fill-mode-solid"
            onClick={() => up({ fillGradient: undefined })}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${!isGradient ? 'border-accent bg-accent/20 text-white' : 'border-line bg-surface2 text-txt2'}`}
          >
            Solid
          </button>
          <button
            type="button"
            data-testid="fill-mode-gradient"
            onClick={() => {
              if (!isGradient) up({ fillGradient: defaultGradientForLayerType(l.type) })
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${isGradient ? 'border-accent bg-accent/20 text-white' : 'border-line bg-surface2 text-txt2'}`}
          >
            Gradient
          </button>
        </div>
      )}

      {isGradient && curGradient ? (
        <div className="pb-1">
          <GradientEditor
            value={curGradient}
            onChange={(g) => up({ fillGradient: g })}
            onPreset={(p) => {
              const patch: Record<string, any> = {
                fillGradient: { ...p.gradient, stops: p.gradient.stops.map((s) => ({ ...s })) },
              }
              if (p.effect) {
                patch.blur = p.effect.blur
                patch.blurType = p.effect.blurType
                patch.blurFade = { ...p.effect.blurFade }
              }
              up(patch)
            }}
          />
        </div>
      ) : (
      <div className="pb-1">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-txt3">Swatches</p>
          <span className="text-[10px] text-txt3">Presets</span>
        </div>
        <Grid cols={6}>
          {/* Rainbow Color Picker Icon in the Swatches Grid */}
          <button
            type="button"
            id="palette-color-picker-icon"
            data-testid="palette-color-picker-icon"
            aria-label="Open screen color magnifier loupe"
            title="Pick color from canvas with circular magnifier"
            onClick={handleStartEyedropper}
            className="aspect-square rounded-full border-2 border-line hover:border-accent transition-all active:scale-90 flex items-center justify-center relative cursor-pointer group shadow-sm hover:scale-105"
            style={{
              background: 'conic-gradient(from 0deg, #FF3B30, #FF9500, #FFCC00, #34C759, #00C7BE, #007AFF, #5856D6, #AF52DE, #FF2D55, #FF3B30)',
            }}
          >
            <div className="grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white shadow-xs group-hover:scale-110 transition-transform">
              <Pipette className="h-2.5 w-2.5" />
            </div>
          </button>

          {PALETTE.map((c) => (
            <button
              key={c}
              data-testid={`color-${c}`}
              onClick={() => handleColorChange(c)}
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
      )}
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
            onClick={() => up({ blur: 0, blurFade: undefined })}
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
        onChange={(v: number) => {
          const patch: Partial<Layer> = { blur: v }
          if (v > 0 && currentType === 'backdrop' && l && (l.opacity === undefined || l.opacity >= 0.99)) {
            patch.opacity = 0.65
          }
          up(patch)
        }}
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
                onClick={() => {
                  const patch: Partial<Layer> = { blur: p.val }
                  if (p.val > 0 && currentType === 'backdrop' && l && (l.opacity === undefined || l.opacity >= 0.99)) {
                    patch.opacity = 0.65
                  }
                  up(patch)
                }}
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
            onClick={() => {
              const patch: Partial<Layer> = { blurType: 'element' }
              if (currentBlur === 0) patch.blur = 10
              up(patch)
            }}
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
            onClick={() => {
              const patch: Partial<Layer> = { blurType: 'backdrop' }
              if (currentBlur === 0) patch.blur = 20
              if (l && (l.opacity === undefined || l.opacity >= 0.99)) {
                patch.opacity = 0.65
              }
              up(patch)
            }}
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

      {/* Fade edge: dissolve the blur toward one side (blur to transparent) */}
      {currentBlur > 0 && (
        <div>
          <div className="mb-2.5 text-xs font-medium text-txt2">Fade Edge</div>
          <div className="grid grid-cols-5 gap-1.5">
            {([
              { id: 'off', label: 'Off' },
              { id: 'top', label: 'Top' },
              { id: 'bottom', label: 'Bottom' },
              { id: 'left', label: 'Left' },
              { id: 'right', label: 'Right' },
            ] as const).map((o) => {
              const isActive = o.id === 'off' ? !l?.blurFade : l?.blurFade?.side === o.id
              return (
                <button
                  key={o.id}
                  type="button"
                  data-testid={`blur-fade-${o.id}`}
                  onClick={() => {
                    if (o.id === 'off') up({ blurFade: undefined })
                    else up({ blurFade: { side: o.id, length: l?.blurFade?.length ?? 50 } as BlurFade })
                  }}
                  className={`py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${isActive ? 'border-accent bg-accent/20 text-white' : 'border-line bg-surface2 text-txt2'}`}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
          {l?.blurFade && (
            <div className="mt-3">
              <Slider
                label="Fade length"
                tid="slider-blur-fade"
                value={Math.round(l.blurFade.length)}
                min={10}
                max={100}
                suffix="%"
                onChange={(v: number) => up({ blurFade: { side: l.blurFade!.side, length: v } })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type EffectPreset = { label: string; desc: string; values: ShadowEffect | null }

/**
 * One shadow effect's controls: status header with enable toggle + reset, then (when on)
 * offset/blur/opacity sliders, a swatch row with an expandable ColorPicker, and quick
 * presets. Both effects in the panel are rendered through this so they can't drift apart.
 */
function EffectControls({
  title,
  tid,
  icon,
  enabled,
  value,
  defaults,
  presets,
  onToggle,
  onDisable,
  onReset,
  onChange,
}: {
  title: string
  tid: string
  icon: React.ReactNode
  enabled: boolean
  value: ShadowEffect | undefined
  defaults: ShadowEffect
  presets: EffectPreset[]
  onToggle: () => void
  onDisable: () => void
  onReset: () => void
  onChange: (next: ShadowEffect) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  // control testids share the container's `effect-{tid}` prefix so they read as one family
  const eid = `effect-${tid}`
  // when off, the sliders/presets are hidden anyway — showing default values costs nothing
  const v = value ?? defaults
  const set = (patch: Partial<ShadowEffect>) => onChange({ ...v, ...patch })

  const matches = (p: EffectPreset) =>
    p.values
      ? enabled &&
        v.x === p.values.x &&
        v.y === p.values.y &&
        v.blur === p.values.blur &&
        v.color === p.values.color &&
        Number(v.opacity.toFixed(3)) === p.values.opacity
      : !enabled

  return (
    <div className="rounded-xl bg-surface2 px-3.5 py-3" data-testid={`effect-${tid}`}>
      {/* Status / Reset / Enable */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${enabled ? 'bg-accent/15 text-accent' : 'bg-surface text-txt3'}`}>
            {icon}
          </div>
          <div>
            <div className="text-xs font-semibold text-txt">{title}</div>
            <div className="text-[11px] text-txt3">
              {enabled ? `X ${v.x} · Y ${v.y} · ${Math.round(v.opacity * 100)}%` : 'Off'}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {enabled && (
            <button
              type="button"
              data-testid={`${eid}-reset`}
              onClick={onReset}
              className="cursor-pointer text-xs font-medium text-txt3 transition-colors hover:text-danger active:scale-95"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={`${title} on/off`}
            data-testid={`${eid}-toggle`}
            onClick={onToggle}
            className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${enabled ? 'bg-accent' : 'border border-line bg-surface'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {enabled && (
        <div className="mt-4">
          <Slider label="Offset X" tid={`${eid}-x`} value={v.x} min={-100} max={100} suffix="px" onChange={(n: number) => set({ x: n })} />
          <Slider label="Offset Y" tid={`${eid}-y`} value={v.y} min={-100} max={100} suffix="px" onChange={(n: number) => set({ y: n })} />
          <Slider label="Blur" tid={`${eid}-blur`} value={v.blur} min={0} max={80} suffix="px" onChange={(n: number) => set({ blur: n })} />
          <Slider label="Opacity" tid={`${eid}-opacity`} value={Math.round(v.opacity * 100)} min={0} max={100} suffix="%" onChange={(n: number) => set({ opacity: n / 100 })} />

          {/* Color: swatch row + expandable picker */}
          <div className="pb-1">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-txt2">Color</span>
              <button
                type="button"
                onClick={() => setPickerOpen((p) => !p)}
                aria-expanded={pickerOpen}
                aria-label="Manual hex & sliders"
                className="flex cursor-pointer items-center gap-1.5 text-[11px] text-txt3 transition-colors hover:text-txt2"
              >
                <span className="h-3.5 w-3.5 rounded-full border border-line" style={{ background: v.color }} />
                {v.color}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <Grid cols={6}>
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  data-testid={`${eid}-color-${c}`}
                  onClick={() => set({ color: c })}
                  style={{ background: c }}
                  className={`aspect-square cursor-pointer rounded-full border-2 transition-transform active:scale-90 ${
                    v.color?.toLowerCase() === c.toLowerCase() ? 'border-accent ring-2 ring-accent/40' : 'border-line'
                  }`}
                />
              ))}
            </Grid>
            {pickerOpen && (
              <div className="mt-1 border-t border-line/60 pt-3">
                <ColorPicker color={v.color} onChange={(hex: string) => set({ color: hex })} onClose={() => setPickerOpen(false)} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Presets */}
      <div className={enabled ? 'pt-3' : 'pt-4'}>
        <div className="mb-2.5 text-xs font-medium text-txt2">Quick Presets</div>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => {
            const isSelected = matches(p)
            return (
              <button
                key={p.label}
                type="button"
                data-testid={`${eid}-preset-${p.label.toLowerCase()}`}
                onClick={() => (p.values ? onChange({ ...p.values }) : onDisable())}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition-all active:scale-95 ${
                  isSelected
                    ? 'border-accent bg-accent/10 font-semibold text-accent shadow-xs'
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
    </div>
  )
}

function EffectsPanel() {
  const { selected, selectedIds, updateLayers, updateLayer, time } = useEditor()
  const l = selected!
  // read interpolated values so keyframed effects show what the playhead says (both imports used)
  const effective = l && l.keyframes && l.keyframes.length > 0 ? interpolateKeyframes(l, time) : l
  const drop = effective?.dropShadow
  const inner = effective?.innerShadow

  // multi-select: one change applies to ALL selected layers (BlurPanel's `up`, not the
  // single-select-only variants elsewhere in this file)
  const up = (patch: Partial<Layer>) => {
    if (selectedIds.length > 1) {
      updateLayers(selectedIds, patch)
    } else if (selected) {
      updateLayer(selected.id, patch)
    }
  }

  const dropPresets: EffectPreset[] = [
    { label: 'Off', desc: 'none', values: null },
    { label: 'Subtle', desc: '6px', values: { x: 0, y: 2, blur: 6, spread: 0, color: '#000000', opacity: 0.25 } },
    { label: 'Soft', desc: '16px', values: { x: 0, y: 6, blur: 16, spread: 0, color: '#000000', opacity: 0.35 } },
    { label: 'Deep', desc: '32px', values: { x: 0, y: 12, blur: 32, spread: 0, color: '#000000', opacity: 0.45 } },
  ]

  const innerPresets: EffectPreset[] = [
    { label: 'Off', desc: 'none', values: null },
    { label: 'Top', desc: '4px', values: { x: 0, y: -2, blur: 4, spread: 0, color: '#000000', opacity: 0.35 } },
    { label: 'Inset', desc: '8px', values: { x: 0, y: 4, blur: 8, spread: 0, color: '#000000', opacity: 0.4 } },
    { label: 'Carve', desc: 'tight', values: { x: 0, y: 2, blur: 2, spread: 0, color: '#000000', opacity: 0.5 } },
  ]

  return (
    <div className="space-y-4 pb-6" data-testid="panel-effects">
      <div className="px-0.5">
        <p className="text-[11px] leading-relaxed text-txt3">
          Shadows cast by this layer's shape. Effects stack — turn on both to use them together.
        </p>
      </div>

      <EffectControls
        title="Drop Shadow"
        tid="drop"
        icon={<Sparkles className="h-4 w-4" />}
        enabled={Boolean(drop)}
        value={drop}
        defaults={DEFAULT_DROP_SHADOW}
        presets={dropPresets}
        onToggle={() => up({ dropShadow: drop ? undefined : { ...DEFAULT_DROP_SHADOW } })}
        onDisable={() => up({ dropShadow: undefined })}
        onReset={() => up({ dropShadow: { ...DEFAULT_DROP_SHADOW } })}
        onChange={(next) => up({ dropShadow: next })}
      />

      <EffectControls
        title="Inner Shadow"
        tid="inner"
        icon={<Contrast className="h-4 w-4" />}
        enabled={Boolean(inner)}
        value={inner}
        defaults={DEFAULT_INNER_SHADOW}
        presets={innerPresets}
        onToggle={() => up({ innerShadow: inner ? undefined : { ...DEFAULT_INNER_SHADOW } })}
        onDisable={() => up({ innerShadow: undefined })}
        onReset={() => up({ innerShadow: { ...DEFAULT_INNER_SHADOW } })}
        onChange={(next) => up({ innerShadow: next })}
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

function ConvertTextSection({ layer }: { layer: Layer }) {
  const { convertTextToVectors, openTool } = useEditor()
  const [loadingMode, setLoadingMode] = useState<'single' | 'group' | null>(null)
  const [preserveLigatures, setPreserveLigatures] = useState(true)
  const [simplifyPaths, setSimplifyPaths] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleConvert = async (mode: 'single' | 'group') => {
    setLoadingMode(mode)
    setErrorMsg(null)
    try {
      const success = await convertTextToVectors(layer.id, mode, { preserveLigatures, simplifyPaths })
      if (success) {
        openTool(null)
      } else {
        setErrorMsg('Could not convert text. Check font or characters.')
      }
    } catch (err) {
      console.error(err)
      setErrorMsg('Conversion failed. Please try again.')
    } finally {
      setLoadingMode(null)
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface2/70 p-4" data-testid="convert-text-section">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent">
            <Spline className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-txt">Convert to Vectors</h4>
            <p className="text-[10px] text-txt3">Turn text glyphs into editable Bézier paths</p>
          </div>
        </div>
        <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
          OpenType
        </span>
      </div>

      <p className="text-[11px] text-txt2 mb-3 leading-relaxed">
        Transform letters into vector curves with adjustable anchor points and directional handles.
      </p>

      {errorMsg && (
        <div className="mb-3 rounded-xl border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="convert-text-single-btn"
          disabled={loadingMode !== null}
          onClick={() => handleConvert('single')}
          className="flex flex-col items-center justify-center rounded-xl border border-accent/40 bg-accent/15 hover:bg-accent/25 p-3 text-center transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <Spline className="h-4 w-4 text-accent mb-1" />
          <span className="text-xs font-semibold text-accent">Single Path</span>
          <span className="text-[10px] text-txt3 mt-0.5">Combined outline</span>
        </button>

        <button
          type="button"
          data-testid="convert-text-group-btn"
          disabled={loadingMode !== null}
          onClick={() => handleConvert('group')}
          className="flex flex-col items-center justify-center rounded-xl border border-line bg-surface2 hover:bg-surface2/80 p-3 text-center transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <FolderPlus className="h-4 w-4 text-indigo-400 mb-1" />
          <span className="text-xs font-semibold text-txt">Per Letter</span>
          <span className="text-[10px] text-txt3 mt-0.5">Grouped layers</span>
        </button>
      </div>

      <label className="mt-3 flex items-center justify-between rounded-xl bg-surface/80 px-3 py-2 text-xs text-txt2 cursor-pointer select-none border border-line/60">
        <div className="flex flex-col pr-2">
          <span className="font-medium text-txt text-[11px]">Standard Ligatures</span>
          <span className="text-[10px] text-txt3">Keep touching letter pairs (e.g. tt, fi, fl) connected</span>
        </div>
        <input
          type="checkbox"
          checked={preserveLigatures}
          onChange={(e) => setPreserveLigatures(e.target.checked)}
          className="h-4 w-4 rounded accent-accent cursor-pointer"
        />
      </label>

      <label className="mt-2 flex items-center justify-between rounded-xl bg-surface/80 px-3 py-2 text-xs text-txt2 cursor-pointer select-none border border-line/60">
        <div className="flex flex-col pr-2">
          <span className="font-medium text-txt text-[11px]">Simplify Vector Paths</span>
          <span className="text-[10px] text-txt3">Remove redundant anchors while preserving curve fidelity</span>
        </div>
        <input
          type="checkbox"
          checked={simplifyPaths}
          onChange={(e) => setSimplifyPaths(e.target.checked)}
          className="h-4 w-4 rounded accent-accent cursor-pointer"
        />
      </label>

      {loadingMode && (
        <div className="mt-2.5 flex items-center justify-center gap-2 text-xs text-accent">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span>Generating vector Bézier curves...</span>
        </div>
      )}
    </div>
  )
}

function ConvertTextPanel() {
  const { selected } = useEditor()
  if (!selected || selected.type !== 'text') {
    return <MockPanel text="Select a text layer to convert it to vectors." />
  }

  return (
    <div className="space-y-4 pb-4" data-testid="panel-convert-text">
      <div className="rounded-2xl border border-line bg-surface2 p-4">
        <div className="text-[11px] font-medium text-txt3 uppercase tracking-wider mb-1">Source Text</div>
        <div
          className="text-lg font-bold text-txt break-words truncate"
          style={{ fontFamily: selected.fontFamily || 'Manrope', fontWeight: selected.fontWeight || 700 }}
        >
          {selected.text || 'Text'}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-txt3">
          <span>Font: <strong className="text-txt">{selected.fontFamily || 'Manrope'}</strong></span>
          <span>Weight: <strong className="text-txt">{selected.fontWeight || 700}</strong></span>
          <span>Size: <strong className="text-txt">{selected.fontSize || 40}px</strong></span>
          <span>Chars: <strong className="text-txt">{selected.text?.length || 0}</strong></span>
        </div>
      </div>

      <ConvertTextSection layer={selected} />
    </div>
  )
}

function StylePanel() {
  const { l, up } = useSel()
  const family = l.fontFamily || 'Manrope'
  const realWeights = getAvailableWeightsForFont(family)
  const currentWeight = getClosestAvailableWeight(family, l.fontWeight || 700)

  return (
    <div className="pb-4 space-y-3">
      <Slider label="Size" tid="slider-size" value={l.fontSize || 40} min={10} max={400} onChange={(v: number) => up({ fontSize: v })} />

      {/* Real Available Weights selection instead of a continuous slider that causes faux/synthetic weights */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-txt2 font-medium">Font Weight</span>
          <span className="text-[11px] text-txt3">
            Real Weight: <strong className="text-txt font-semibold">{currentWeight}</strong>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {realWeights.map((w) => {
            const isSelected = currentWeight === w.weight
            return (
              <button
                key={w.weight}
                type="button"
                data-testid={`style-weight-${w.weight}`}
                onClick={() => up({ fontWeight: w.weight })}
                className={`flex-1 min-w-[65px] py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                  isSelected
                    ? 'bg-accent text-white shadow-xs'
                    : 'bg-surface2 hover:bg-surface2/80 text-txt2 hover:text-white'
                }`}
              >
                {w.label}
                <div className="text-[9px] opacity-75">{w.weight}</div>
              </button>
            )
          })}
        </div>
      </div>

      {l.type === 'text' && <ConvertTextSection layer={l} />}
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
  const isPath = l.type === 'path'
  const shapeLabels: Record<ShapeKind, string> = {
    rectangle: 'Rectangle',
    rect: 'Square',
    pill: 'Pill',
    circle: 'Circle',
    triangle: 'Triangle',
    star: 'Star',
    line: 'Line',
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Format & Mode Switcher: Div Shape (CSS) vs Vector Path (SVG) */}
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface2/60 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-txt3">Current Format:</span>
          <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${
            isPath ? 'bg-indigo-500/20 text-indigo-300' : 'bg-emerald-500/20 text-emerald-300'
          }`}>
            {isPath ? 'Vector Shape (SVG)' : 'Div Shape (CSS)'}
          </span>
        </div>
        <button
          type="button"
          data-testid="toggle-shape-format-btn"
          onClick={() => {
            if (isPath) {
              updateLayer(l.id, {
                type: 'shape',
                shape: l.shape || 'rectangle',
                radius: l.shape === 'pill' ? (l.radius ?? 9999) : (l.radius ?? 0),
              })
            } else {
              const patch = convertShapeToVector(l)
              updateLayer(l.id, patch)
            }
          }}
          className="text-xs font-semibold text-accent hover:underline cursor-pointer"
        >
          Convert to {isPath ? 'Div Shape' : 'Vector'}
        </button>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-txt3">Shape Presets</span>
          <span className="text-[10px] text-txt3 font-medium">Buttons & Icons</span>
        </div>
        <Grid cols={3}>
          {SHAPES.map((s) => {
            const isSelected = l.shape === s || (!l.shape && s === 'rect')
            return (
              <button
                key={s}
                data-testid={`swap-shape-${s}`}
                title={shapeLabels[s]}
                onClick={() => {
                  if (isPath) {
                    const defaultRad = s === 'pill'
                      ? Math.min(l.w, l.h) / 2
                      : (l.radius ?? 0)
                    const rawPts = createShapeVectorPoints(s, l.w, l.h, defaultRad)
                    const pts = fitVectorPointsToBounds(rawPts, s !== 'line', l.w, l.h)
                    up({ points: pts, closed: s !== 'line', shape: s, radius: defaultRad })
                  } else {
                    const patch: Partial<Layer> = { shape: s }
                    if (s === 'pill') {
                      patch.radius = 9999
                    } else if (s === 'rectangle' || s === 'rect') {
                      patch.radius = l.radius ?? 0
                    }
                    up(patch)
                  }
                }}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-2.5 transition-all cursor-pointer aspect-square ${
                  isSelected ? 'border-accent bg-accent/15 ring-1 ring-accent/30 shadow-sm' : 'border-line bg-surface2 hover:border-white/20'
                }`}
              >
                <ShapeGlyph kind={s} />
                <span className="text-[10px] font-semibold text-txt2 truncate max-w-full">{shapeLabels[s]}</span>
              </button>
            )
          })}
        </Grid>
      </div>

      {!isPath ? (
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
      ) : (
        <div className="rounded-2xl border border-line bg-surface2/60 p-3.5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <PenTool className="h-4 w-4 text-accent" />
              <span className="text-xs font-semibold text-txt1">Vector Point Tools</span>
            </div>
            <span className="text-[10px] text-indigo-400 uppercase tracking-wider font-semibold">Vector</span>
          </div>
          <p className="text-[11px] text-txt3 mb-3 leading-relaxed">
            Directly edit anchor points, handles, and curvature using the vector toolbar.
          </p>
          <button
            type="button"
            data-testid="edit-vector-points-btn"
            onClick={() => openTool('vector')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 px-3 text-xs font-semibold text-white shadow-sm transition-all hover:bg-accent/90 active:scale-[0.99]"
          >
            <Spline className="h-3.5 w-3.5" />
            <span>Edit Anchor Points</span>
          </button>
        </div>
      )}
    </div>
  )
}

function RadiusPanel() {
  const { l, up } = useSel()
  return (
    <div className="pb-4">
      <Slider
        label="Corner radius"
        tid="slider-radius"
        value={l.radius ?? 0}
        min={0}
        max={200}
        onChange={(v: number) => {
          if (l.type === 'path') {
            const sh = l.shape || 'rectangle'
            const rawPts = createShapeVectorPoints(sh, l.w, l.h, v)
            const pts = fitVectorPointsToBounds(rawPts, l.closed !== false, l.w, l.h)
            up({ radius: v, points: pts })
          } else {
            up({ radius: v })
          }
        }}
      />
    </div>
  )
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
      { k: 'pulse', label: animationSide === 'in' ? 'Pulse In' : 'Pulse Out' },
      { k: 'pop', label: animationSide === 'in' ? 'Pop In' : 'Pop Out' },
      { k: 'fade', label: animationSide === 'in' ? 'Fade In' : 'Fade Out' },
      { k: 'rise', label: animationSide === 'in' ? 'Rise Up' : 'Rise Out' },
      { k: 'slide', label: animationSide === 'in' ? 'Slide In' : 'Slide Out' },
      { k: 'blur', label: animationSide === 'in' ? 'Blur In' : 'Blur Out' },
      { k: 'rotate', label: 'Rotate' },
    ]
    const current = animationSide === 'in' ? (l.inAnim || l.anim || 'none') : (l.outAnim || 'none')

    const isRotate = current === 'rotate'
    const startDeg = animationSide === 'in' ? (l.inRotateStart ?? 0) : (l.outRotateStart ?? 0)
    const endDeg = animationSide === 'in' ? (l.inRotateEnd ?? 30) : (l.outRotateEnd ?? 30)
    const msVal = animationSide === 'in' ? (l.inRotateMs ?? 150) : (l.outRotateMs ?? 150)

    const layerStart = l.start ?? 0
    const layerEnd = l.end ?? 5000

    const previewAnim = (animType: string, customMs?: number) => {
      setMode('animated')
      if (animationSide === 'in') {
        setTime(layerStart)
      } else {
        const dur = animType === 'blur' ? 650 : animType === 'rotate' ? (customMs ?? msVal) : animType === 'pulse' ? 500 : 380
        setTime(Math.max(0, layerEnd - dur))
      }
    }

    return (
      <div className="pb-4">
        {/* Quick Button Shapes (Pill & Rectangle) for quick button workflow */}
        {(l.type === 'shape' || l.type === 'path') && (
          <div className="mb-3 rounded-2xl border border-line bg-surface2/80 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-txt3">Button Shape</span>
              <span className="text-[10px] text-txt3 font-medium">Quick Button ({l.type === 'path' ? 'Vector' : 'Div'})</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="anim-pill-shape-btn"
                title="Pill Shape for Buttons"
                onClick={() => {
                  if (l.type === 'path') {
                    const rawPts = createShapeVectorPoints('pill', l.w, l.h, Math.min(l.w, l.h) / 2)
                    const pts = fitVectorPointsToBounds(rawPts, true, l.w, l.h)
                    up({ points: pts, closed: true, shape: 'pill' })
                  } else {
                    up({ shape: 'pill', radius: 9999 })
                  }
                }}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-semibold border transition-all cursor-pointer ${
                  l.shape === 'pill'
                    ? 'border-accent bg-accent/20 text-white ring-1 ring-accent/40 shadow-sm'
                    : 'border-line bg-surface1 text-txt2 hover:border-white/20 hover:text-white'
                }`}
              >
                <div className="h-3.5 w-7 rounded-full bg-current" />
                <span>Pill Shape</span>
              </button>

              <button
                type="button"
                data-testid="anim-rectangle-shape-btn"
                title="Rectangle Shape for Buttons"
                onClick={() => {
                  if (l.type === 'path') {
                    const rad = l.radius ?? 0
                    const rawPts = createShapeVectorPoints('rectangle', l.w, l.h, rad)
                    const pts = fitVectorPointsToBounds(rawPts, true, l.w, l.h)
                    up({ points: pts, closed: true, shape: 'rectangle', radius: rad })
                  } else {
                    up({ shape: 'rectangle', radius: l.radius ?? 0 })
                  }
                }}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-semibold border transition-all cursor-pointer ${
                  l.shape === 'rectangle'
                    ? 'border-accent bg-accent/20 text-white ring-1 ring-accent/40 shadow-sm'
                    : 'border-line bg-surface1 text-txt2 hover:border-white/20 hover:text-white'
                }`}
              >
                <div className="h-3.5 w-7 rounded-md bg-current" />
                <span>Rectangle Shape</span>
              </button>
            </div>
          </div>
        )}

        <div className="mb-3 flex rounded-xl bg-surface2 p-1">
          {(['in', 'out'] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => {
                setAnimationSide(side)
                if (side === 'in') {
                  setTime(layerStart)
                } else {
                  const outType = l.outAnim || 'none'
                  const dur = outType === 'blur' ? 650 : outType === 'rotate' ? (l.outRotateMs ?? 150) : outType === 'pulse' ? 500 : 380
                  setTime(Math.max(0, layerEnd - dur))
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


function BezierMode1Icon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="15" x2="10" y2="10" strokeDasharray="1.5 1.5" />
      <line x1="10" y1="10" x2="16" y2="6" strokeDasharray="1.5 1.5" />
      <circle cx="4" cy="15" r="1.5" fill="currentColor" />
      <circle cx="16" cy="6" r="1.5" fill="currentColor" />
      <rect x="8.25" y="8.25" width="3.5" height="3.5" fill="currentColor" />
    </svg>
  )
}

function BezierMode2Icon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="10" x2="17" y2="10" />
      <circle cx="3" cy="10" r="1.5" fill="currentColor" />
      <circle cx="10" cy="10" r="2.25" fill="currentColor" />
      <circle cx="17" cy="10" r="1.5" fill="currentColor" />
    </svg>
  )
}

function BezierMode3Icon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="10" x2="17.5" y2="10" />
      <circle cx="6" cy="10" r="1.5" fill="currentColor" />
      <circle cx="10" cy="10" r="2.25" fill="currentColor" />
      <circle cx="17.5" cy="10" r="1.5" fill="currentColor" />
    </svg>
  )
}

function BezierMode4Icon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="10" x2="4.5" y2="4.5" />
      <line x1="10" y1="10" x2="15.5" y2="4.5" />
      <circle cx="4.5" cy="4.5" r="1.5" fill="currentColor" />
      <circle cx="10" cy="10" r="2.25" fill="currentColor" />
      <circle cx="15.5" cy="4.5" r="1.5" fill="currentColor" />
    </svg>
  )
}

export function VectorFloatingPanel() {
  const {
    selected,
    tool,
    updateLayer,
    vectorSnap,
    toggleVectorSnap,
    selectedAnchorIndices,
    setSelectedAnchors,
    anchorMultiSelectMode,
    toggleAnchorMultiSelectMode,
    vectorEditingId,
    setVectorEditingId,
  } = useEditor()
  const [expanded, setExpanded] = useState(true)
  const l = selected
  const pts = l?.type === 'path' ? (l.points || []) : []
  const up = (patch: any) => l && updateLayer(l.id, patch)

  useEffect(() => {
    if (l && vectorEditingId === l.id) {
      setExpanded(true)
    }
  }, [vectorEditingId, l?.id])

  if (!l || l.type !== 'path' || tool || vectorEditingId !== l.id) return null

  const validSelected = selectedAnchorIndices.filter((idx) => idx >= 0 && idx < pts.length)
  const activeAnchorIdx = validSelected.length > 0 ? validSelected[0] : 0
  const activePoint = pts[activeAnchorIdx]
  const currentMode = activePoint ? getPointBezierMode(activePoint) : 1

  const handleSetBezierMode = (targetMode: 1 | 2 | 3 | 4) => {
    if (!pts.length) return
    const targets = validSelected.length > 0 ? validSelected : [0]
    const updated = pts.map((pt, i) => {
      if (!targets.includes(i)) return pt
      const { prevPt, nextPt } = getAdjacentVectorPoints(pts, i, l.closed !== false)
      return switchPointBezierMode(pt, targetMode, prevPt, nextPt)
    })
    const tight = tightenVectorLayer({ ...l, points: updated })
    up(tight)
  }

  const handleAddAnchor = () => {
    if (pts.length === 0) {
      const tight = tightenVectorLayer({ ...l, points: [{ x: Math.round(l.w / 2), y: Math.round(l.h / 2), mode: 1 }] })
      up(tight)
      setSelectedAnchors([0])
      return
    }

    const selIdx = validSelected.length > 0 ? validSelected[validSelected.length - 1] : pts.length - 1
    const currPt = pts[selIdx]
    const { nextPt } = getAdjacentVectorPoints(pts, selIdx, l.closed !== false)

    let newX: number
    let newY: number

    if (!l.closed && !nextPt) {
      const { prevPt } = getAdjacentVectorPoints(pts, selIdx, false)
      const p = prevPt || { x: 0, y: 0 }
      const dx = currPt.x - p.x || 30
      const dy = currPt.y - p.y || 0
      newX = Math.round(Math.min(l.w + 60, Math.max(0, currPt.x + dx)))
      newY = Math.round(Math.min(l.h + 60, Math.max(0, currPt.y + dy)))
    } else if (nextPt) {
      newX = Math.round((currPt.x + nextPt.x) / 2)
      newY = Math.round((currPt.y + nextPt.y) / 2)
    } else {
      newX = Math.round(currPt.x + 20)
      newY = Math.round(currPt.y + 20)
    }

    const insertIdx = selIdx + 1
    const newPt: VectorPoint = { x: newX, y: newY, mode: 1 }
    const newPoints = [...pts.slice(0, insertIdx), newPt, ...pts.slice(insertIdx)]
    const tight = tightenVectorLayer({ ...l, points: newPoints })
    up(tight)
    setSelectedAnchors([insertIdx])
  }

  const handleDeleteAnchors = () => {
    const targets = validSelected.length > 0 ? validSelected : [pts.length - 1]
    if (pts.length - targets.length < 2) return

    const targetSet = new Set(targets)
    const newPoints: VectorPoint[] = []
    let transferSubpathStart = false

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const isStart = Boolean(i > 0 && p.subpathStart)
      if (targetSet.has(i)) {
        if (isStart || transferSubpathStart) {
          transferSubpathStart = true
        }
        continue
      }
      if (transferSubpathStart) {
        newPoints.push({ ...p, subpathStart: true })
        transferSubpathStart = false
      } else {
        newPoints.push(p)
      }
    }
    const tight = tightenVectorLayer({ ...l, points: newPoints })
    up(tight)
    const nextSel = Math.min(targets[0] ?? 0, newPoints.length - 1)
    setSelectedAnchors([Math.max(0, nextSel)])
  }

  const canDelete = pts.length - (validSelected.length > 0 ? validSelected.length : 1) >= 2

  const btnClass = 'grid h-8 w-8 place-items-center rounded-full transition-all active:scale-90 focus:outline-none'
  const inactiveBtnClass = `${btnClass} text-white/70 hover:bg-white/20 hover:text-white`
  const activeBtnClass = `${btnClass} bg-accent text-white shadow-sm ring-1 ring-accent/60`

  return (
    <section
      role="toolbar"
      aria-label="Vector toolbar"
      data-testid="floating-vector-panel"
      className="pointer-events-auto absolute right-3 top-1/2 z-30 -translate-y-1/2 flex w-9 flex-col items-center gap-1 rounded-full border border-white/10 bg-black/60 p-1 text-xs font-semibold text-white shadow-2xl backdrop-blur-md transition-all duration-200"
    >
      {expanded ? (
        <div className="flex w-full flex-col items-center gap-1">
          {/* 1. Bézier mode 1 — Corner / independent handles */}
          <button
            type="button"
            data-testid="vector-bezier-mode-1"
            onClick={() => handleSetBezierMode(1)}
            aria-label="Mode 1: Corner / independent handles"
            title="Mode 1 — Corner / independent handles: incoming and outgoing handles are completely independent."
            className={currentMode === 1 ? activeBtnClass : inactiveBtnClass}
          >
            <BezierMode1Icon />
          </button>

          {/* 2. Bézier mode 2 — Mirrored */}
          <button
            type="button"
            data-testid="vector-bezier-mode-2"
            onClick={() => handleSetBezierMode(2)}
            aria-label="Mode 2: Mirrored handles"
            title="Mode 2 — Mirrored: collinear, opposite directions, and equal length."
            className={currentMode === 2 ? activeBtnClass : inactiveBtnClass}
          >
            <BezierMode2Icon />
          </button>

          {/* 3. Bézier mode 3 — Asymmetric smooth */}
          <button
            type="button"
            data-testid="vector-bezier-mode-3"
            onClick={() => handleSetBezierMode(3)}
            aria-label="Mode 3: Asymmetric smooth handles"
            title="Mode 3 — Asymmetric smooth: collinear and opposite directions, independent lengths."
            className={currentMode === 3 ? activeBtnClass : inactiveBtnClass}
          >
            <BezierMode3Icon />
          </button>

          {/* 4. Bézier mode 4 — Disconnected / free handles */}
          <button
            type="button"
            data-testid="vector-bezier-mode-4"
            onClick={() => handleSetBezierMode(4)}
            aria-label="Mode 4: Disconnected / free handles"
            title="Mode 4 — Disconnected / free handles: independent directions and lengths (cusp)."
            className={currentMode === 4 ? activeBtnClass : inactiveBtnClass}
          >
            <BezierMode4Icon />
          </button>

          <div className="my-0.5 h-px w-4 bg-white/20" />

          {/* 5. Snap on/off (default on) */}
          <button
            type="button"
            data-testid="vector-snap-toggle"
            onClick={toggleVectorSnap}
            aria-label={vectorSnap ? 'Disable snapping' : 'Enable snapping'}
            title={vectorSnap ? 'Snap: ON (Click to disable)' : 'Snap: OFF (Click to enable)'}
            className={vectorSnap ? activeBtnClass : inactiveBtnClass}
          >
            <Magnet className="size-4" />
          </button>

          {/* 5b. Multi-select anchor points toggle */}
          <button
            type="button"
            data-testid="vector-multiselect-toggle"
            onClick={toggleAnchorMultiSelectMode}
            aria-label={anchorMultiSelectMode ? 'Exit anchor multi-select' : 'Multi-select anchors'}
            title={anchorMultiSelectMode ? 'Anchor Multi-select: ON (Tap points to add/remove, or hold any point on canvas)' : 'Anchor Multi-select: OFF (Click or hold any anchor point on canvas to activate)'}
            className={anchorMultiSelectMode ? activeBtnClass : inactiveBtnClass}
          >
            <CheckSquare className="size-4" />
          </button>

          {/* 6. Add new anchor point */}
          <button
            type="button"
            data-testid="vector-add-anchor"
            onClick={handleAddAnchor}
            aria-label="Add new anchor point"
            title="Add new anchor point"
            className={inactiveBtnClass}
          >
            <Plus className="size-4" />
          </button>

          {/* 7. Delete (deletes selected anchors) */}
          <button
            type="button"
            data-testid="vector-delete-anchor"
            onClick={handleDeleteAnchors}
            disabled={!canDelete}
            aria-label="Delete selected anchors"
            title={canDelete ? 'Delete selected anchors' : 'Cannot delete (path requires at least 2 points)'}
            className={`${inactiveBtnClass} disabled:opacity-30 disabled:pointer-events-none hover:text-red-400`}
          >
            <Trash2 className="size-4" />
          </button>

          <div className="my-0.5 h-px w-4 bg-white/20" />

          {/* 8. Done (finish vector editing) */}
          <button
            type="button"
            data-testid="vector-panel-done"
            onClick={() => setVectorEditingId(null)}
            aria-label="Finish editing vector"
            title="Done (finish vector editing)"
            className={`${inactiveBtnClass} text-emerald-400 hover:text-emerald-300`}
          >
            <Check className="size-4" />
          </button>

          {/* 9. Open/collapse panel */}
          <button
            type="button"
            data-testid="vector-panel-toggle"
            onClick={() => setExpanded(false)}
            aria-label="Collapse panel"
            title="Collapse panel"
            className={inactiveBtnClass}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : (
        /* Collapsed: tool 8 reopens the panel */
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            data-testid="vector-panel-toggle"
            onClick={() => setExpanded(true)}
            aria-label="Open panel"
            title="Open vector tools panel"
            className={inactiveBtnClass}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            data-testid="vector-panel-done"
            onClick={() => setVectorEditingId(null)}
            aria-label="Finish editing vector"
            title="Done (finish vector editing)"
            className={`${inactiveBtnClass} text-emerald-400 hover:text-emerald-300`}
          >
            <Check className="size-4" />
          </button>
        </div>
      )}
    </section>
  )
}

export function TextFloatingPanel() {
  const { selected, tool, openTool, updateLayer, startEyedropper } = useEditor()
  const [expanded, setExpanded] = useState(true)

  if (!selected || selected.type !== 'text' || tool) return null

  const l = selected
  const up = (patch: any) => updateLayer(l.id, patch)

  const selectedFamily = l.fontFamily || 'Manrope'
  const currentWeight = getClosestAvailableWeight(selectedFamily, l.fontWeight || 700)

  const btnClass = 'grid h-8 w-8 place-items-center rounded-full transition-all active:scale-90 focus:outline-none'
  const inactiveBtnClass = `${btnClass} text-white/70 hover:bg-white/20 hover:text-white`
  const activeBtnClass = `${btnClass} bg-accent text-white shadow-sm ring-1 ring-accent/60`

  return (
    <section
      role="toolbar"
      aria-label="Text font toolbar"
      data-testid="floating-text-panel"
      className="pointer-events-auto absolute right-3 top-1/2 z-30 -translate-y-1/2 flex w-9 flex-col items-center gap-1 rounded-full border border-white/10 bg-black/60 p-1 text-xs font-semibold text-white shadow-2xl backdrop-blur-md transition-all duration-200"
    >
      {expanded ? (
        <div className="flex w-full flex-col items-center gap-1">
          {/* 1. Open font selector sheet */}
          <button
            type="button"
            data-testid="text-floating-font-btn"
            onClick={() => openTool('font')}
            aria-label="Font family selection"
            title={`Font: ${selectedFamily} (Click to change font)`}
            className={activeBtnClass}
          >
            <TypeIcon className="size-4" />
          </button>

          {/* 2. Text style & weights */}
          <button
            type="button"
            data-testid="text-floating-style-btn"
            onClick={() => openTool('style')}
            aria-label="Text style and real weights"
            title={`Style & Weights (Current weight: ${currentWeight})`}
            className={inactiveBtnClass}
          >
            <span className="text-[11px] font-bold">W</span>
          </button>

          {/* 3. Text color */}
          <button
            type="button"
            data-testid="text-floating-color-btn"
            onClick={() => openTool('color')}
            aria-label="Text color"
            title="Text color"
            className={inactiveBtnClass}
          >
            <div
              className="h-3.5 w-3.5 rounded-full border border-white/40 shadow-xs"
              style={{ backgroundColor: l.color || '#FFFFFF' }}
            />
          </button>

          {/* 3b. Color picker loupe icon beside color icon */}
          <button
            type="button"
            data-testid="text-floating-picker-btn"
            id="text-floating-picker-btn"
            onClick={() => {
              startEyedropper({
                target: 'layer',
                layerId: l.id,
                key: 'color',
                initialColor: l.color || '#FFFFFF',
                currentColor: l.color || '#FFFFFF',
              })
            }}
            aria-label="Color Loupe Eyedropper"
            title="Pick text color from screen"
            className={inactiveBtnClass}
          >
            <Pipette className="size-3.5" />
          </button>

          {/* 4. Text alignment cycle */}
          <button
            type="button"
            data-testid="text-floating-align-btn"
            onClick={() => {
              const nextAlign = l.align === 'left' ? 'center' : l.align === 'center' ? 'right' : 'left'
              up({ align: nextAlign })
            }}
            aria-label={`Alignment: ${l.align || 'left'}`}
            title={`Alignment: ${l.align || 'left'} (Click to cycle)`}
            className={inactiveBtnClass}
          >
            <span className="text-[10px] font-bold uppercase">{l.align ? l.align[0] : 'L'}</span>
          </button>

          {/* 5. Convert text to vector path */}
          <button
            type="button"
            data-testid="text-floating-vector-btn"
            onClick={() => openTool('convertText')}
            aria-label="Convert text to vector paths"
            title="Convert text to vector paths"
            className={`${inactiveBtnClass} hover:text-accent`}
          >
            <Spline className="size-4 text-accent" />
          </button>

          <div className="my-0.5 h-px w-4 bg-white/20" />

          {/* 6. Collapse toggle button */}
          <button
            type="button"
            data-testid="text-panel-toggle"
            onClick={() => setExpanded(false)}
            aria-label="Collapse text panel"
            title="Collapse text panel"
            className={inactiveBtnClass}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : (
        /* Collapsed state: Toggle button with the same TypeIcon as horizontal toolbar */
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            data-testid="text-panel-toggle"
            onClick={() => setExpanded(true)}
            aria-label="Open text element toolpanel"
            title="Open text element toolpanel"
            className={activeBtnClass}
          >
            <TypeIcon className="size-4" />
          </button>
        </div>
      )}
    </section>
  )
}

function VectorToolPanel() {
  const { openTool, selected, setVectorEditingId } = useEditor()
  useEffect(() => {
    if (selected && selected.type === 'path') {
      setVectorEditingId(selected.id)
    }
  }, [selected?.id, setVectorEditingId])
  if (!selected || selected.type !== 'path') return null
  return (
    <div className="absolute right-3 top-1/2 z-60 -translate-y-1/2" data-testid="vector-tool-panel">
      <div className="flex w-9 flex-col items-center gap-1 rounded-full border border-white/10 bg-black/60 p-1 text-white shadow-2xl backdrop-blur-md">
        <PanelBody tool="vector" />
        <button type="button" onClick={() => openTool(null)} aria-label="Close vector tools" title="Close vector tools" className="grid h-8 w-8 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/20 hover:text-white active:scale-90">
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

function VectorPanel() {
  const { l, up } = useSel()
  const { vectorSnap, toggleVectorSnap, selectedAnchorIndices, setSelectedAnchors, vectorEditingId, setVectorEditingId } = useEditor()
  const pts = l.points || []
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showNotice = (msg: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    setNotice(msg)
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2400)
  }

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (l && l.type === 'path' && vectorEditingId !== l.id) {
      setVectorEditingId(l.id)
    }
  }, [l?.id, vectorEditingId, setVectorEditingId])

  const validSelected = selectedAnchorIndices.filter((idx) => idx >= 0 && idx < pts.length)
  const activeAnchorIdx = validSelected.length > 0 ? validSelected[0] : 0
  const activePoint = pts[activeAnchorIdx]
  const currentMode = activePoint ? getPointBezierMode(activePoint) : 1

  const handleSetBezierMode = (targetMode: 1 | 2 | 3 | 4) => {
    if (!pts.length) return
    const targets = validSelected.length > 0 ? validSelected : [0]
    const updated = pts.map((pt, i) => {
      if (!targets.includes(i)) return pt
      const { prevPt, nextPt } = getAdjacentVectorPoints(pts, i, l.closed !== false)
      return switchPointBezierMode(pt, targetMode, prevPt, nextPt)
    })
    const tight = tightenVectorLayer({ ...l, points: updated })
    up(tight)
  }

  const toggleClosed = () => {
    up({ closed: !l.closed })
  }

  const addPoint = () => {
    if (pts.length === 0) {
      const tight = tightenVectorLayer({ ...l, points: [{ x: l.w * 0.5, y: l.h * 0.5, mode: 1 }] })
      up(tight)
      setSelectedAnchors([0])
      return
    }
    const selIdx = validSelected.length > 0 ? validSelected[validSelected.length - 1] : pts.length - 1
    const currPt = pts[selIdx]
    const { nextPt } = getAdjacentVectorPoints(pts, selIdx, l.closed !== false)

    let newX: number
    let newY: number

    if (!l.closed && !nextPt) {
      const { prevPt } = getAdjacentVectorPoints(pts, selIdx, false)
      const p = prevPt || { x: 0, y: 0 }
      const dx = currPt.x - p.x || 30
      const dy = currPt.y - p.y || 0
      newX = Math.round(Math.min(l.w + 60, Math.max(0, currPt.x + dx)))
      newY = Math.round(Math.min(l.h + 60, Math.max(0, currPt.y + dy)))
    } else if (nextPt) {
      newX = Math.round((currPt.x + nextPt.x) / 2)
      newY = Math.round((currPt.y + nextPt.y) / 2)
    } else {
      newX = Math.round(currPt.x + 20)
      newY = Math.round(currPt.y + 20)
    }

    const insertIdx = selIdx + 1
    const newPt: VectorPoint = { x: newX, y: newY, mode: 1 }
    const updated = [...pts.slice(0, insertIdx), newPt, ...pts.slice(insertIdx)]
    const tight = tightenVectorLayer({ ...l, points: updated })
    up(tight)
    setSelectedAnchors([insertIdx])
  }

  const removePoint = () => {
    const targets = validSelected.length > 0 ? validSelected : [pts.length - 1]
    if (pts.length - targets.length < 2) return

    const targetSet = new Set(targets)
    const updated: VectorPoint[] = []
    let transferSubpathStart = false

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const isStart = Boolean(i > 0 && p.subpathStart)
      if (targetSet.has(i)) {
        if (isStart || transferSubpathStart) {
          transferSubpathStart = true
        }
        continue
      }
      if (transferSubpathStart) {
        updated.push({ ...p, subpathStart: true })
        transferSubpathStart = false
      } else {
        updated.push(p)
      }
    }

    const tight = tightenVectorLayer({ ...l, points: updated })
    up(tight)
    const nextSel = Math.min(targets[0] ?? 0, updated.length - 1)
    setSelectedAnchors([Math.max(0, nextSel)])
  }

  const handleSimplifyPath = () => {
    if (!pts || pts.length <= 2) return
    const originalCount = pts.length
    const tolerance = originalCount > 25 ? 0.75 : 1.0
    const simplified = simplifyVectorPoints(pts, tolerance)
    if (simplified.length < originalCount) {
      const tight = tightenVectorLayer({ ...l, points: simplified })
      up(tight)
      setSelectedAnchors([0])
      const diff = originalCount - simplified.length
      const pct = Math.round((diff / originalCount) * 100)
      showNotice(`Simplified: -${diff} anchors (-${pct}%)`)
    } else {
      showNotice('Already optimal')
    }
  }

  const canDelete = pts.length - (validSelected.length > 0 ? validSelected.length : 1) >= 2
  const actionClass = 'grid h-8 w-8 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white active:scale-90 disabled:pointer-events-none disabled:opacity-30 focus:outline-none'
  const activeClass = `${actionClass} bg-accent text-white shadow-sm ring-1 ring-accent/60`

  return (
    <div className="flex flex-col items-center gap-1">
      {/* 1. Bézier mode 1 */}
      <button
        type="button"
        data-testid="vector-panel-mode-1"
        onClick={() => handleSetBezierMode(1)}
        aria-label="Mode 1: Corner / independent handles"
        title="Mode 1 — Corner / independent handles"
        className={currentMode === 1 ? activeClass : actionClass}
      >
        <BezierMode1Icon />
      </button>
      {/* 2. Bézier mode 2 */}
      <button
        type="button"
        data-testid="vector-panel-mode-2"
        onClick={() => handleSetBezierMode(2)}
        aria-label="Mode 2: Mirrored handles"
        title="Mode 2 — Mirrored handles"
        className={currentMode === 2 ? activeClass : actionClass}
      >
        <BezierMode2Icon />
      </button>
      {/* 3. Bézier mode 3 */}
      <button
        type="button"
        data-testid="vector-panel-mode-3"
        onClick={() => handleSetBezierMode(3)}
        aria-label="Mode 3: Asymmetric smooth handles"
        title="Mode 3 — Asymmetric smooth handles"
        className={currentMode === 3 ? activeClass : actionClass}
      >
        <BezierMode3Icon />
      </button>
      {/* 4. Bézier mode 4 */}
      <button
        type="button"
        data-testid="vector-panel-mode-4"
        onClick={() => handleSetBezierMode(4)}
        aria-label="Mode 4: Disconnected / free handles"
        title="Mode 4 — Disconnected / free handles (cusp)"
        className={currentMode === 4 ? activeClass : actionClass}
      >
        <BezierMode4Icon />
      </button>
      <div className="my-0.5 h-px w-4 bg-white/20" />
      {/* 5. Snap toggle */}
      <button
        type="button"
        data-testid="vector-panel-snap-toggle"
        onClick={toggleVectorSnap}
        aria-label={vectorSnap ? 'Disable snapping' : 'Enable snapping'}
        title={vectorSnap ? 'Snap: ON' : 'Snap: OFF'}
        className={vectorSnap ? activeClass : actionClass}
      >
        <Magnet className="size-4" />
      </button>
      {/* 6. Add anchor point */}
      <button
        type="button"
        data-testid="add-anchor-point-btn"
        onClick={addPoint}
        aria-label="Add anchor point"
        title="Add anchor point"
        className={actionClass}
      >
        <Plus className="size-4" />
      </button>
      {/* 7. Remove selected anchor point */}
      <button
        type="button"
        data-testid="remove-anchor-point-btn"
        onClick={removePoint}
        disabled={!canDelete}
        aria-label="Remove selected anchor point"
        title="Remove selected anchor point"
        className={`${actionClass} hover:text-red-400`}
      >
        <Trash2 className="size-4" />
      </button>
      {/* Closed path toggle */}
      <button
        type="button"
        data-testid="vector-toggle-closed"
        onClick={toggleClosed}
        disabled={pts.length < 2}
        aria-label={l.closed ? 'Open path' : 'Close path'}
        title={l.closed ? 'Open path' : 'Close path'}
        className={`${actionClass} ${l.closed ? 'bg-accent/40 text-accent' : ''}`}
      >
        <Spline className="size-4" />
      </button>
      {/* Simplify path (remove redundant anchors) */}
      <button
        type="button"
        data-testid="simplify-path-btn"
        onClick={handleSimplifyPath}
        disabled={pts.length < 3}
        aria-label="Simplify path: Remove redundant anchor points"
        title={`Simplify path — remove redundant anchor points (${pts.length} anchors)`}
        className={`${actionClass} hover:text-amber-300`}
      >
        <Wand2 className="size-4" />
      </button>
      <div className="my-0.5 h-px w-4 bg-white/20" />
      <div className="flex flex-col items-center gap-0.5" aria-label="Select anchor point">
        {pts.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelectedAnchors([i])}
            aria-label={`Select anchor point ${i + 1}`}
            title={`Point ${i + 1}`}
            className={`size-2 rounded-full transition-colors ${validSelected.includes(i) ? 'bg-accent' : 'bg-white/30 hover:bg-white/60'}`}
          />
        ))}
      </div>
      {notice && (
        <div className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-accent/40 bg-black/90 px-3 py-1.5 text-xs font-semibold text-accent shadow-2xl backdrop-blur-md">
          {notice}
        </div>
      )}
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
