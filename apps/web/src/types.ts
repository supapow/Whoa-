export type LayerType = 'text' | 'shape' | 'path' | 'image' | 'sticker' | 'group'
export type ShapeKind = 'rect' | 'rectangle' | 'pill' | 'circle' | 'triangle' | 'star' | 'line'
export type BgType = 'color' | 'gradient' | 'image'

export interface VectorPoint {
  x: number // px inside layer bounding box
  y: number
  cp1?: { x: number; y: number } // incoming control handle
  cp2?: { x: number; y: number } // outgoing control handle
  mode?: 1 | 2 | 3 | 4 // Bézier Mode: 1 (Corner/independent), 2 (Mirrored), 3 (Asymmetric smooth), 4 (Disconnected/free)
  subpathStart?: boolean // if true, begins a new subpath (M command)
}

export interface Background {
  type: BgType
  value: string // hex, css-gradient, or image url
}

export interface ShadowEffect {
  x: number // offset px
  y: number
  blur: number // px
  spread: number // px
  color: string // hex
  opacity: number // 0..1
}

export interface GradientStop {
  color: string // hex
  opacity: number // 0..1
  at: number // 0..100 position along the gradient
}

export interface LayerGradient {
  kind: 'linear' | 'radial'
  angle: number // linear direction in degrees (0 = to top, 90 = to right)
  stops: GradientStop[]
  // Explicit start/end in unit-box coords (0..1 = inside the layer box).
  // Values may lie outside 0..1 — handles can be dragged beyond the element.
  // When absent, endpoints are derived from `angle` (centered span).
  p1?: { x: number; y: number }
  p2?: { x: number; y: number }
}

/** Blur that dissolves toward one edge (gradient-masked backdrop blur). */
export interface BlurFade {
  side: 'top' | 'bottom' | 'left' | 'right' // edge the blur fades OUT toward
  length: number // % of the layer the fade ramp covers (1..100)
}

export interface Keyframe {
  id: string
  time: number // ms on timeline within [layer.start, layer.end]
  // transforms
  x: number
  y: number
  w: number
  h: number
  rotation: number
  opacity: number
  scale?: number
  // styles
  fontSize?: number
  fontWeight?: number
  color?: string
  fill?: string
  radius?: number
  blur?: number
  // effects
  dropShadow?: ShadowEffect
  innerShadow?: ShadowEffect
  points?: VectorPoint[]
}

export interface Layer {
  id: string
  type: LayerType
  name: string
  x: number // px in artboard space (top-left)
  y: number
  w: number
  h: number
  rotation: number
  opacity: number
  scale?: number
  blur?: number // px blur radius
  blurType?: 'element' | 'backdrop' // element blur or backdrop frosted blur
  blurFade?: BlurFade // dissolve the (backdrop) blur toward one edge
  // effects (stackable, each independently toggleable via presence)
  dropShadow?: ShadowEffect
  innerShadow?: ShadowEffect
  visible: boolean
  alwaysVisible?: boolean
  locked: boolean
  start: number // ms
  end: number // ms
  anim: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur' | 'rotate' | 'pulse'
  inAnim?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur' | 'rotate' | 'pulse'
  outAnim?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur' | 'rotate' | 'pulse'
  // rotate animation settings
  inRotateStart?: number // degrees (default: 0)
  inRotateEnd?: number // degrees (default: 30)
  inRotateMs?: number // ms (default: 150)
  outRotateStart?: number // degrees (default: 0)
  outRotateEnd?: number // degrees (default: 30)
  outRotateMs?: number // ms (default: 150)
  // keyframes
  keyframes?: Keyframe[]
  // text
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  color?: string
  align?: 'left' | 'center' | 'right'
  // shape
  shape?: ShapeKind
  fill?: string
  fillGradient?: LayerGradient // gradient fill for shape/path/text (overrides fill/color)
  radius?: number
  // vector path
  pathData?: string
  points?: VectorPoint[]
  closed?: boolean
  stroke?: string
  strokeWidth?: number
  strokeLinecap?: 'butt' | 'round' | 'square'
  strokeLinejoin?: 'miter' | 'round' | 'bevel'
  fillRule?: 'nonzero' | 'evenodd'
  // padding
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  // image / sticker
  src?: string
  emoji?: string
  imagePosition?: string
  imageFit?: 'cover' | 'contain'
  crop?: {
    x: number // px offset relative to layer box top-left
    y: number // px offset relative to layer box top-left
    w: number // rendered image width
    h: number // rendered image height
  }
  lockProportions?: boolean
  aspectRatio?: number
  // cross-variant links (creative scaling)
  masterId?: string
  layoutDetached?: boolean
  contentDetached?: boolean
  // group / component hierarchy
  groupId?: string
  // A mask is rendered above the sibling layers it clips. Multiple masks are supported.
  isMask?: boolean
  isComponent?: boolean
  componentId?: string
  collapsed?: boolean
}

export interface Preset {
  id: string
  label: string
  w: number
  h: number
  category: string
  ratio: string
}

export interface Project {
  id: string
  name: string
  preset: Preset
  background: Background
  layers: Layer[]
  duration: number // ms
  mode: 'static' | 'animated'
  updatedAt: number
}

export interface AdSet {
  id: string
  name: string
  masterPresetId: string
  variants: Project[]
  updatedAt: number
}
