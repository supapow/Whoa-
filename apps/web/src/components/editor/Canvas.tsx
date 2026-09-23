import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Move, RotateCw } from 'lucide-react'
import type { Layer, LayerType, VectorPoint } from '#/types'
import { useEditor } from '#/store/editor'
import { getDescendantLayers, getTopmostGroup, computeGroupBounds } from '#/lib/groups'
import { findCornerSizeMatch, findSizeMatch, getCandidateTargets, type SizeMatch } from '#/lib/sizeMatch'
import { findGapMatch, type GapMatchResult } from '#/lib/gapMatch'
import { findElementAlignMatch, type ElementAlignResult } from '#/lib/elementAlign'
import { parseImagePosition, formatImagePosition, calcImagePositionDelta } from '#/lib/imagePosition'
import { interpolateKeyframes } from '#/lib/keyframes'
import {
  buildSvgPath, scaleVectorPoints, tightenVectorLayer,
  updateHandleWithMode, snapVectorAnchor, snapVectorHandle, switchPointBezierMode,
  cloneVectorPoints, getAdjacentVectorPoints,
  type VectorAlignResult,
} from '#/lib/vector'

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  return { ref, size }
}

function isAlwaysVisible(layer: Layer, allLayers?: Layer[]): boolean {
  if (layer.alwaysVisible) return true
  if (allLayers && layer.groupId) {
    let currId: string | undefined = layer.groupId
    while (currId) {
      const parent = allLayers.find((item) => item.id === currId)
      if (!parent) break
      if (parent.alwaysVisible) return true
      currId = parent.groupId
    }
  }
  return false
}

function anim(layer: Layer, time: number, active: boolean, allLayers?: Layer[]) {
  const baseRot = layer.rotation ? `rotate(${layer.rotation}deg)` : ''
  const baseScale = layer.scale !== undefined && Math.abs(layer.scale - 1) > 0.005 ? `scale(${layer.scale.toFixed(3)})` : ''
  const baseTransform = [baseScale, baseRot].filter(Boolean).join(' ')
  const baseBlur = (layer.blur && layer.blur > 0 && layer.blurType !== 'backdrop') ? `blur(${layer.blur}px)` : 'none'
  if (!active) {
    return { opacity: layer.opacity, transform: baseTransform, filter: baseBlur, hidden: false }
  }

  // When alwaysVisible is active, elements are shown at all times in their resting state;
  // in- and out-animations are completely disabled so the user can easily align elements.
  if (isAlwaysVisible(layer, allLayers)) {
    return { opacity: layer.opacity, transform: baseTransform, filter: baseBlur, hidden: false }
  }

  let layerStart = layer.start
  let layerEnd = layer.end
  if (layer.type === 'group' && (layerStart === undefined || layerEnd === undefined) && allLayers) {
    const b = computeGroupBounds(layer.id, allLayers)
    if (layerStart === undefined) layerStart = b.minStart
    if (layerEnd === undefined) layerEnd = b.maxEnd
  }
  if (layerStart === undefined) layerStart = 0
  if (layerEnd === undefined) layerEnd = 5000

  // Outside layer lifespan, completely hidden
  if (time < layerStart || time > layerEnd) {
    return { opacity: 0, transform: '', filter: 'none', hidden: true }
  }

  // If layer has keyframes, keyframe interpolation governs the entire lifespan
  if (layer.keyframes && layer.keyframes.length > 0) {
    return { opacity: layer.opacity, transform: baseTransform, filter: baseBlur, hidden: false }
  }

  const inAnimType = layer.inAnim || layer.anim || 'none'
  const outAnimType = layer.outAnim || 'none'
  const layerDuration = Math.max(1, layerEnd - layerStart)

  // Determine standard or custom duration for animations
  const defaultInDur = inAnimType === 'blur' ? 650 : inAnimType === 'rotate' ? (layer.inRotateMs ?? 150) : inAnimType === 'pulse' ? 500 : 380
  const defaultOutDur = outAnimType === 'blur' ? 650 : outAnimType === 'rotate' ? (layer.outRotateMs ?? 150) : outAnimType === 'pulse' ? 500 : 380

  const inDur = Math.min(defaultInDur, Math.max(50, layerDuration / 2))
  const outDur = Math.min(defaultOutDur, Math.max(50, layerDuration / 2))

  const inElapsed = time - layerStart
  const outRemaining = layerEnd - time

  const isInActive = inAnimType !== 'none' && inElapsed < inDur
  const isOutActive = outAnimType !== 'none' && outRemaining < outDur

  // 1. In-animation phase
  if (isInActive) {
    const inP = Math.max(0, Math.min(1, inElapsed / inDur))
    const easeOut = 1 - Math.pow(1 - inP, 3) // cubic ease out

    let opacity = layer.opacity * easeOut
    let transform = baseRot
    let filter = baseBlur

    switch (inAnimType) {
      case 'fade':
        opacity = layer.opacity * easeOut
        break
      case 'rise': {
        const dy = (1 - easeOut) * 28
        transform = [dy > 0.1 ? `translateY(${dy.toFixed(1)}px)` : '', baseRot].filter(Boolean).join(' ')
        break
      }
      case 'pop': {
        const scale = 0.72 + 0.28 * easeOut
        transform = [Math.abs(scale - 1) > 0.005 ? `scale(${scale.toFixed(3)})` : '', baseRot].filter(Boolean).join(' ')
        break
      }
      case 'slide': {
        const dx = (1 - easeOut) * -48
        transform = [Math.abs(dx) > 0.1 ? `translateX(${dx.toFixed(1)}px)` : '', baseRot].filter(Boolean).join(' ')
        break
      }
      case 'blur': {
        // Pure optical rack-focus: deep 28px blur smoothly resolving into razor-sharp focus (or layer blur)
        const falloff = Math.pow(1 - inP, 1.8)
        const addedBlur = layer.blurType !== 'backdrop' ? (layer.blur || 0) : 0
        const blurPx = falloff * 28 + addedBlur
        opacity = layer.opacity * easeOut
        filter = blurPx > 0.1 ? `blur(${blurPx.toFixed(1)}px)` : 'none'
        transform = baseRot
        break
      }
      case 'rotate': {
        const startDeg = layer.inRotateStart ?? 0
        const endDeg = layer.inRotateEnd ?? 30
        const currentDeg = startDeg + (endDeg - startDeg) * easeOut
        const totalRot = (layer.rotation || 0) + currentDeg
        opacity = layer.opacity * easeOut
        transform = `rotate(${totalRot.toFixed(2)}deg)`
        break
      }
      case 'pulse': {
        // Pulse entrance: enters with smooth opacity fade and a rhythmic scale pulse
        opacity = layer.opacity * Math.min(1, inP * 2)
        const pulseCycle = Math.sin(inP * Math.PI * 2) * Math.pow(1 - inP, 0.75) * 0.22
        const scale = 1 + pulseCycle
        transform = [Math.abs(scale - 1) > 0.005 ? `scale(${scale.toFixed(3)})` : '', baseRot].filter(Boolean).join(' ')
        break
      }
    }

    return { opacity, transform, filter, hidden: false }
  }

  // 2. Out-animation phase
  if (isOutActive) {
    const outElapsed = outDur - outRemaining
    const outP = Math.max(0, Math.min(1, outElapsed / outDur)) // 0 (start exit) -> 1 (exit complete)
    const easeIn = Math.pow(outP, 3) // cubic ease in
    const easeInQuad = Math.pow(outP, 2)

    let opacity = layer.opacity * (1 - easeIn)
    let transform = baseRot
    let filter = baseBlur

    switch (outAnimType) {
      case 'fade':
        opacity = layer.opacity * (1 - easeIn)
        break
      case 'rise': {
        // Drifts upward gracefully while fading out
        const dy = -easeIn * 28
        transform = [Math.abs(dy) > 0.1 ? `translateY(${dy.toFixed(1)}px)` : '', baseRot].filter(Boolean).join(' ')
        break
      }
      case 'pop': {
        // Scales down smoothly as it fades
        const scale = 1 - 0.28 * easeInQuad
        transform = [Math.abs(scale - 1) > 0.005 ? `scale(${scale.toFixed(3)})` : '', baseRot].filter(Boolean).join(' ')
        break
      }
      case 'slide': {
        // Slides out cleanly to the right
        const dx = easeIn * 48
        transform = [Math.abs(dx) > 0.1 ? `translateX(${dx.toFixed(1)}px)` : '', baseRot].filter(Boolean).join(' ')
        break
      }
      case 'blur': {
        // Cinematic defocus: smoothly defocuses into a deep 28px blur as it dissolves away
        const defocus = Math.pow(outP, 1.8)
        const addedBlur = layer.blurType !== 'backdrop' ? (layer.blur || 0) : 0
        const blurPx = defocus * 28 + addedBlur
        opacity = layer.opacity * (1 - easeIn)
        filter = blurPx > 0.1 ? `blur(${blurPx.toFixed(1)}px)` : 'none'
        transform = baseRot
        break
      }
      case 'rotate': {
        const startDeg = layer.outRotateStart ?? 0
        const endDeg = layer.outRotateEnd ?? 30
        const currentDeg = startDeg + (endDeg - startDeg) * easeIn
        const totalRot = (layer.rotation || 0) + currentDeg
        opacity = layer.opacity * (1 - easeIn)
        transform = `rotate(${totalRot.toFixed(2)}deg)`
        break
      }
      case 'pulse': {
        // Pulse exit: quick energetic pulse swell, then smoothly shrinks and dissolves
        const pulseCycle = Math.sin(outP * Math.PI * 2) * (1 - outP) * 0.2
        const scale = Math.max(0.01, (1 + pulseCycle) * (1 - outP * 0.35))
        opacity = layer.opacity * (1 - Math.pow(outP, 1.4))
        transform = [Math.abs(scale - 1) > 0.005 ? `scale(${scale.toFixed(3)})` : '', baseRot].filter(Boolean).join(' ')
        break
      }
    }

    return { opacity, transform, filter, hidden: false }
  }

  // 3. Resting state
  return { opacity: layer.opacity, transform: baseTransform, filter: baseBlur, hidden: false }
}

interface CompositeAnimResult {
  opacity: number
  transform: string
  filter: string
  hidden: boolean
}

function getCompositeAnim(
  layer: Layer,
  time: number,
  active: boolean,
  allLayers: Layer[]
): CompositeAnimResult {
  if (layer.visible === false) {
    return { opacity: 0, transform: '', filter: 'none', hidden: true }
  }

  // Collect all ancestor groups from outermost (root) to innermost (parent)
  const ancestors: Layer[] = []
  let currGroupId = layer.groupId
  while (currGroupId) {
    const parent = allLayers.find((item) => item.id === currGroupId)
    if (!parent) break
    ancestors.unshift(parent)
    currGroupId = parent.groupId
  }

  // If any ancestor group is hidden or outside its lifespan, hide this layer
  for (const group of ancestors) {
    if (group.visible === false) {
      return { opacity: 0, transform: '', filter: 'none', hidden: true }
    }
    const effG = group.keyframes && group.keyframes.length > 0 ? interpolateKeyframes(group, time) : group
    const gA = anim(effG, time, active, allLayers)
    if (gA.hidden) {
      return { opacity: 0, transform: '', filter: 'none', hidden: true }
    }
  }

  const effectiveLayer = layer.keyframes && layer.keyframes.length > 0 ? interpolateKeyframes(layer, time) : layer
  const selfAnim = anim(effectiveLayer, time, active, allLayers)
  if (selfAnim.hidden) {
    return { opacity: 0, transform: '', filter: 'none', hidden: true }
  }

  let finalOpacity = selfAnim.opacity
  const transformParts: string[] = []
  const filterParts: string[] = []

  // Compound transforms, opacities, and filters from ancestor groups (outermost to innermost)
  for (const group of ancestors) {
    const effG = group.keyframes && group.keyframes.length > 0 ? interpolateKeyframes(group, time) : group
    const gA = anim(effG, time, active, allLayers)

    finalOpacity *= gA.opacity

    if (gA.filter && gA.filter !== 'none') {
      filterParts.push(gA.filter)
    }

    const gb = computeGroupBounds(group.id, allLayers)
    const gCenterX = (group.x || gb.x) + (group.w || gb.w) / 2
    const gCenterY = (group.y || gb.y) + (group.h || gb.h) / 2
    const originX = gCenterX - effectiveLayer.x
    const originY = gCenterY - effectiveLayer.y

    if (group.keyframes && group.keyframes.length > 0) {
      const kfDx = effG.x - (group.x || gb.x)
      const kfDy = effG.y - (group.y || gb.y)
      const kfScale = effG.scale !== undefined && Math.abs(effG.scale - 1) > 0.005 ? effG.scale : 1
      const kfRot = effG.rotation || 0

      if (Math.abs(kfDx) > 0.05 || Math.abs(kfDy) > 0.05 || Math.abs(kfScale - 1) > 0.005 || Math.abs(kfRot) > 0.05) {
        transformParts.push(
          `translate(${(kfDx + originX).toFixed(1)}px, ${(kfDy + originY).toFixed(1)}px) rotate(${kfRot.toFixed(2)}deg) scale(${kfScale.toFixed(3)}) translate(${(-originX).toFixed(1)}px, ${(-originY).toFixed(1)}px)`
        )
      }
    } else if (gA.transform && gA.transform.trim() !== '') {
      if (gA.transform.includes('scale') || gA.transform.includes('rotate')) {
        transformParts.push(
          `translate(${originX.toFixed(1)}px, ${originY.toFixed(1)}px) ${gA.transform} translate(${(-originX).toFixed(1)}px, ${(-originY).toFixed(1)}px)`
        )
      } else {
        transformParts.push(gA.transform)
      }
    }
  }

  if (selfAnim.filter && selfAnim.filter !== 'none') {
    filterParts.push(selfAnim.filter)
  }

  if (selfAnim.transform && selfAnim.transform.trim() !== '') {
    transformParts.push(selfAnim.transform)
  }

  const finalTransform = transformParts.filter(Boolean).join(' ')
  const finalFilter = filterParts.length > 0 ? filterParts.join(' ') : 'none'

  return {
    opacity: Math.max(0, Math.min(1, finalOpacity)),
    transform: finalTransform,
    filter: finalFilter,
    hidden: false,
  }
}

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))
const tdist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
const tmid = (a: Touch, b: Touch) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 })

const SNAP_TOLERANCE_PX = 8
const SIZE_SNAP_TOLERANCE_PX = 8
const GAP_SNAP_TOLERANCE_PX = 8

type SnapCandidate = { delta: number; distance: number; guide: number }

function closestSnap(candidates: SnapCandidate[], tolerance: number) {
  const matches = candidates.filter((candidate) => candidate.distance <= tolerance).sort((a, b) => a.distance - b.distance)
  if (matches.length === 0) {
    return { delta: 0, guides: [] }
  }
  const bestDelta = matches[0].delta
  return {
    delta: bestDelta,
    guides: matches.filter((candidate) => candidate.delta === bestDelta).map((candidate) => candidate.guide),
  }
}

function snapDelta(left: number, top: number, w: number, h: number, artW: number, artH: number, tolerance: number) {
  const right = left + w
  const centerX = left + w / 2
  const bottom = top + h
  const centerY = top + h / 2
  const artCenterX = artW / 2
  const artCenterY = artH / 2

  const xCandidates = [
    { delta: -left, distance: Math.abs(left), guide: 0 },
    { delta: artCenterX - left, distance: Math.abs(left - artCenterX), guide: artCenterX },
    { delta: artW - right, distance: Math.abs(right - artW), guide: artW },
    { delta: artCenterX - right, distance: Math.abs(right - artCenterX), guide: artCenterX },
    { delta: artCenterX - centerX, distance: Math.abs(centerX - artCenterX), guide: artCenterX },
  ]
  const yCandidates = [
    { delta: artH - bottom, distance: Math.abs(bottom - artH), guide: artH },
    { delta: artCenterY - bottom, distance: Math.abs(bottom - artCenterY), guide: artCenterY },
    { delta: -top, distance: Math.abs(top), guide: 0 },
    { delta: artCenterY - top, distance: Math.abs(top - artCenterY), guide: artCenterY },
    { delta: artCenterY - centerY, distance: Math.abs(centerY - artCenterY), guide: artCenterY },
  ]

  const xSnap = closestSnap(xCandidates, tolerance)
  const ySnap = closestSnap(yCandidates, tolerance)
  return {
    dx: xSnap.delta,
    dy: ySnap.delta,
    xGuides: [...new Set(xSnap.guides)],
    yGuides: [...new Set(ySnap.guides)],
  }
}

type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'r' | 'b' | 'l'

interface RotationSnapState {
  active: boolean
  angle: number
  cx: number
  cy: number
  isSnapped: boolean
  snapDegree: number
  isNormal: boolean
  label: string
  deltaAngle: number
}

type Gesture =
  | { id: string; mode: 'move'; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; fromCanvas: boolean; moved: boolean; deselectOnTap?: boolean; tapToggleId?: string; tapAddId?: string; group?: { id: string; x: number; y: number; w: number; h: number }[] }
  | {
      id: string
      mode: 'vector-anchor'
      sx: number
      sy: number
      startPoints: VectorPoint[]
      activeSelected: number[]
      snapAnchorIdx: number
      layerW: number
      layerH: number
      rotation?: number
      moved: boolean
      deselectOnTap?: boolean
    }
  | {
      id: string
      mode: 'resize'
      handle: ResizeHandle
      isCorner?: boolean
      cornerMode?: 'pending' | 'resize' | 'rotate'
      centerX: number
      centerY: number
      handleAngle: number
      startPointerAngle: number
      initialRotation: number
      initialLayerStates?: { id: string; x: number; y: number; w: number; h: number; rotation: number; centerX: number; centerY: number }[]
      isText: boolean
      isImage?: boolean
      lockProportions?: boolean
      aspectRatio?: number
      layerType?: LayerType
      sx: number
      sy: number
      ox: number
      oy: number
      ow: number
      oh: number
      ofs: number
      origPadTop: number
      origPadRight: number
      origPadBottom: number
      origPadLeft: number
      group?: { id: string; x: number; y: number; w: number; h: number; fontSize?: number; crop0?: { x: number; y: number; w: number; h: number }; isCroppedImage?: boolean; origPoints?: VectorPoint[] }[]
      bgShapeIds?: string[]
      minFgLeft?: number
      maxFgRight?: number
      minFgTop?: number
      maxFgBottom?: number
      origCrop?: { x: number; y: number; w: number; h: number }
      origPoints?: VectorPoint[]
    }
  | {
      id: string
      mode: 'image-position'
      sx: number
      sy: number
      startPosX: number
      startPosY: number
      layerW: number
      layerH: number
      naturalW: number
      naturalH: number
      moved: boolean
      origCrop?: { x: number; y: number; w: number; h: number }
    }
  | null

function findGroupBackgroundShapes(
  groupLayers: { id: string; x: number; y: number; w: number; h: number }[],
  allLayers: Layer[],
  boxW: number,
  boxH: number,
  boundsLeft: number,
  boundsTop: number,
): string[] {
  const bgIds: string[] = []
  for (const item of groupLayers) {
    const layer = allLayers.find((l) => l.id === item.id)
    if (!layer || layer.type !== 'shape') continue
    const spansW = item.w >= boxW * 0.7
    const spansH = item.h >= boxH * 0.7
    const atOrigin = Math.abs(item.x - boundsLeft) < 40 && Math.abs(item.y - boundsTop) < 40
    if ((spansW || spansH) && atOrigin) {
      bgIds.push(item.id)
    }
  }
  if (bgIds.length === 0 && groupLayers.length > 1) {
    const firstLayer = allLayers.find((l) => l.id === groupLayers[0].id)
    if (firstLayer && firstLayer.type === 'shape' && (groupLayers[0].w >= boxW * 0.5 || groupLayers[0].h >= boxH * 0.5)) {
      bgIds.push(groupLayers[0].id)
    }
  }
  return bgIds
}

type Pinch =
  | { mode: 'zoom'; startDist: number; s0: number; lx: number; ly: number }
  | {
      mode: 'resize'
      id: string
      startDist: number
      w0: number
      h0: number
      x0: number
      y0: number
      fontSize: number
      group?: { id: string; x: number; y: number; w: number; h: number; fontSize?: number; crop0?: { x: number; y: number; w: number; h: number }; isCroppedImage?: boolean; origPoints?: VectorPoint[] }[]
      crop0?: { x: number; y: number; w: number; h: number }
      isCroppedImage?: boolean
      points0?: VectorPoint[]
    }
  | null

export default function Canvas() {
  const {
    project, selectedId, selectedIds, select, toggleSelect, updateLayer, time, mode, playing,
    artboardSnap, vectorSnap, selectedAnchorIndices, setSelectedAnchors, toggleSelectedAnchor,
    anchorMultiSelectMode, setAnchorMultiSelectMode,
    nudge, imagePositioningId, setImagePositioningId, vectorEditingId, setVectorEditingId, timelineOpen, checkpoint,
    eyedropper,
  } = useEditor()
  const [nudgeIncrement, setNudgeIncrement] = useState<number>(1)
  const nudgeIncrementRef = useRef<number>(1)
  nudgeIncrementRef.current = nudgeIncrement
  const [editingNudgeIncrement, setEditingNudgeIncrement] = useState<boolean>(false)
  const [customNudgeInput, setCustomNudgeInput] = useState<string>('1')
  const nudgePopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editingNudgeIncrement) return
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (nudgePopoverRef.current && !nudgePopoverRef.current.contains(e.target as Node)) {
        setEditingNudgeIncrement(false)
      }
    }
    window.addEventListener('pointerdown', handleClickOutside)
    return () => window.removeEventListener('pointerdown', handleClickOutside)
  }, [editingNudgeIncrement])

  const { ref, size } = useSize<HTMLDivElement>()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null)
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [snapGuides, setSnapGuides] = useState<{ active: boolean; xGuides: number[]; yGuides: number[] } | null>(null)
  const [sizeMatch, setSizeMatch] = useState<SizeMatch | null>(null)
  const [gapMatch, setGapMatch] = useState<GapMatchResult | null>(null)
  const [elementAlign, setElementAlign] = useState<ElementAlignResult | null>(null)
  const [rotationSnap, setRotationSnap] = useState<RotationSnapState | null>(null)
  const [vectorAlign, setVectorAlign] = useState<(VectorAlignResult & { layerId: string }) | null>(null)
  const vectorAlignNudgeTimer = useRef<number | null>(null)
  const marqueeSession = useRef<{ active: boolean; start: { x: number; y: number }; update?: (event: PointerEvent) => void; finish?: (event: PointerEvent) => void }>({ active: false, start: { x: 0, y: 0 } })
  const marqueeLongPress = useRef<number | null>(null)
  const [pinchActive, setPinchActive] = useState(false)
  const longPress = useRef<number | null>(null)
  const pendingMultiSelectTap = useRef<number | null>(null)
  const pinchTouchSequence = useRef(false)
  const pinchStartedInMultiSelect = useRef(false)
  const multiSelectModeRef = useRef(false)
  multiSelectModeRef.current = multiSelectMode
  const isSpacePressed = useRef(false)
  const gesture = useRef<Gesture>(null)
  const panGesture = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean }>(null)
  const selRef = useRef<HTMLDivElement>(null)
  const layerRefs = useRef(new Map<string, HTMLDivElement>())
  const [selH, setSelH] = useState(0)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const viewRef = useRef(view)
  viewRef.current = view
  const pinch = useRef<Pinch>(null)
  const pinching = useRef(false)
  const touchCount = useRef(0)
  const touchSelectionLock = useRef<string | null>(null)
  const activeTouches = useRef(new Map<number, { x: number; y: number }>())
  const selectedRef = useRef(selectedId)
  const selectedIdsRef = useRef(selectedIds)
  selectedRef.current = selectedId
  selectedIdsRef.current = selectedIds
  const gestureStartSelectionRef = useRef<string | null>(null)
  if (touchCount.current === 0 && activeTouches.current.size === 0 && !pinching.current) {
    gestureStartSelectionRef.current = (selectedId && selectedIds.includes(selectedId))
      ? selectedId
      : (selectedIds[0] ?? null)
  }
  const layersRef = useRef(project.layers)
  layersRef.current = project.layers
  const selHRef = useRef(selH)
  selHRef.current = selH
  const artboardSnapRef = useRef(artboardSnap)
  artboardSnapRef.current = artboardSnap
  const vectorSnapRef = useRef(vectorSnap)
  vectorSnapRef.current = vectorSnap
  const vectorEditingIdRef = useRef(vectorEditingId)
  vectorEditingIdRef.current = vectorEditingId
  const selectedAnchorIndicesRef = useRef(selectedAnchorIndices)
  selectedAnchorIndicesRef.current = selectedAnchorIndices
  const anchorMultiSelectModeRef = useRef(anchorMultiSelectMode)
  anchorMultiSelectModeRef.current = anchorMultiSelectMode
  const anchorHoldTimer = useRef<number | null>(null)
  const anchorHoldTriggered = useRef(false)
  const lastAnchorGestureMoved = useRef(false)
  const [holdingAnchorIdx, setHoldingAnchorIdx] = useState<number | null>(null)

  // Clear vector alignment guides whenever vector editing layer or selected anchors change
  useEffect(() => {
    setVectorAlign(null)
  }, [vectorEditingId, selectedAnchorIndices])
  const tapTrackerRef = useRef<{
    layerId: string
    time: number
    count: number
    initialX?: number
    initialW?: number
    widenedInSequence?: boolean
  }>({
    layerId: '',
    time: 0,
    count: 0,
  })
  const lastGestureMovedRef = useRef(false)
  const lastPinchEndTime = useRef(0)

  const getExcludeIds = useCallback((gId?: string, group?: { id: string }[]) => {
    const exclude = new Set<string>()
    if (group) {
      for (const item of group) {
        exclude.add(item.id)
        for (const d of getDescendantLayers(item.id, layersRef.current)) exclude.add(d.id)
      }
    }
    if (gId) {
      exclude.add(gId)
      for (const d of getDescendantLayers(gId, layersRef.current)) exclude.add(d.id)
    }
    for (const id of selectedIdsRef.current) {
      exclude.add(id)
      for (const d of getDescendantLayers(id, layersRef.current)) exclude.add(d.id)
    }
    return exclude
  }, [])
  const { preset } = project
  const active = mode === 'animated' && (playing || time > 0 || timelineOpen || Boolean(selectedId))

  const center = useCallback(() => {
    const el = ref.current
    if (!el) return { cx: 0, cy: 0 }
    const r = el.getBoundingClientRect()
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  }, [ref])

  const pad = 0.9
  const scale = size.w && size.h ? Math.min((size.w * pad) / preset.w, (size.h * pad) / preset.h) : 0

  // measure the selected layer's rendered box (text height is auto)
  useLayoutEffect(() => {
    if (!selRef.current) return
    const el = selRef.current
    const update = () => setSelH(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [selectedId, editingId])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const pan = panGesture.current
      if (pan) {
        const dx = e.clientX - pan.sx
        const dy = e.clientY - pan.sy
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) pan.moved = true
        setView((v) => ({ ...v, x: pan.ox + dx, y: pan.oy + dy }))
        return
      }
      const g = gesture.current
      if (!g || !scale) return
      const eff = scale * viewRef.current.scale
      const dx = (e.clientX - g.sx) / eff
      const dy = (e.clientY - g.sy) / eff
      if (g.mode === 'image-position') {
        const dist = Math.hypot(e.clientX - g.sx, e.clientY - g.sy)
        if (dist > 3) g.moved = true
        if (g.origCrop) {
          updateLayer(g.id, {
            crop: {
              ...g.origCrop,
              x: Math.round(g.origCrop.x + dx),
              y: Math.round(g.origCrop.y + dy),
            },
          })
          return
        }
        const next = calcImagePositionDelta(
          { x: g.startPosX, y: g.startPosY },
          dx,
          dy,
          g.layerW,
          g.layerH,
          g.naturalW,
          g.naturalH,
        )
        updateLayer(g.id, {
          imagePosition: formatImagePosition(next.x, next.y),
        })
        return
      }
      if (g.mode === 'vector-anchor') {
        const dist = Math.hypot(e.clientX - g.sx, e.clientY - g.sy)
        if (dist > 3) {
          if (longPress.current) {
            window.clearTimeout(longPress.current)
            longPress.current = null
          }
          if (marqueeLongPress.current) {
            window.clearTimeout(marqueeLongPress.current)
            marqueeLongPress.current = null
          }
          if (anchorHoldTimer.current) {
            window.clearTimeout(anchorHoldTimer.current)
            anchorHoldTimer.current = null
            setHoldingAnchorIdx(null)
          }
          g.moved = true
          lastAnchorGestureMoved.current = true
        }
        if (g.moved) {
          let adx = dx
          let ady = dy
          if (g.rotation) {
            const rad = ((g.rotation || 0) * Math.PI) / 180
            const cos = Math.cos(rad)
            const sin = Math.sin(rad)
            adx = dx * cos + dy * sin
            ady = -dx * sin + dy * cos
          }
          const snapAnchorIdx = g.snapAnchorIdx
          if (vectorSnapRef.current && g.startPoints[snapAnchorIdx]) {
            const candX = Math.round(g.startPoints[snapAnchorIdx].x + adx)
            const candY = Math.round(g.startPoints[snapAnchorIdx].y + ady)
            const snapped = snapVectorAnchor(
              candX,
              candY,
              g.startPoints,
              g.activeSelected,
              g.layerW,
              g.layerH
            )
            adx = snapped.x - g.startPoints[snapAnchorIdx].x
            ady = snapped.y - g.startPoints[snapAnchorIdx].y
            if (snapped.snappedX || snapped.snappedY) {
              setVectorAlign({
                layerId: g.id,
                x: snapped.x,
                y: snapped.y,
                snappedX: snapped.snappedX,
                snappedY: snapped.snappedY,
                xMatches: snapped.xMatches,
                yMatches: snapped.yMatches,
              })
            } else {
              setVectorAlign(null)
            }
          } else {
            setVectorAlign(null)
          }
          const updated = g.startPoints.map((p, idx) => {
            if (!g.activeSelected.includes(idx)) return p
            const nX = Math.round(p.x + adx)
            const nY = Math.round(p.y + ady)
            return {
              ...p,
              x: nX,
              y: nY,
              cp1: p.cp1 ? { x: Math.round(p.cp1.x + adx), y: Math.round(p.cp1.y + ady) } : undefined,
              cp2: p.cp2 ? { x: Math.round(p.cp2.x + adx), y: Math.round(p.cp2.y + ady) } : undefined,
            }
          })
          updateLayer(g.id, { points: updated })
        }
        return
      }
      if (g.mode === 'move') {
        const dist = Math.hypot(e.clientX - g.sx, e.clientY - g.sy)
        if (dist > 4) {
          if (longPress.current) {
            window.clearTimeout(longPress.current)
            longPress.current = null
          }
          if (marqueeLongPress.current) {
            window.clearTimeout(marqueeLongPress.current)
            marqueeLongPress.current = null
          }
          g.moved = true
        }
        if (g.moved) {
          const rawX = g.ox + dx
          const rawY = g.oy + dy
          const bounds = g.group
            ? g.group.reduce(
                (box, item) => ({
                  left: Math.min(box.left, item.x + dx),
                  top: Math.min(box.top, item.y + dy),
                  right: Math.max(box.right, item.x + dx + item.w),
                  bottom: Math.max(box.bottom, item.y + dy + item.h),
                }),
                { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
              )
            : { left: rawX, top: rawY, right: rawX + g.ow, bottom: rawY + g.oh }
          const targetW = bounds.right - bounds.left
          const targetH = bounds.bottom - bounds.top
          const snap = artboardSnapRef.current
            ? snapDelta(bounds.left, bounds.top, targetW, targetH, preset.w, preset.h, SNAP_TOLERANCE_PX / eff)
            : { dx: 0, dy: 0, xGuides: [], yGuides: [] }

          let finalDx = snap.dx
          let finalDy = snap.dy
          let activeXGuides = snap.xGuides
          let activeYGuides = snap.yGuides

          if (artboardSnapRef.current) {
            const excludeIds = getExcludeIds(g.id, g.group)
            const candidates = getCandidateTargets(layersRef.current, excludeIds, layerRefs.current, preset.w)

            // Calculate element-to-element alignment
            const elemAlign = findElementAlignMatch(
              { x: bounds.left, y: bounds.top, w: targetW, h: targetH },
              candidates,
              SNAP_TOLERANCE_PX / eff,
            )

            let hasElemX = false
            let hasElemY = false

            if (elemAlign.xMatches.length > 0) {
              if (activeXGuides.length === 0 || Math.abs(elemAlign.dx) <= Math.abs(finalDx)) {
                finalDx = elemAlign.dx
                activeXGuides = elemAlign.xMatches.map((m) => m.guideCoord)
                hasElemX = true
              }
            }

            if (elemAlign.yMatches.length > 0) {
              if (activeYGuides.length === 0 || Math.abs(elemAlign.dy) <= Math.abs(finalDy)) {
                finalDy = elemAlign.dy
                activeYGuides = elemAlign.yMatches.map((m) => m.guideCoord)
                hasElemY = true
              }
            }

            if (candidates.length >= 2) {
              const gapRes = findGapMatch(
                { x: bounds.left, y: bounds.top, w: targetW, h: targetH },
                candidates,
                GAP_SNAP_TOLERANCE_PX,
              )
              const hasGapY = gapRes.gaps.some((item) => item.axis === 'y')
              const hasGapX = gapRes.gaps.some((item) => item.axis === 'x')
              if (hasGapY && (!hasElemY || Math.abs(gapRes.dy) < Math.abs(elemAlign.dy))) {
                finalDy = gapRes.dy
                activeYGuides = []
                hasElemY = false
              }
              if (hasGapX && (!hasElemX || Math.abs(gapRes.dx) < Math.abs(elemAlign.dx))) {
                finalDx = gapRes.dx
                activeXGuides = []
                hasElemX = false
              }
              if (gapRes.gaps.length > 0) {
                setGapMatch(gapRes)
              } else {
                setGapMatch(null)
              }
            } else {
              setGapMatch(null)
            }

            if (hasElemX || hasElemY) {
              setElementAlign({
                dx: finalDx,
                dy: finalDy,
                xMatches: hasElemX ? elemAlign.xMatches : [],
                yMatches: hasElemY ? elemAlign.yMatches : [],
              })
            } else {
              setElementAlign(null)
            }

            setSnapGuides({
              active: true,
              xGuides: Array.from(new Set(activeXGuides)),
              yGuides: Array.from(new Set(activeYGuides)),
            })
          } else {
            setSnapGuides(null)
            setGapMatch(null)
            setElementAlign(null)
          }

          if (g.group) {
            for (const item of g.group) {
              updateLayer(item.id, { x: Math.round(item.x + dx + finalDx), y: Math.round(item.y + dy + finalDy), w: item.w, h: item.h })
            }
          } else {
            updateLayer(g.id, { x: Math.round(rawX + finalDx), y: Math.round(rawY + finalDy), w: g.ow, h: g.oh })
          }
        }
        return
      }
      // Resize from a corner or side handle (center of top, right, bottom, left)
      const handle = g.handle
      const isCorner = handle === 'tl' || handle === 'tr' || handle === 'bl' || handle === 'br'
      const isLeft = handle === 'tl' || handle === 'bl' || handle === 'l'
      const isRight = handle === 'tr' || handle === 'br' || handle === 'r'
      const isTop = handle === 'tl' || handle === 'tr' || handle === 't'
      const isBottom = handle === 'bl' || handle === 'br' || handle === 'b'

      if (isCorner) {
        const distFromStart = Math.hypot(e.clientX - g.sx, e.clientY - g.sy)
        if (g.cornerMode === 'pending') {
          if (distFromStart < 6) {
            return
          }
          const moveAngle = (Math.atan2(e.clientY - g.sy, e.clientX - g.sx) * 180) / Math.PI
          let diffToRadial = Math.abs((moveAngle - g.handleAngle) % 360)
          if (diffToRadial > 180) diffToRadial = 360 - diffToRadial
          const axialDiff = Math.min(diffToRadial, Math.abs(180 - diffToRadial))

          // If moving outward or inward along the corner diagonal within 28° tolerance => resize
          // Otherwise (circular / tangential movement) => rotate
          if (axialDiff <= 28) {
            g.cornerMode = 'resize'
          } else {
            g.cornerMode = 'rotate'
          }
        }

        if (g.cornerMode === 'rotate') {
          const artboardEl = document.querySelector('[data-testid="artboard"]')
          const artboardRect = artboardEl?.getBoundingClientRect()
          if (!artboardRect) return

          const clientCenterX = artboardRect.left + g.centerX * eff
          const clientCenterY = artboardRect.top + g.centerY * eff

          const currentPointerAngle = (Math.atan2(e.clientY - clientCenterY, e.clientX - clientCenterX) * 180) / Math.PI
          let deltaAngle = currentPointerAngle - g.startPointerAngle

          while (deltaAngle <= -180) deltaAngle += 360
          while (deltaAngle > 180) deltaAngle -= 360

          const isMultiSelect = Boolean(g.group && g.group.length > 1)
          const baseAngleToCheck = isMultiSelect ? deltaAngle : (g.initialRotation + deltaAngle)

          let normalizedAngle = baseAngleToCheck % 360
          while (normalizedAngle <= -180) normalizedAngle += 360
          while (normalizedAngle > 180) normalizedAngle -= 360

          // Important snap degrees: 0° (normal degree), 45°, 90°, 135°, 180°, etc.
          const snapTargets = [
            { deg: 0, label: '0°', tol: 6, isNormal: true },
            { deg: 45, label: '45°', tol: 3.5 },
            { deg: 90, label: '90°', tol: 4.5 },
            { deg: 135, label: '135°', tol: 3.5 },
            { deg: 180, label: '180°', tol: 4.5 },
            { deg: -135, label: '-135°', tol: 3.5 },
            { deg: -90, label: '-90°', tol: 4.5 },
            { deg: -45, label: '-45°', tol: 3.5 },
          ]

          let bestSnap: typeof snapTargets[0] | null = null
          let minDiff = Infinity

          for (const target of snapTargets) {
            let diff = Math.abs(normalizedAngle - target.deg)
            if (diff > 180) diff = 360 - diff
            if (diff <= target.tol && diff < minDiff) {
              minDiff = diff
              bestSnap = target
            }
          }

          let finalAngle = normalizedAngle
          let isSnapped = false
          let snapLabel = `${Math.round(normalizedAngle)}°`
          let isNormal = false

          if (bestSnap) {
            finalAngle = bestSnap.deg
            isSnapped = true
            snapLabel = bestSnap.label
            isNormal = Boolean(bestSnap.isNormal)
          } else {
            finalAngle = Math.round(normalizedAngle * 10) / 10
          }

          const effectiveDelta = isMultiSelect ? finalAngle : (finalAngle - g.initialRotation)

          if (isMultiSelect && g.initialLayerStates) {
            const rad = (effectiveDelta * Math.PI) / 180
            const cos = Math.cos(rad)
            const sin = Math.sin(rad)

            for (const item of g.initialLayerStates) {
              const dxC = item.centerX - g.centerX
              const dyC = item.centerY - g.centerY
              const newCenterX = g.centerX + (dxC * cos - dyC * sin)
              const newCenterY = g.centerY + (dxC * sin + dyC * cos)
              const newX = Math.round(newCenterX - item.w / 2)
              const newY = Math.round(newCenterY - item.h / 2)
              let newRot = (item.rotation + effectiveDelta) % 360
              while (newRot <= -180) newRot += 360
              while (newRot > 180) newRot -= 360
              if (isSnapped && effectiveDelta === 0) {
                newRot = item.rotation
              }
              updateLayer(item.id, {
                x: newX,
                y: newY,
                rotation: Math.round(newRot * 10) / 10,
              })
            }
          } else {
            updateLayer(g.id, {
              rotation: finalAngle === 0 ? 0 : Math.round(finalAngle * 10) / 10,
            })
          }

          setRotationSnap({
            active: true,
            angle: finalAngle,
            cx: g.centerX,
            cy: g.centerY,
            isSnapped,
            snapDegree: isSnapped ? bestSnap!.deg : finalAngle,
            isNormal,
            label: snapLabel,
            deltaAngle: effectiveDelta,
          })
          setSnapGuides(null)
          setSizeMatch(null)
          setGapMatch(null)
          setElementAlign(null)
          return
        }
      }

      let effDx = dx
      let effDy = dy
      if (isCorner && !g.group && g.initialRotation) {
        const rot = g.initialRotation
        const rotRad = (rot * Math.PI) / 180
        effDx = dx * Math.cos(rotRad) + dy * Math.sin(rotRad)
        effDy = -dx * Math.sin(rotRad) + dy * Math.cos(rotRad)
      }

      let newW = g.ow
      let newH = g.oh

      if (isLeft) {
        newW = Math.max(15, g.ow - effDx)
      } else if (isRight) {
        newW = Math.max(15, g.ow + effDx)
      }

      if (isTop) {
        newH = Math.max(15, g.oh - effDy)
      } else if (isBottom) {
        newH = Math.max(15, g.oh + effDy)
      }

      const tol = SIZE_SNAP_TOLERANCE_PX
      const snapTol = Math.max(8, SNAP_TOLERANCE_PX / eff)

      if (g.group) {
        const excludeIds = getExcludeIds(g.id, g.group)
        const candidates = getCandidateTargets(layersRef.current, excludeIds, layerRefs.current, preset.w, preset.h, true)

        if (isCorner) {
          const matchRes = findCornerSizeMatch(
            g.ow,
            g.oh,
            newW,
            newH,
            g.ox,
            g.oy,
            isLeft,
            isTop,
            artboardSnapRef.current ? candidates : [],
            tol,
            20,
            artboardSnapRef.current ? preset.w : undefined,
            artboardSnapRef.current ? preset.h : undefined,
          )

          const xGuides: number[] = []
          const yGuides: number[] = []
          if (matchRes.snapXGuide != null) xGuides.push(matchRes.snapXGuide)
          if (matchRes.snapYGuide != null) yGuides.push(matchRes.snapYGuide)

          if (xGuides.length > 0 || yGuides.length > 0) {
            setSnapGuides({ active: true, xGuides, yGuides })
            setSizeMatch(null)
          } else if (matchRes.widthMatch || matchRes.heightMatch) {
            setSnapGuides(null)
            setSizeMatch({
              active: true,
              widthMatch: matchRes.widthMatch,
              heightMatch: matchRes.heightMatch,
            })
          } else {
            setSnapGuides(null)
            setSizeMatch(null)
          }

          const finalX = matchRes.x
          const finalY = matchRes.y
          const w = matchRes.w
          const h = matchRes.h
          const sx = w / g.ow
          const sy = h / g.oh
          for (const item of g.group) {
            const patch: Partial<Layer> = {
              x: Math.round(finalX + (item.x - g.ox) * sx),
              y: Math.round(finalY + (item.y - g.oy) * sy),
              w: Math.max(10, Math.round(item.w * sx)),
              h: Math.max(10, Math.round(item.h * sy)),
            }
            const layer = layersRef.current.find((candidate) => candidate.id === item.id)
            if (layer?.type === 'text' && item.fontSize) {
              updateLayer(item.id, { ...patch, fontSize: Math.max(6, Math.round(item.fontSize * sx)) })
            } else if (layer?.type === 'image' && item.crop0) {
              updateLayer(item.id, {
                ...patch,
                crop: {
                  x: Math.round(item.crop0.x * sx),
                  y: Math.round(item.crop0.y * sy),
                  w: Math.round(item.crop0.w * sx),
                  h: Math.round(item.crop0.h * sy),
                },
              })
            } else if (layer?.type === 'path' && (item as any).origPoints) {
              updateLayer(item.id, {
                ...patch,
                points: scaleVectorPoints((item as any).origPoints, sx, sy),
              })
            } else {
              updateLayer(item.id, patch)
            }
          }
          if (g.id && !g.group.some((i) => i.id === g.id)) {
            updateLayer(g.id, { x: Math.round(finalX), y: Math.round(finalY), w: Math.round(w), h: Math.round(h) })
          }
        } else {
          // Middle handles: increase padding on that side instead of resizing elements uniformly
          const bgIds = g.bgShapeIds || []
          const hasBg = bgIds.length > 0

          if (handle === 'r') {
            const minW = g.maxFgRight ? Math.max(20, g.maxFgRight - g.ox) : 20
            let clampedW = Math.max(minW, Math.round(g.ow + dx))
            const rEdge = g.ox + clampedW
            const xGuides: number[] = []

            if (artboardSnapRef.current && Math.abs(rEdge - preset.w) <= snapTol) {
              clampedW = Math.max(minW, preset.w - g.ox)
              xGuides.push(preset.w)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && candidates.length > 0) {
              const sm = findSizeMatch(clampedW, g.oh, { x: g.ox, y: g.oy, w: clampedW, h: g.oh }, candidates, tol, true, false)
              if (sm.widthMatch) {
                clampedW = Math.max(minW, sm.snappedW)
                setSizeMatch({ active: true, widthMatch: sm.widthMatch })
              } else {
                setSizeMatch(null)
              }
            } else {
              setSizeMatch(null)
            }

            if (xGuides.length > 0) {
              setSnapGuides({ active: true, xGuides, yGuides: [] })
            } else {
              setSnapGuides(null)
            }
            const padDelta = clampedW - g.ow

            if (hasBg) {
              for (const bgId of bgIds) {
                const orig = g.group.find((i) => i.id === bgId)
                if (orig) {
                  updateLayer(bgId, { w: Math.max(10, Math.round(orig.w + padDelta)) })
                }
              }
            }
            if (g.id && !g.group.some((i) => i.id === g.id)) {
              updateLayer(g.id, {
                w: Math.round(clampedW),
                paddingRight: Math.max(0, Math.round(g.origPadRight + padDelta)),
              })
            }
          } else if (handle === 'l') {
            const rawW = Math.max(20, g.ow - dx)
            const maxLeft = g.minFgLeft != null ? g.minFgLeft : g.ox + g.ow - 20
            let clampedX = Math.min(maxLeft, g.ox + (g.ow - rawW))
            let clampedW = g.ow + (g.ox - clampedX)
            const xGuides: number[] = []

            if (artboardSnapRef.current && Math.abs(clampedX - 0) <= snapTol) {
              clampedX = Math.min(maxLeft, 0)
              clampedW = g.ow + (g.ox - clampedX)
              xGuides.push(0)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && candidates.length > 0) {
              const sm = findSizeMatch(clampedW, g.oh, { x: clampedX, y: g.oy, w: clampedW, h: g.oh }, candidates, tol, true, false)
              if (sm.widthMatch) {
                clampedW = sm.snappedW
                clampedX = Math.min(maxLeft, g.ox + (g.ow - clampedW))
                clampedW = g.ow + (g.ox - clampedX)
                setSizeMatch({ active: true, widthMatch: sm.widthMatch })
              } else {
                setSizeMatch(null)
              }
            } else {
              setSizeMatch(null)
            }

            if (xGuides.length > 0) {
              setSnapGuides({ active: true, xGuides, yGuides: [] })
            } else {
              setSnapGuides(null)
            }
            const padDelta = clampedW - g.ow

            if (hasBg) {
              for (const bgId of bgIds) {
                const orig = g.group.find((i) => i.id === bgId)
                if (orig) {
                  updateLayer(bgId, {
                    x: Math.round(orig.x - padDelta),
                    w: Math.max(10, Math.round(orig.w + padDelta)),
                  })
                }
              }
            }
            if (g.id && !g.group.some((i) => i.id === g.id)) {
              updateLayer(g.id, {
                x: Math.round(clampedX),
                w: Math.round(clampedW),
                paddingLeft: Math.max(0, Math.round(g.origPadLeft + padDelta)),
              })
            }
          } else if (handle === 'b') {
            const minH = g.maxFgBottom ? Math.max(20, g.maxFgBottom - g.oy) : 20
            let clampedH = Math.max(minH, Math.round(g.oh + dy))
            const bEdge = g.oy + clampedH
            const yGuides: number[] = []

            if (artboardSnapRef.current && Math.abs(bEdge - preset.h) <= snapTol) {
              clampedH = Math.max(minH, preset.h - g.oy)
              yGuides.push(preset.h)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && candidates.length > 0) {
              const sm = findSizeMatch(g.ow, clampedH, { x: g.ox, y: g.oy, w: g.ow, h: clampedH }, candidates, tol, false, true)
              if (sm.heightMatch) {
                clampedH = Math.max(minH, sm.snappedH)
                setSizeMatch({ active: true, heightMatch: sm.heightMatch })
              } else {
                setSizeMatch(null)
              }
            } else {
              setSizeMatch(null)
            }

            if (yGuides.length > 0) {
              setSnapGuides({ active: true, xGuides: [], yGuides })
            } else {
              setSnapGuides(null)
            }
            const padDelta = clampedH - g.oh

            if (hasBg) {
              for (const bgId of bgIds) {
                const orig = g.group.find((i) => i.id === bgId)
                if (orig) {
                  updateLayer(bgId, { h: Math.max(10, Math.round(orig.h + padDelta)) })
                }
              }
            }
            if (g.id && !g.group.some((i) => i.id === g.id)) {
              updateLayer(g.id, {
                h: Math.round(clampedH),
                paddingBottom: Math.max(0, Math.round(g.origPadBottom + padDelta)),
              })
            }
          } else if (handle === 't') {
            const rawH = Math.max(20, g.oh - dy)
            const maxTop = g.minFgTop != null ? g.minFgTop : g.oy + g.oh - 20
            let clampedY = Math.min(maxTop, g.oy + (g.oh - rawH))
            let clampedH = g.oh + (g.oy - clampedY)
            const yGuides: number[] = []

            if (artboardSnapRef.current && Math.abs(clampedY - 0) <= snapTol) {
              clampedY = Math.min(maxTop, 0)
              clampedH = g.oh + (g.oy - clampedY)
              yGuides.push(0)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && candidates.length > 0) {
              const sm = findSizeMatch(g.ow, clampedH, { x: g.ox, y: clampedY, w: g.ow, h: clampedH }, candidates, tol, false, true)
              if (sm.heightMatch) {
                clampedH = sm.snappedH
                clampedY = Math.min(maxTop, g.oy + (g.oh - clampedH))
                clampedH = g.oh + (g.oy - clampedY)
                setSizeMatch({ active: true, heightMatch: sm.heightMatch })
              } else {
                setSizeMatch(null)
              }
            } else {
              setSizeMatch(null)
            }

            if (yGuides.length > 0) {
              setSnapGuides({ active: true, xGuides: [], yGuides })
            } else {
              setSnapGuides(null)
            }
            const padDelta = clampedH - g.oh

            if (hasBg) {
              for (const bgId of bgIds) {
                const orig = g.group.find((i) => i.id === bgId)
                if (orig) {
                  updateLayer(bgId, {
                    y: Math.round(orig.y - padDelta),
                    h: Math.max(10, Math.round(orig.h + padDelta)),
                  })
                }
              }
            }
            if (g.id && !g.group.some((i) => i.id === g.id)) {
              updateLayer(g.id, {
                y: Math.round(clampedY),
                h: Math.round(clampedH),
                paddingTop: Math.max(0, Math.round(g.origPadTop + padDelta)),
              })
            }
          }
        }
      } else if (isCorner) {
        if (g.isImage && !g.lockProportions) {
          let finalW = newW
          let finalH = newH
          let finalX = isLeft ? g.ox + (g.ow - finalW) : g.ox
          let finalY = isTop ? g.oy + (g.oh - finalH) : g.oy

          const xGuides: number[] = []
          const yGuides: number[] = []

          if (artboardSnapRef.current) {
            if (isLeft && Math.abs(finalX - 0) <= snapTol) {
              finalX = 0
              finalW = Math.max(15, g.ox + g.ow)
              xGuides.push(0)
            } else if (!isLeft && Math.abs(finalX + finalW - preset.w) <= snapTol) {
              finalW = Math.max(15, preset.w - finalX)
              xGuides.push(preset.w)
            }
            if (isTop && Math.abs(finalY - 0) <= snapTol) {
              finalY = 0
              finalH = Math.max(15, g.oy + g.oh)
              yGuides.push(0)
            } else if (!isTop && Math.abs(finalY + finalH - preset.h) <= snapTol) {
              finalH = Math.max(15, preset.h - finalY)
              yGuides.push(preset.h)
            }
          }

          if (xGuides.length > 0 || yGuides.length > 0) {
            setSnapGuides({ active: true, xGuides, yGuides })
          } else {
            setSnapGuides(null)
          }
          setSizeMatch(null)

          updateLayer(g.id, {
            x: Math.round(finalX),
            y: Math.round(finalY),
            w: Math.round(finalW),
            h: Math.round(finalH),
            ...(g.origCrop ? (() => {
              const sX = finalW / g.ow
              const sY = finalH / g.oh
              return {
                crop: {
                  x: Math.round((isLeft ? finalW : 0) + (g.origCrop.x - (isLeft ? g.ow : 0)) * sX),
                  y: Math.round((isTop ? finalH : 0) + (g.origCrop.y - (isTop ? g.oh : 0)) * sY),
                  w: Math.round(g.origCrop.w * sX),
                  h: Math.round(g.origCrop.h * sY),
                },
              }
            })() : {}),
          })
        } else {
          const excludeIds = getExcludeIds(g.id)
          const candidates = getCandidateTargets(layersRef.current, excludeIds, layerRefs.current, preset.w, preset.h, true)
          const matchRes = findCornerSizeMatch(
            g.ow,
            g.oh,
            newW,
            newH,
            g.ox,
            g.oy,
            isLeft,
            isTop,
            artboardSnapRef.current ? candidates : [],
            tol,
            15,
            artboardSnapRef.current ? preset.w : undefined,
            artboardSnapRef.current ? preset.h : undefined,
          )

          const xGuides: number[] = []
          const yGuides: number[] = []
          if (matchRes.snapXGuide != null) xGuides.push(matchRes.snapXGuide)
          if (matchRes.snapYGuide != null) yGuides.push(matchRes.snapYGuide)

          if (xGuides.length > 0 || yGuides.length > 0) {
            setSnapGuides({ active: true, xGuides, yGuides })
            setSizeMatch(null)
          } else if (matchRes.widthMatch || matchRes.heightMatch) {
            setSnapGuides(null)
            setSizeMatch({
              active: true,
              widthMatch: matchRes.widthMatch,
              heightMatch: matchRes.heightMatch,
            })
          } else {
            setSnapGuides(null)
            setSizeMatch(null)
          }

          if (g.isText) {
            const fontSize = Math.max(6, Math.round(g.ofs * matchRes.factor))
            const patch: Partial<Layer> = {
              fontSize,
              x: matchRes.x,
              y: matchRes.y,
            }
            if (g.origPadTop) patch.paddingTop = Math.round(g.origPadTop * matchRes.factor)
            if (g.origPadRight) patch.paddingRight = Math.round(g.origPadRight * matchRes.factor)
            if (g.origPadBottom) patch.paddingBottom = Math.round(g.origPadBottom * matchRes.factor)
            if (g.origPadLeft) patch.paddingLeft = Math.round(g.origPadLeft * matchRes.factor)
            updateLayer(g.id, patch)
          } else {
            const scaleFactor = g.ow > 0 ? matchRes.w / g.ow : 1
            const patch: Partial<Layer> = {
              x: (!g.group && g.initialRotation) ? Math.round(g.centerX - matchRes.w / 2) : matchRes.x,
              y: (!g.group && g.initialRotation) ? Math.round(g.centerY - matchRes.h / 2) : matchRes.y,
              w: matchRes.w,
              h: matchRes.h,
            }
            if (g.isImage && g.origCrop) {
              patch.crop = {
                x: Math.round(g.origCrop.x * scaleFactor),
                y: Math.round(g.origCrop.y * scaleFactor),
                w: Math.round(g.origCrop.w * scaleFactor),
                h: Math.round(g.origCrop.h * scaleFactor),
              }
            }
            if (g.layerType === 'path' && g.origPoints) {
              const sx = g.ow > 0 ? matchRes.w / g.ow : 1
              const sy = g.oh > 0 ? matchRes.h / g.oh : 1
              patch.points = scaleVectorPoints(g.origPoints, sx, sy)
            }
            updateLayer(g.id, patch)
          }
        }
      } else {
        // Single element middle drag handle
        if (g.isText) {
          if (handle === 'r') {
            const rawPadRight = Math.max(0, Math.round(g.origPadRight + dx))
            let newPadRight = rawPadRight
            const rEdge = g.ox + g.ow + (rawPadRight - g.origPadRight)
            const xGuides: number[] = []
            if (artboardSnapRef.current && Math.abs(rEdge - preset.w) <= snapTol) {
              newPadRight = Math.max(0, preset.w - g.ox - g.ow + g.origPadRight)
              xGuides.push(preset.w)
            }
            if (xGuides.length > 0) {
              setSnapGuides({ active: true, xGuides, yGuides: [] })
            } else {
              setSnapGuides(null)
            }
            setSizeMatch(null)
            updateLayer(g.id, { x: Math.round(g.ox), w: Math.round(g.ow), paddingRight: newPadRight })
          } else if (handle === 'l') {
            const rawPadLeft = Math.max(0, Math.round(g.origPadLeft - dx))
            let newPadLeft = rawPadLeft
            const deltaPad = rawPadLeft - g.origPadLeft
            const candX = g.ox - deltaPad
            const xGuides: number[] = []
            if (artboardSnapRef.current && Math.abs(candX - 0) <= snapTol) {
              newPadLeft = Math.max(0, g.origPadLeft + g.ox)
              xGuides.push(0)
            }
            const finalDelta = newPadLeft - g.origPadLeft
            if (xGuides.length > 0) {
              setSnapGuides({ active: true, xGuides, yGuides: [] })
            } else {
              setSnapGuides(null)
            }
            setSizeMatch(null)
            updateLayer(g.id, { x: Math.round(g.ox - finalDelta), w: Math.round(g.ow), paddingLeft: newPadLeft })
          } else if (handle === 'b') {
            const rawPadBottom = Math.max(0, Math.round(g.origPadBottom + dy))
            let newPadBottom = rawPadBottom
            const bEdge = g.oy + g.oh + (rawPadBottom - g.origPadBottom)
            const yGuides: number[] = []
            if (artboardSnapRef.current && Math.abs(bEdge - preset.h) <= snapTol) {
              newPadBottom = Math.max(0, preset.h - g.oy - g.oh + g.origPadBottom)
              yGuides.push(preset.h)
            }
            if (yGuides.length > 0) {
              setSnapGuides({ active: true, xGuides: [], yGuides })
            } else {
              setSnapGuides(null)
            }
            setSizeMatch(null)
            updateLayer(g.id, { y: Math.round(g.oy), h: Math.round(g.oh), paddingBottom: newPadBottom })
          } else if (handle === 't') {
            const rawPadTop = Math.max(0, Math.round(g.origPadTop - dy))
            let newPadTop = rawPadTop
            const deltaPad = rawPadTop - g.origPadTop
            const candY = g.oy - deltaPad
            const yGuides: number[] = []
            if (artboardSnapRef.current && Math.abs(candY - 0) <= snapTol) {
              newPadTop = Math.max(0, g.origPadTop + g.oy)
              yGuides.push(0)
            }
            const finalDelta = newPadTop - g.origPadTop
            if (yGuides.length > 0) {
              setSnapGuides({ active: true, xGuides: [], yGuides })
            } else {
              setSnapGuides(null)
            }
            setSizeMatch(null)
            updateLayer(g.id, { y: Math.round(g.oy - finalDelta), h: Math.round(g.oh), paddingTop: newPadTop })
          }
        } else {
          // Graphic elements (shape, image, sticker, etc.)
          const excludeIds = getExcludeIds(g.id)
          const candidates = getCandidateTargets(layersRef.current, excludeIds, layerRefs.current, preset.w, preset.h, true)

          if (handle === 'r') {
            const rawW = Math.max(15, Math.round(g.ow + dx))
            let finalW = rawW
            const rEdge = g.ox + rawW
            const xGuides: number[] = []

            if (artboardSnapRef.current && Math.abs(rEdge - preset.w) <= snapTol) {
              finalW = Math.max(15, preset.w - g.ox)
              xGuides.push(preset.w)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && Math.abs(rEdge - 0) <= snapTol) {
              finalW = Math.max(15, -g.ox)
              xGuides.push(0)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && candidates.length > 0) {
              const sm = findSizeMatch(rawW, g.oh, { x: g.ox, y: g.oy, w: rawW, h: g.oh }, candidates, tol, true, false)
              if (sm.widthMatch) {
                finalW = sm.snappedW
                setSizeMatch({ active: true, widthMatch: sm.widthMatch })
              } else {
                setSizeMatch(null)
              }
            } else {
              setSizeMatch(null)
            }

            if (xGuides.length > 0) {
              setSnapGuides({ active: true, xGuides, yGuides: [] })
            } else {
              setSnapGuides(null)
            }
            if (g.isImage && g.lockProportions && g.aspectRatio) {
              const finalH = Math.max(15, Math.round(finalW / g.aspectRatio))
              const finalY = Math.round(g.oy + (g.oh - finalH) / 2)
              const scaleFactor = g.ow > 0 ? finalW / g.ow : 1
              updateLayer(g.id, {
                w: finalW,
                h: finalH,
                y: finalY,
                ...(g.origCrop ? {
                  crop: {
                    x: Math.round(g.origCrop.x * scaleFactor),
                    y: Math.round(g.origCrop.y * scaleFactor),
                    w: Math.round(g.origCrop.w * scaleFactor),
                    h: Math.round(g.origCrop.h * scaleFactor),
                  },
                } : {}),
              })
            } else {
              const patch: Partial<Layer> = {
                w: finalW,
                ...(g.origCrop ? { crop: { ...g.origCrop } } : {}),
              }
              if (g.layerType === 'path' && g.origPoints) {
                const sx = g.ow > 0 ? finalW / g.ow : 1
                patch.points = scaleVectorPoints(g.origPoints, sx, 1)
              }
              updateLayer(g.id, patch)
            }
          } else if (handle === 'l') {
            const rawW = Math.max(15, Math.round(g.ow - dx))
            let finalW = rawW
            const candX = g.ox + (g.ow - rawW)
            let finalX = candX
            const xGuides: number[] = []

            if (artboardSnapRef.current && Math.abs(candX - 0) <= snapTol) {
              finalX = 0
              finalW = Math.max(15, g.ox + g.ow)
              xGuides.push(0)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && Math.abs(candX - preset.w) <= snapTol) {
              finalX = preset.w
              finalW = Math.max(15, g.ox + g.ow - preset.w)
              xGuides.push(preset.w)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && candidates.length > 0) {
              const sm = findSizeMatch(rawW, g.oh, { x: candX, y: g.oy, w: rawW, h: g.oh }, candidates, tol, true, false)
              if (sm.widthMatch) {
                finalW = sm.snappedW
                finalX = g.ox + (g.ow - finalW)
                setSizeMatch({ active: true, widthMatch: sm.widthMatch })
              } else {
                setSizeMatch(null)
              }
            } else {
              setSizeMatch(null)
            }

            if (xGuides.length > 0) {
              setSnapGuides({ active: true, xGuides, yGuides: [] })
            } else {
              setSnapGuides(null)
            }
            if (g.isImage && g.lockProportions && g.aspectRatio) {
              const finalH = Math.max(15, Math.round(finalW / g.aspectRatio))
              const finalY = Math.round(g.oy + (g.oh - finalH) / 2)
              const scaleFactor = g.ow > 0 ? finalW / g.ow : 1
              updateLayer(g.id, {
                x: Math.round(finalX),
                w: finalW,
                h: finalH,
                y: finalY,
                ...(g.origCrop ? {
                  crop: {
                    x: Math.round(g.origCrop.x * scaleFactor),
                    y: Math.round(g.origCrop.y * scaleFactor),
                    w: Math.round(g.origCrop.w * scaleFactor),
                    h: Math.round(g.origCrop.h * scaleFactor),
                  },
                } : {}),
              })
            } else {
              const patch: Partial<Layer> = {
                x: Math.round(finalX),
                w: finalW,
                ...(g.origCrop ? {
                  crop: {
                    ...g.origCrop,
                    x: Math.round(g.origCrop.x - (finalX - g.ox)),
                  },
                } : {}),
              }
              if (g.layerType === 'path' && g.origPoints) {
                const sx = g.ow > 0 ? finalW / g.ow : 1
                patch.points = scaleVectorPoints(g.origPoints, sx, 1)
              }
              updateLayer(g.id, patch)
            }
          } else if (handle === 'b') {
            const rawH = Math.max(15, Math.round(g.oh + dy))
            let finalH = rawH
            const bEdge = g.oy + rawH
            const yGuides: number[] = []

            if (artboardSnapRef.current && Math.abs(bEdge - preset.h) <= snapTol) {
              finalH = Math.max(15, preset.h - g.oy)
              yGuides.push(preset.h)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && Math.abs(bEdge - 0) <= snapTol) {
              finalH = Math.max(15, -g.oy)
              yGuides.push(0)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && candidates.length > 0) {
              const sm = findSizeMatch(g.ow, rawH, { x: g.ox, y: g.oy, w: g.ow, h: rawH }, candidates, tol, false, true)
              if (sm.heightMatch) {
                finalH = sm.snappedH
                setSizeMatch({ active: true, heightMatch: sm.heightMatch })
              } else {
                setSizeMatch(null)
              }
            } else {
              setSizeMatch(null)
            }

            if (yGuides.length > 0) {
              setSnapGuides({ active: true, xGuides: [], yGuides })
            } else {
              setSnapGuides(null)
            }
            if (g.isImage && g.lockProportions && g.aspectRatio) {
              const finalW = Math.max(15, Math.round(finalH * g.aspectRatio))
              const finalX = Math.round(g.ox + (g.ow - finalW) / 2)
              const scaleFactor = g.oh > 0 ? finalH / g.oh : 1
              updateLayer(g.id, {
                h: finalH,
                w: finalW,
                x: finalX,
                ...(g.origCrop ? {
                  crop: {
                    x: Math.round(g.origCrop.x * scaleFactor),
                    y: Math.round(g.origCrop.y * scaleFactor),
                    w: Math.round(g.origCrop.w * scaleFactor),
                    h: Math.round(g.origCrop.h * scaleFactor),
                  },
                } : {}),
              })
            } else {
              const patch: Partial<Layer> = {
                h: finalH,
                ...(g.origCrop ? { crop: { ...g.origCrop } } : {}),
              }
              if (g.layerType === 'path' && g.origPoints) {
                const sy = g.oh > 0 ? finalH / g.oh : 1
                patch.points = scaleVectorPoints(g.origPoints, 1, sy)
              }
              updateLayer(g.id, patch)
            }
          } else if (handle === 't') {
            const rawH = Math.max(15, Math.round(g.oh - dy))
            let finalH = rawH
            const candY = g.oy + (g.oh - rawH)
            let finalY = candY
            const yGuides: number[] = []

            if (artboardSnapRef.current && Math.abs(candY - 0) <= snapTol) {
              finalY = 0
              finalH = Math.max(15, g.oy + g.oh)
              yGuides.push(0)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && Math.abs(candY - preset.h) <= snapTol) {
              finalY = preset.h
              finalH = Math.max(15, g.oy + g.oh - preset.h)
              yGuides.push(preset.h)
              setSizeMatch(null)
            } else if (artboardSnapRef.current && candidates.length > 0) {
              const sm = findSizeMatch(g.ow, rawH, { x: g.ox, y: candY, w: g.ow, h: rawH }, candidates, tol, false, true)
              if (sm.heightMatch) {
                finalH = sm.snappedH
                finalY = g.oy + (g.oh - finalH)
                setSizeMatch({ active: true, heightMatch: sm.heightMatch })
              } else {
                setSizeMatch(null)
              }
            } else {
              setSizeMatch(null)
            }

            if (yGuides.length > 0) {
              setSnapGuides({ active: true, xGuides: [], yGuides })
            } else {
              setSnapGuides(null)
            }
            if (g.isImage && g.lockProportions && g.aspectRatio) {
              const finalW = Math.max(15, Math.round(finalH * g.aspectRatio))
              const finalX = Math.round(g.ox + (g.ow - finalW) / 2)
              const scaleFactor = g.oh > 0 ? finalH / g.oh : 1
              updateLayer(g.id, {
                y: Math.round(finalY),
                h: finalH,
                w: finalW,
                x: finalX,
                ...(g.origCrop ? {
                  crop: {
                    x: Math.round(g.origCrop.x * scaleFactor),
                    y: Math.round(g.origCrop.y * scaleFactor),
                    w: Math.round(g.origCrop.w * scaleFactor),
                    h: Math.round(g.origCrop.h * scaleFactor),
                  },
                } : {}),
              })
            } else {
              const patch: Partial<Layer> = {
                y: Math.round(finalY),
                h: finalH,
                ...(g.origCrop ? {
                  crop: {
                    ...g.origCrop,
                    y: Math.round(g.origCrop.y - (finalY - g.oy)),
                  },
                } : {}),
              }
              if (g.layerType === 'path' && g.origPoints) {
                const sy = g.oh > 0 ? finalH / g.oh : 1
                patch.points = scaleVectorPoints(g.origPoints, 1, sy)
              }
              updateLayer(g.id, patch)
            }
          }
        }
      }
    }
    const up = () => {
      if (longPress.current) {
        window.clearTimeout(longPress.current)
        longPress.current = null
      }
      if (anchorHoldTimer.current) {
        window.clearTimeout(anchorHoldTimer.current)
        anchorHoldTimer.current = null
        setHoldingAnchorIdx(null)
      }
      const g = gesture.current
      if (g?.mode === 'vector-anchor') {
        if (g.moved) {
          const l = layersRef.current.find((cand) => cand.id === g.id)
          if (l && l.type === 'path' && l.points) {
            const isAnimated = Boolean(l.keyframes && l.keyframes.length > 0)
            if (!isAnimated) {
              const tight = tightenVectorLayer(l)
              updateLayer(l.id, tight)
            }
          }
          if (g.activeSelected && g.activeSelected.length > 0) {
            setSelectedAnchors(g.activeSelected)
          }
          checkpoint()
        } else if (g.deselectOnTap) {
          setSelectedAnchors([])
          if (anchorMultiSelectModeRef.current) {
            setAnchorMultiSelectMode(false)
            anchorMultiSelectModeRef.current = false
          }
        }
        gesture.current = null
        panGesture.current = null
        setVectorAlign(null)
        setSnapGuides(null)
        setSizeMatch(null)
        setGapMatch(null)
        setElementAlign(null)
        setRotationSnap(null)
        return
      }
      const moved = g?.mode === 'move' ? g.moved : false
      lastGestureMovedRef.current = moved
      if (moved) {
        tapTrackerRef.current = { layerId: '', time: 0, count: 0 }
      }
      if (g?.mode === 'resize' && g.id) {
        const l = layersRef.current.find((cand) => cand.id === g.id)
        if (l && l.type === 'path' && l.points) {
          const tight = tightenVectorLayer(l)
          updateLayer(l.id, tight)
        }
      }
      if (g?.mode === 'move' && !g.moved && g.tapAddId) {
        select(g.tapAddId, true)
      } else if (g?.mode === 'move' && !g.moved && g.tapToggleId) {
        toggleSelect(g.tapToggleId)
        if (selectedIdsRef.current.length <= 1) {
          setMultiSelectMode(false)
          multiSelectModeRef.current = false
        }
      } else if (g?.mode === 'move' && (g.fromCanvas || g.deselectOnTap) && !g.moved) {
        if (!pinchTouchSequence.current && !pinching.current) {
          setMultiSelectMode(false)
          multiSelectModeRef.current = false
          select(null)
          setEditingId(null)
          setEditingComponentId(null)
        }
      } else if (g?.mode === 'move' && !g.moved) {
        const currentSel = layersRef.current.find((l) => l.id === g.id)
        if (currentSel?.isComponent && selectedRef.current === currentSel.id) {
          setEditingComponentId(currentSel.id)
        }
      }
    if (g && (g.mode === 'resize' || (g.mode === 'move' && g.moved))) {
      checkpoint()
    }
    gesture.current = null
    panGesture.current = null
    setSnapGuides(null)
    setSizeMatch(null)
    setGapMatch(null)
    setElementAlign(null)
    setRotationSnap(null)
    setVectorAlign(null)
  }
  window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [scale, toggleSelect, updateLayer])

  const handleNudge = useCallback(
    (dx: number, dy: number) => {
      const step = nudgeIncrementRef.current || 1
      const actualDx = dx * step
      const actualDy = dy * step
      const measured: Record<string, { x: number; y: number; w: number; h: number }> = {}
      for (const [id, node] of layerRefs.current.entries()) {
        if (node) {
          const l = layersRef.current.find((layer) => layer.id === id)
          const isCentered = l?.type === 'text' && l.align === 'center' && l.x === 0 && l.w === preset.w
          const w = node.offsetWidth
          const h = node.offsetHeight
          const x = isCentered ? (preset.w - w) / 2 : (l ? l.x : node.offsetLeft)
          const y = l ? l.y : node.offsetTop
          measured[id] = { x, y, w, h }
        }
      }
      nudge(actualDx, actualDy, measured)
    },
    [nudge, preset.w],
  )

  // Track spacebar for pan navigation & arrow keys for nudging
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName) || editingId) return
      if (imagePositioningId) {
        const selLayer = layersRef.current.find((l) => l.id === imagePositioningId)
        if (selLayer?.type === 'image') {
          const step = e.shiftKey ? 10 : 2
          if (selLayer.crop) {
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              updateLayer(selLayer.id, { crop: { ...selLayer.crop, x: selLayer.crop.x - step } })
              return
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              updateLayer(selLayer.id, { crop: { ...selLayer.crop, x: selLayer.crop.x + step } })
              return
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              updateLayer(selLayer.id, { crop: { ...selLayer.crop, y: selLayer.crop.y - step } })
              return
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              updateLayer(selLayer.id, { crop: { ...selLayer.crop, y: selLayer.crop.y + step } })
              return
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setImagePositioningId(null)
              return
            }
          }
          const pos = parseImagePosition(selLayer.imagePosition)
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            updateLayer(selLayer.id, { imagePosition: formatImagePosition(Math.max(0, pos.x - step), pos.y) })
            return
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            updateLayer(selLayer.id, { imagePosition: formatImagePosition(Math.min(100, pos.x + step), pos.y) })
            return
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            updateLayer(selLayer.id, { imagePosition: formatImagePosition(pos.x, Math.max(0, pos.y - step)) })
            return
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            updateLayer(selLayer.id, { imagePosition: formatImagePosition(pos.x, Math.min(100, pos.y + step)) })
            return
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setImagePositioningId(null)
            return
          }
        }
      }
      if (vectorEditingId) {
        if (e.key === 'Escape') {
          e.preventDefault()
          if (anchorMultiSelectModeRef.current) {
            setAnchorMultiSelectMode(false)
            return
          }
          setVectorEditingId(null)
          return
        }
        const vLayer = layersRef.current.find((l) => l.id === vectorEditingId)
        if (vLayer && vLayer.type === 'path' && vLayer.points && selectedAnchorIndicesRef.current.length > 0) {
          const step = e.shiftKey ? 10 : (nudgeIncrementRef.current || 1)
          let ndx = 0
          let ndy = 0
          if (e.key === 'ArrowLeft') ndx = -step
          else if (e.key === 'ArrowRight') ndx = step
          else if (e.key === 'ArrowUp') ndy = -step
          else if (e.key === 'ArrowDown') ndy = step
          if (ndx !== 0 || ndy !== 0) {
            e.preventDefault()
            const activeSel = selectedAnchorIndicesRef.current
            const updated = vLayer.points.map((p, idx) => {
              if (!activeSel.includes(idx)) return p
              return {
                ...p,
                x: p.x + ndx,
                y: p.y + ndy,
                cp1: p.cp1 ? { x: p.cp1.x + ndx, y: p.cp1.y + ndy } : undefined,
                cp2: p.cp2 ? { x: p.cp2.x + ndx, y: p.cp2.y + ndy } : undefined,
              }
            })
            const isAnimated = Boolean(vLayer.keyframes && vLayer.keyframes.length > 0)
            if (isAnimated) {
              updateLayer(vLayer.id, { points: updated })
            } else {
              const tight = tightenVectorLayer({ ...vLayer, points: updated })
              updateLayer(vLayer.id, tight)
            }

            const snapIdx = activeSel[0]
            if (vLayer.points[snapIdx]) {
              const candX = vLayer.points[snapIdx].x + ndx
              const candY = vLayer.points[snapIdx].y + ndy
              const alignRes = snapVectorAnchor(candX, candY, vLayer.points, activeSel, vLayer.w, vLayer.h, 1)
              if (alignRes.snappedX || alignRes.snappedY) {
                setVectorAlign({
                  layerId: vLayer.id,
                  x: alignRes.x,
                  y: alignRes.y,
                  snappedX: alignRes.snappedX,
                  snappedY: alignRes.snappedY,
                  xMatches: alignRes.xMatches,
                  yMatches: alignRes.yMatches,
                })
                if (vectorAlignNudgeTimer.current) window.clearTimeout(vectorAlignNudgeTimer.current)
                vectorAlignNudgeTimer.current = window.setTimeout(() => {
                  setVectorAlign(null)
                  vectorAlignNudgeTimer.current = null
                }, 1200)
              } else {
                setVectorAlign(null)
              }
            }
            return
          }
        }
      }
      if (e.code === 'Space') {
        isSpacePressed.current = true
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleNudge(-1, 0)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNudge(1, 0)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        handleNudge(0, -1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        handleNudge(0, 1)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressed.current = false
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [editingId, handleNudge, imagePositioningId, setImagePositioningId, updateLayer, vectorEditingId, setVectorEditingId])

  const getPinchTargetAndItems = (effId: string | null) => {
    const targetId = effId || selectedRef.current || selectedIdsRef.current[0] || null
    const targetLayer = targetId ? layersRef.current.find((l) => l.id === targetId) : undefined
    if (!targetLayer || targetLayer.locked) return null

    const topGroup = getTopmostGroup(targetLayer.id, layersRef.current)
    const isGroupContext = targetLayer.type === 'group' || (topGroup && (selectedRef.current === topGroup.id || selectedIdsRef.current.includes(topGroup.id)))
    const primaryGroup = isGroupContext ? (targetLayer.type === 'group' ? targetLayer : topGroup) : null

    const allIds = new Set<string>()
    if (primaryGroup) {
      allIds.add(primaryGroup.id)
      const desc = getDescendantLayers(primaryGroup.id, layersRef.current)
      for (const d of desc) allIds.add(d.id)
    } else if (selectedIdsRef.current.length > 1) {
      for (const id of selectedIdsRef.current) {
        allIds.add(id)
        const desc = getDescendantLayers(id, layersRef.current)
        for (const d of desc) allIds.add(d.id)
      }
    } else {
      allIds.add(targetLayer.id)
      const desc = getDescendantLayers(targetLayer.id, layersRef.current)
      for (const d of desc) allIds.add(d.id)
    }

    const pinchLayers = layersRef.current.filter((item) => allIds.has(item.id) && !item.locked)
    const isMultiOrGroup = pinchLayers.length > 1 || isGroupContext

    const measured = pinchLayers.map((item) => {
      const itemNode = layerRefs.current.get(item.id)
      const itemW = (item.type === 'text' && itemNode ? itemNode.offsetWidth : itemNode?.offsetWidth) || item.w
      const itemH = (item.type === 'text' && itemNode ? itemNode.offsetHeight : itemNode?.offsetHeight) || item.h
      const itemX = (item.type === 'text' && item.align === 'center' && item.x === 0 && item.w === preset.w && itemNode)
        ? (preset.w - itemW) / 2
        : (itemNode?.offsetLeft ?? item.x)
      return {
        id: item.id,
        x: itemX,
        y: item.y,
        w: itemW,
        h: itemH,
        fontSize: item.type === 'text' ? item.fontSize : undefined,
        crop0: item.type === 'image' && item.crop ? { ...item.crop } : undefined,
        isCroppedImage: item.type === 'image' && Boolean(item.crop),
        origPoints: item.type === 'path' && item.points ? cloneVectorPoints(item.points) : undefined,
      }
    })

    const minX = measured.length > 0 ? Math.min(...measured.map((i) => i.x)) : targetLayer.x
    const maxX = measured.length > 0 ? Math.max(...measured.map((i) => i.x + i.w)) : targetLayer.x + targetLayer.w
    const minY = measured.length > 0 ? Math.min(...measured.map((i) => i.y)) : targetLayer.y
    const maxY = measured.length > 0 ? Math.max(...measured.map((i) => i.y + i.h)) : targetLayer.y + targetLayer.h

    return {
      primaryId: primaryGroup ? primaryGroup.id : targetLayer.id,
      targetLayer,
      measured: isMultiOrGroup ? measured : undefined,
      minX,
      maxX,
      minY,
      maxY,
    }
  }

  const applyPinchScaling = (p: NonNullable<typeof pinch.current>, ratio: number) => {
    if (p.mode !== 'resize') return
    const tol = SIZE_SNAP_TOLERANCE_PX

    if (p.group && p.group.length > 0) {
      const minX = Math.min(...p.group.map((item) => item.x))
      const maxX = Math.max(...p.group.map((item) => item.x + item.w))
      const minY = Math.min(...p.group.map((item) => item.y))
      const maxY = Math.max(...p.group.map((item) => item.y + item.h))
      const groupW = maxX - minX
      const groupH = maxY - minY
      let ratioToApply = ratio

      const excludeIds = new Set<string>(p.group.map((i) => i.id))
      if (p.id) excludeIds.add(p.id)
      for (const id of Array.from(excludeIds)) {
        for (const d of getDescendantLayers(id, layersRef.current)) excludeIds.add(d.id)
      }
      for (const id of selectedIdsRef.current) {
        excludeIds.add(id)
        for (const d of getDescendantLayers(id, layersRef.current)) excludeIds.add(d.id)
      }

      const candidates = getCandidateTargets(layersRef.current, excludeIds, layerRefs.current, preset.w, preset.h, true)

      if (artboardSnapRef.current && candidates.length > 0) {
        const rawW = groupW * ratio
        const rawH = groupH * ratio
        const sm = findSizeMatch(rawW, rawH, { x: minX, y: minY, w: rawW, h: rawH }, candidates, tol, true, true)
        if (sm.widthMatch) {
          ratioToApply = sm.snappedW / groupW
          const finalW = sm.snappedW
          const finalH = groupH * ratioToApply
          setSizeMatch({ active: true, widthMatch: { ...sm.widthMatch, resizingBox: { x: minX, y: minY, w: finalW, h: finalH } } })
        } else if (sm.heightMatch) {
          ratioToApply = sm.snappedH / groupH
          const finalH = sm.snappedH
          const finalW = groupW * ratioToApply
          setSizeMatch({ active: true, heightMatch: { ...sm.heightMatch, resizingBox: { x: minX, y: minY, w: finalW, h: finalH } } })
        } else {
          setSizeMatch(null)
        }
      } else {
        setSizeMatch(null)
      }

      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      for (const item of p.group) {
        const w = Math.max(10, Math.round(item.w * ratioToApply))
        const h = Math.max(10, Math.round(item.h * ratioToApply))
        const x = Math.round(cx + (item.x - cx) * ratioToApply)
        const y = Math.round(cy + (item.y - cy) * ratioToApply)
        const layer = layersRef.current.find((candidate) => candidate.id === item.id)
        if (layer?.type === 'text' && item.fontSize) {
          updateLayer(item.id, { x, y, w, h, fontSize: Math.max(6, Math.round(item.fontSize * ratioToApply)) })
        } else if (layer?.type === 'image' && item.crop0) {
          const scaleFactor = item.w > 0 ? w / item.w : 1
          updateLayer(item.id, {
            x,
            y,
            w,
            h,
            crop: {
              x: Math.round(item.crop0.x * scaleFactor),
              y: Math.round(item.crop0.y * scaleFactor),
              w: Math.round(item.crop0.w * scaleFactor),
              h: Math.round(item.crop0.h * scaleFactor),
            },
          })
        } else if (layer?.type === 'path' && item.origPoints) {
          const sx = item.w > 0 ? w / item.w : 1
          const sy = item.h > 0 ? h / item.h : 1
          updateLayer(item.id, {
            x,
            y,
            w,
            h,
            points: scaleVectorPoints(item.origPoints, sx, sy),
          })
        } else {
          updateLayer(item.id, { x, y, w, h })
        }
      }
    } else {
      const selected = layersRef.current.find((l) => l.id === p.id)
      if (!selected) return
      let ratioToApply = ratio
      const rawW = Math.max(20, Math.round(p.w0 * ratio))
      const rawH = Math.max(20, Math.round(p.h0 * ratio))

      const excludeIds = new Set<string>([p.id])
      for (const d of getDescendantLayers(p.id, layersRef.current)) excludeIds.add(d.id)
      for (const id of selectedIdsRef.current) {
        excludeIds.add(id)
        for (const d of getDescendantLayers(id, layersRef.current)) excludeIds.add(d.id)
      }
      const candidates = getCandidateTargets(layersRef.current, excludeIds, layerRefs.current, preset.w, preset.h, true)

      if (artboardSnapRef.current && candidates.length > 0) {
        const sm = findSizeMatch(rawW, rawH, { x: p.x0, y: p.y0, w: rawW, h: rawH }, candidates, tol, true, true)
        if (sm.widthMatch) {
          ratioToApply = sm.snappedW / p.w0
          const finalW = sm.snappedW
          const finalH = Math.max(20, Math.round(p.h0 * ratioToApply))
          const finalX = Math.round(p.x0 + (p.w0 - finalW) / 2)
          const finalY = Math.round(p.y0 + (p.h0 - finalH) / 2)
          setSizeMatch({ active: true, widthMatch: { ...sm.widthMatch, resizingBox: { x: finalX, y: finalY, w: finalW, h: finalH } } })
        } else if (sm.heightMatch) {
          ratioToApply = sm.snappedH / p.h0
          const finalH = sm.snappedH
          const finalW = Math.max(20, Math.round(p.w0 * ratioToApply))
          const finalX = Math.round(p.x0 + (p.w0 - finalW) / 2)
          const finalY = Math.round(p.y0 + (p.h0 - finalH) / 2)
          setSizeMatch({ active: true, heightMatch: { ...sm.heightMatch, resizingBox: { x: finalX, y: finalY, w: finalW, h: finalH } } })
        } else {
          setSizeMatch(null)
        }
      } else {
        setSizeMatch(null)
      }

      const w = Math.max(20, Math.round(p.w0 * ratioToApply))
      const h = Math.max(20, Math.round(p.h0 * ratioToApply))
      const x = Math.round(p.x0 + (p.w0 - w) / 2)
      const y = Math.round(p.y0 + (p.h0 - h) / 2)
      if (selected.type === 'text') {
        updateLayer(p.id, { x, y, w, fontSize: Math.max(6, Math.round(p.fontSize * ratioToApply)) })
      } else if (selected.type === 'image' && p.crop0) {
        const scaleFactor = p.w0 > 0 ? w / p.w0 : 1
        updateLayer(p.id, {
          x,
          y,
          w,
          h,
          crop: {
            x: Math.round(p.crop0.x * scaleFactor),
            y: Math.round(p.crop0.y * scaleFactor),
            w: Math.round(p.crop0.w * scaleFactor),
            h: Math.round(p.crop0.h * scaleFactor),
          },
        })
      } else if (selected.type === 'path' && p.points0) {
        const sx = p.w0 > 0 ? w / p.w0 : 1
        const sy = p.h0 > 0 ? h / p.h0 : 1
        updateLayer(p.id, {
          x,
          y,
          w,
          h,
          points: scaleVectorPoints(p.points0, sx, sy),
        })
      } else {
        updateLayer(p.id, { x, y, w, h })
      }
    }
  }

  // Pinch-to-zoom / pan on the canvas only (prevents whole-page zoom)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const zoomAt = (target: number, px: number, py: number) => {
      const v = viewRef.current
      const { cx, cy } = center()
      const s1 = clampN(target, 0.5, 6)
      const lx = (px - cx - v.x) / v.scale
      const ly = (py - cy - v.y) / v.scale
      setView({ scale: s1, x: px - cx - s1 * lx, y: py - cy - s1 * ly })
    }
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        zoomAt(viewRef.current.scale * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
      } else if (viewRef.current.scale > 1) {
        e.preventDefault()
        const v = viewRef.current
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
      }
    }
    const onTouchStart = (e: TouchEvent) => {
      touchCount.current = e.touches.length
      if (!pinchTouchSequence.current && (e.touches.length === 1 || e.touches.length === 2)) {
        touchSelectionLock.current = gestureStartSelectionRef.current
      }
      if (e.touches.length >= 2) {
        pinchTouchSequence.current = true
        pinchStartedInMultiSelect.current = multiSelectModeRef.current || selectedIdsRef.current.length > 1
        if (!pinchStartedInMultiSelect.current) {
          setMultiSelectMode(false)
          multiSelectModeRef.current = false
        }
        if (longPress.current) {
          window.clearTimeout(longPress.current)
          longPress.current = null
        }
        if (pendingMultiSelectTap.current) {
          window.clearTimeout(pendingMultiSelectTap.current)
          pendingMultiSelectTap.current = null
        }
        if (marqueeLongPress.current) {
          window.clearTimeout(marqueeLongPress.current)
          marqueeLongPress.current = null
        }
        if (marqueeSession.current.active) {
          setMarquee(null)
          marqueeSession.current.active = false
        }
      }
      if (e.touches.length === 1) {
        return
      }
      if (e.touches.length === 2) {
        e.preventDefault()
        const [t1, t2] = [e.touches[0], e.touches[1]]
        const startDist = tdist(t1, t2)
        const m = tmid(t1, t2)
        const v = viewRef.current
        const { cx, cy } = center()

        // Vector editing uses the pinch gesture exclusively for viewport navigation.
        // Resizing the layer here would move the shape instead of helping the user
        // reach anchors that are currently outside the viewport.
        if (vectorEditingIdRef.current) {
          pinch.current = {
            mode: 'zoom',
            startDist,
            s0: v.scale,
            lx: (m.x - cx - v.x) / v.scale,
            ly: (m.y - cy - v.y) / v.scale,
          }
        } else {
          const targetId = touchSelectionLock.current || gestureStartSelectionRef.current
          const info = targetId ? getPinchTargetAndItems(targetId) : null
          if (info) {
            const targetL = layersRef.current.find((l) => l.id === info.primaryId)
            const isCroppedImage = targetL?.type === 'image' && Boolean(targetL.crop)
            if (isCroppedImage && targetL) {
              updateLayer(targetL.id, {
                lockProportions: true,
                aspectRatio: targetL.h > 0 ? targetL.w / targetL.h : 1,
              })
            }
            if (info.measured) {
              for (const m of info.measured) {
                const l = layersRef.current.find((candidate) => candidate.id === m.id)
                if (l?.type === 'image' && l.crop) {
                  updateLayer(l.id, {
                    lockProportions: true,
                    aspectRatio: l.h > 0 ? l.w / l.h : 1,
                  })
                }
              }
            }
            pinch.current = {
              mode: 'resize',
              id: info.primaryId,
              startDist,
              w0: Math.max(20, info.maxX - info.minX),
              h0: Math.max(20, info.maxY - info.minY),
              x0: info.minX,
              y0: info.minY,
              fontSize: info.targetLayer.fontSize || 40,
              group: info.measured,
              crop0: isCroppedImage && targetL?.crop ? { ...targetL.crop } : undefined,
              isCroppedImage,
              points0: targetL?.type === 'path' && targetL.points ? cloneVectorPoints(targetL.points) : undefined,
            }
          } else {
            select(null)
            pinch.current = {
              mode: 'zoom',
              startDist,
              s0: v.scale,
              lx: (m.x - cx - v.x) / v.scale,
              ly: (m.y - cy - v.y) / v.scale,
            }
          }
        }
        pinching.current = true
        setPinchActive(true)
        gesture.current = null
        panGesture.current = null
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && pinch.current) {
        e.preventDefault()
        const [t1, t2] = [e.touches[0], e.touches[1]]
        const p = pinch.current
        const ratio = tdist(t1, t2) / p.startDist
        if (p.mode === 'resize') {
          applyPinchScaling(p, ratio)
          return
        }
        const m = tmid(t1, t2)
        const s1 = clampN(p.s0 * ratio, 0.5, 6)
        const { cx, cy } = center()
        setView({ scale: s1, x: m.x - cx - s1 * p.lx, y: m.y - cy - s1 * p.ly })
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      touchCount.current = e.touches.length
      if (e.touches.length < 2 && (pinch.current || pinching.current || pinchTouchSequence.current)) {
        if (pinch.current?.mode === 'resize') {
          if (pinch.current.isCroppedImage) {
            updateLayer(pinch.current.id, { lockProportions: false })
          }
          if (pinch.current.group) {
            for (const item of pinch.current.group) {
              if (item.isCroppedImage) {
                updateLayer(item.id, { lockProportions: false })
              }
            }
          }
        }
        lastPinchEndTime.current = Date.now()
        lastGestureMovedRef.current = true
        pinch.current = null
        pinching.current = false
        setPinchActive(false)
        if (!pinchStartedInMultiSelect.current) {
          setMultiSelectMode(false)
          multiSelectModeRef.current = false
        }
        pinchStartedInMultiSelect.current = false
      }
      // Keep the touch sequence locked while one finger remains down. Safari
      // can send that remaining finger over another layer before the final
      // touchend, which must not start a new selection.
      if (e.touches.length === 0) {
        touchSelectionLock.current = null
        pinchTouchSequence.current = false
        gestureStartSelectionRef.current = (selectedRef.current && selectedIdsRef.current.includes(selectedRef.current))
          ? selectedRef.current
          : (selectedIdsRef.current[0] ?? null)
      }
    }
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', onWheel, { passive: false })
    // Capture touchstart before React's delegated pointer handlers run. This
    // locks the active selection before a second finger can hit another layer.
    el.addEventListener('touchstart', onTouchStart, { passive: false, capture: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    el.addEventListener('gesturestart', stop as EventListener, { passive: false })
    el.addEventListener('gesturechange', stop as EventListener, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('gesturestart', stop as EventListener)
      el.removeEventListener('gesturechange', stop as EventListener)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startMove = (e: React.PointerEvent, l: Layer) => {
    // Once a touch sequence becomes a pinch, neither finger may hit-test or
    // select another layer while the selected layer is being resized.
    if (
      e.pointerType === 'touch' &&
      (pinching.current || pinchTouchSequence.current || touchCount.current >= 2 || activeTouches.current.size > 1)
    ) {
      e.stopPropagation()
      e.preventDefault()
      return
    }
    // A resize owns the active pointer until pointerup, even if the resized
    // layer now overlaps another layer beneath the pointer.
    if (gesture.current?.mode === 'resize') {
      e.stopPropagation()
      e.preventDefault()
      return
    }
    if (editingId === l.id) {
      return
    }
    if (imagePositioningId === l.id && l.type === 'image') {
      e.stopPropagation()
      const pos = parseImagePosition(l.imagePosition)
      const imgNode = (layerRefs.current.get(l.id)?.querySelector('img') || document.querySelector(`[data-testid="layer-${l.id}"] img`)) as HTMLImageElement | null
      const nw = imgNode?.naturalWidth || l.w
      const nh = imgNode?.naturalHeight || l.h

      const origCrop = l.crop ? { ...l.crop } : undefined

      gesture.current = {
        id: l.id,
        mode: 'image-position',
        sx: e.clientX,
        sy: e.clientY,
        startPosX: pos.x,
        startPosY: pos.y,
        layerW: l.w,
        layerH: l.h,
        naturalW: nw,
        naturalH: nh,
        moved: false,
        origCrop,
      }
      return
    }
    if (
      pinching.current ||
      (e.pointerType === 'touch' &&
        (pinchTouchSequence.current || touchCount.current >= 2 || activeTouches.current.size > 1)) ||
      (e.pointerType === 'touch' && pinch.current !== null)
    ) {
      if (e.pointerType === 'touch') {
        e.preventDefault()
        e.stopPropagation()
      }
      return
    }
    e.stopPropagation()
    if (longPress.current) {
      window.clearTimeout(longPress.current)
      longPress.current = null
    }

    const vectorEditLayer = vectorEditingIdRef.current
      ? layersRef.current.find((ly) => ly.id === vectorEditingIdRef.current && ly.type === 'path' && ly.visible && !ly.locked)
      : null
    const isVectorEditingAnchors = Boolean(
      vectorEditLayer &&
      vectorEditLayer.points &&
      vectorEditLayer.points.length > 0 &&
      selectedAnchorIndicesRef.current.length > 0
    )

    if (isVectorEditingAnchors && vectorEditLayer && vectorEditLayer.points) {
      setVectorAlign(null)
      if (e.pointerType === 'touch') {
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
      const effVectorLayer = vectorEditLayer.keyframes && vectorEditLayer.keyframes.length > 0
        ? interpolateKeyframes(vectorEditLayer, time)
        : vectorEditLayer
      const effPoints = effVectorLayer.points || vectorEditLayer.points
      const startPoints = effPoints.map((p) => ({
        ...p,
        cp1: p.cp1 ? { ...p.cp1 } : undefined,
        cp2: p.cp2 ? { ...p.cp2 } : undefined,
      }))
      gesture.current = {
        id: vectorEditLayer.id,
        mode: 'vector-anchor',
        sx: e.clientX,
        sy: e.clientY,
        startPoints,
        activeSelected: [...selectedAnchorIndicesRef.current],
        snapAnchorIdx: selectedAnchorIndicesRef.current[0] ?? 0,
        layerW: effVectorLayer.w,
        layerH: effVectorLayer.h,
        rotation: effVectorLayer.rotation || 0,
        moved: false,
        deselectOnTap: l.id !== vectorEditLayer.id,
      }
      return
    }

    const topGroup = getTopmostGroup(l.id, project.layers)
    const isChildOfSelectedGroup = topGroup && selectedIds.includes(topGroup.id)
    const isExternalToSelection = selectedIds.length > 0 && !selectedIds.includes(l.id) && !isChildOfSelectedGroup

    if (isExternalToSelection) {
      const allSelectedAndDescIds = new Set<string>()
      for (const id of selectedIds) {
        allSelectedAndDescIds.add(id)
        const desc = getDescendantLayers(id, project.layers)
        for (const d of desc) allSelectedAndDescIds.add(d.id)
      }
      const selectedLayers = project.layers.filter((item) => allSelectedAndDescIds.has(item.id) && item.visible && !item.locked)
      if (selectedLayers.length > 0) {
        const primary = selectedLayers[0]
        const pNode = layerRefs.current.get(primary.id)
        const pW = (primary.type === 'text' && pNode ? pNode.offsetWidth : pNode?.offsetWidth) || primary.w
        const pH = (primary.type === 'text' && pNode ? pNode.offsetHeight : pNode?.offsetHeight) || primary.h
        const pX = (primary.type === 'text' && primary.align === 'center' && primary.x === 0 && primary.w === preset.w && pNode)
          ? (preset.w - pW) / 2
          : primary.x
        const group = selectedLayers.length > 1
          ? selectedLayers.map((item) => {
              const itemNode = layerRefs.current.get(item.id)
              const itemW = (item.type === 'text' && itemNode ? itemNode.offsetWidth : itemNode?.offsetWidth) || item.w
              const itemH = (item.type === 'text' && itemNode ? itemNode.offsetHeight : itemNode?.offsetHeight) || item.h
              const itemX = (item.type === 'text' && item.align === 'center' && item.x === 0 && item.w === preset.w && itemNode)
                ? (preset.w - itemW) / 2
                : item.x
              return { id: item.id, x: itemX, y: item.y, w: itemW, h: itemH }
            })
          : undefined
        gesture.current = {
          id: primary.id,
          mode: 'move',
          sx: e.clientX,
          sy: e.clientY,
          ox: pX,
          oy: primary.y,
          ow: pW,
          oh: pH,
          fromCanvas: false,
          moved: false,
          deselectOnTap: !multiSelectModeRef.current,
          tapAddId: multiSelectModeRef.current ? l.id : undefined,
          group,
        }
        if (e.pointerType === 'touch') {
          e.currentTarget.setPointerCapture?.(e.pointerId)
        }
        return
      }
    }

    if (l.locked) {
      return
    }

    if (!multiSelectModeRef.current) {
      longPress.current = window.setTimeout(() => {
        setMultiSelectMode(true)
        multiSelectModeRef.current = true
        select(l.id, true)
        gesture.current = null
        longPress.current = null
        try {
          navigator.vibrate?.(40)
        } catch {}
      }, 450)
    }
    if (e.pointerType === 'touch') {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    let target = l
    if (topGroup && (selectedId === topGroup.id || (!selectedIds.includes(topGroup.id) && !selectedIds.includes(l.id) && !multiSelectModeRef.current))) {
      target = topGroup
    }

    if (multiSelectModeRef.current) {
      if (!selectedIds.includes(target.id)) {
        select(target.id, true)
        gesture.current = null
        return
      }
    } else if (!selectedIds.includes(target.id)) {
      select(target.id)
    }

    // Collect all layers that must move together
    let itemsToMove: Layer[] = []
    if (selectedIds.length > 1 && (selectedIds.includes(target.id) || selectedIds.includes(l.id))) {
      const allIds = new Set<string>()
      for (const id of selectedIds) {
        allIds.add(id)
        const desc = getDescendantLayers(id, project.layers)
        for (const d of desc) allIds.add(d.id)
      }
      itemsToMove = project.layers.filter((item) => allIds.has(item.id) && !item.locked)
    } else if (target.type === 'group') {
      const hasKf = Boolean(target.keyframes && target.keyframes.length > 0)
      if (hasKf) {
        itemsToMove = [target]
      } else {
        const desc = getDescendantLayers(target.id, project.layers)
        itemsToMove = [target, ...desc.filter((item) => !item.locked)]
      }
    } else {
      itemsToMove = [target]
    }

    const node = layerRefs.current.get(target.id)
    let currentX = (target.type === 'text' && target.align === 'center' && target.x === 0 && target.w === preset.w && node)
      ? (preset.w - node.offsetWidth) / 2
      : target.x
    let currentY = target.y
    let currentW = (target.type === 'text' && node ? node.offsetWidth : node?.offsetWidth) || target.w
    let currentH = (target.type === 'text' && node ? node.offsetHeight : node?.offsetHeight) || target.h

    if (target.type === 'group' && (!currentW || !currentH)) {
      const b = computeGroupBounds(target.id, project.layers)
      currentX = target.x || b.x
      currentY = target.y || b.y
      currentW = target.w || b.w
      currentH = target.h || b.h
    }

    if (target.keyframes && target.keyframes.length > 0) {
      const effTarget = interpolateKeyframes(target, time)
      currentX = effTarget.x
      currentY = effTarget.y
    }

    const group = itemsToMove.length > 1
      ? itemsToMove.map((item) => {
          const itemNode = layerRefs.current.get(item.id)
          const itemW = (item.type === 'text' && itemNode ? itemNode.offsetWidth : itemNode?.offsetWidth) || item.w
          const itemH = (item.type === 'text' && itemNode ? itemNode.offsetHeight : itemNode?.offsetHeight) || item.h
          const itemX = (item.type === 'text' && item.align === 'center' && item.x === 0 && item.w === preset.w && itemNode)
            ? (preset.w - itemW) / 2
            : item.x
          return { id: item.id, x: itemX, y: item.y, w: itemW, h: itemH }
        })
      : undefined

    gesture.current = {
      id: target.id,
      mode: 'move',
      sx: e.clientX,
      sy: e.clientY,
      ox: currentX,
      oy: currentY,
      ow: currentW,
      oh: currentH,
      fromCanvas: false,
      moved: false,
      deselectOnTap: false,
      tapToggleId: multiSelectModeRef.current && selectedIds.length > 1 && selectedIds.includes(target.id) ? target.id : undefined,
      group,
    }
  }
  useEffect(() => {
    if (!selectedId || !project.layers.some((l) => l.id === selectedId && l.isComponent)) {
      setEditingComponentId(null)
    }
  }, [selectedId, project.layers])

  const handleDoubleTap = (l: Layer) => {
    if (l.locked) return
    if (l.type === 'image') {
      tapTrackerRef.current.widenedInSequence = true
      updateLayer(l.id, { x: 0, w: preset.w })
      select(l.id)
    } else if (l.type === 'text') {
      setEditingId(l.id)
    } else if (l.type === 'path') {
      select(l.id)
      setVectorEditingId(l.id)
    } else {
      select(l.id)
    }
  }

  const handleTripleTap = (l: Layer, info?: { prevX?: number; prevW?: number; widened?: boolean }) => {
    if (l.locked) return
    if (l.type === 'text') {
      setEditingId(null)
    }
    if (l.type === 'group') {
      const scaleY = preset.h / Math.max(1, l.h)
      const desc = getDescendantLayers(l.id, project.layers)
      for (const child of desc) {
        const relY = child.y - l.y
        updateLayer(child.id, {
          y: Math.round(relY * scaleY),
          h: Math.max(10, Math.round(child.h * scaleY)),
        })
      }
      updateLayer(l.id, { y: 0, h: preset.h })
      select(l.id)
      return
    }
    const patch: Partial<Layer> = { y: 0, h: preset.h }
    if (l.type === 'image' && info?.widened && info?.prevX !== undefined && info?.prevW !== undefined) {
      patch.x = info.prevX
      patch.w = info.prevW
    }
    updateLayer(l.id, patch)
    select(l.id)
  }

  const handleLayerClick = (e: React.MouseEvent, l: Layer) => {
    e.stopPropagation()
    if (l.locked) return
    if (lastPinchEndTime.current && Date.now() - lastPinchEndTime.current < 200) {
      return
    }
    if (lastGestureMovedRef.current) {
      lastGestureMovedRef.current = false
      return
    }

    const now = Date.now()
    const tracker = tapTrackerRef.current
    const isSameLayer = tracker.layerId === l.id
    const isWithinTime = now - tracker.time <= 400

    let count = 1
    if (isSameLayer && isWithinTime) {
      count = tracker.count + 1
    }
    if (e.detail && e.detail > count) {
      count = e.detail
    }

    if (count === 1) {
      tapTrackerRef.current = {
        layerId: l.id,
        time: now,
        count: 1,
        initialX: l.x,
        initialW: l.w,
        widenedInSequence: false,
      }
    } else if (count === 2) {
      tapTrackerRef.current = {
        ...tracker,
        layerId: l.id,
        time: now,
        count: 2,
      }
      handleDoubleTap(l)
    } else if (count >= 3) {
      const prevX = tracker.initialX ?? l.x
      const prevW = tracker.initialW ?? l.w
      const widened = tracker.widenedInSequence ?? false
      tapTrackerRef.current = {
        layerId: '',
        time: 0,
        count: 0,
      }
      handleTripleTap(l, { prevX, prevW, widened })
    }
  }

  const startResize = (e: React.PointerEvent, l: Layer, handle: ResizeHandle, boxW: number, boxH: number, boundsLeft?: number, boundsTop?: number, group?: { id: string; x: number; y: number; w: number; h: number; fontSize?: number }[]) => {
    if (pinching.current) return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const node = layerRefs.current.get(l.id)
    const currentW = l.type === 'text' && node ? node.offsetWidth : l.w
    const currentH = l.type === 'text' && node ? node.offsetHeight : boxH
    const currentX = (l.type === 'text' && l.align === 'center' && l.x === 0 && l.w === preset.w && node)
      ? (preset.w - currentW) / 2
      : l.x
    const originX = group ? (boundsLeft ?? currentX) : currentX
    const originY = group ? (boundsTop ?? l.y) : l.y
    const originW = group ? boxW : currentW
    const originH = group ? boxH : currentH

    if (l.type === 'text' && l.align === 'center' && l.x === 0 && l.w === preset.w) {
      updateLayer(l.id, { x: Math.round(originX), w: Math.round(originW) })
    }

    let bgShapeIds: string[] | undefined = undefined
    let minFgLeft: number | undefined = undefined
    let maxFgRight: number | undefined = undefined
    let minFgTop: number | undefined = undefined
    let maxFgBottom: number | undefined = undefined

    if (group && group.length > 0) {
      bgShapeIds = findGroupBackgroundShapes(group, project.layers, originW, originH, originX, originY)
      const fgItems = group.filter((item) => !bgShapeIds!.includes(item.id))
      if (fgItems.length > 0) {
        minFgLeft = Math.min(...fgItems.map((i) => i.x))
        maxFgRight = Math.max(...fgItems.map((i) => i.x + i.w))
        minFgTop = Math.min(...fgItems.map((i) => i.y))
        maxFgBottom = Math.max(...fgItems.map((i) => i.y + i.h))
      }
    }

    const isImage = l.type === 'image'
    const lockProportions = isImage ? Boolean(l.lockProportions) : false
    const aspectRatio = (l.lockProportions && l.aspectRatio) ? l.aspectRatio : (originH > 0 ? originW / originH : 1)

    let origCrop = l.crop ? { ...l.crop } : undefined
    if (isImage && !origCrop && !lockProportions) {
      const imgNode = (layerRefs.current.get(l.id)?.querySelector('img') || document.querySelector(`[data-testid="layer-${l.id}"] img`)) as HTMLImageElement | null
      const nw = imgNode?.naturalWidth || originW
      const nh = imgNode?.naturalHeight || originH
      const scale = Math.max(originW / nw, originH / nh)
      const renderedW = Math.round(nw * scale)
      const renderedH = Math.round(nh * scale)
      const pos = parseImagePosition(l.imagePosition)
      const overflowX = Math.max(0, renderedW - originW)
      const overflowY = Math.max(0, renderedH - originH)
      origCrop = {
        x: Math.round(-overflowX * (pos.x / 100)),
        y: Math.round(-overflowY * (pos.y / 100)),
        w: renderedW,
        h: renderedH,
      }
    }

    const isCorner = handle === 'tl' || handle === 'tr' || handle === 'bl' || handle === 'br'
    const centerX = originX + originW / 2
    const centerY = originY + originH / 2
    const initialRotation = (!group && l.rotation) ? l.rotation : 0
    let handleAngle = 0

    if (isCorner) {
      const dx0 = (handle === 'tr' || handle === 'br' ? originW / 2 : -originW / 2)
      const dy0 = (handle === 'bl' || handle === 'br' ? originH / 2 : -originH / 2)
      const rad = (initialRotation * Math.PI) / 180
      const dxRot = dx0 * Math.cos(rad) - dy0 * Math.sin(rad)
      const dyRot = dx0 * Math.sin(rad) + dy0 * Math.cos(rad)
      handleAngle = (Math.atan2(dyRot, dxRot) * 180) / Math.PI
    }

    const artboardEl = document.querySelector('[data-testid="artboard"]')
    const artboardRect = artboardEl?.getBoundingClientRect()
    const effNow = scale * viewRef.current.scale
    const clientCenterX = (artboardRect?.left ?? 0) + centerX * effNow
    const clientCenterY = (artboardRect?.top ?? 0) + centerY * effNow
    const startPointerAngle = (Math.atan2(e.clientY - clientCenterY, e.clientX - clientCenterX) * 180) / Math.PI

    let initialLayerStates: { id: string; x: number; y: number; w: number; h: number; rotation: number; centerX: number; centerY: number }[] | undefined
    if (group && group.length > 0) {
      initialLayerStates = group.map((item) => {
        const lyr = layersRef.current.find((k) => k.id === item.id)
        return {
          id: item.id,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          rotation: lyr?.rotation || 0,
          centerX: item.x + item.w / 2,
          centerY: item.y + item.h / 2,
        }
      })
    } else {
      initialLayerStates = [{
        id: l.id,
        x: originX,
        y: originY,
        w: originW,
        h: originH,
        rotation: l.rotation || 0,
        centerX,
        centerY,
      }]
    }

    gesture.current = {
      id: l.id,
      mode: 'resize',
      handle,
      isCorner,
      cornerMode: isCorner ? 'pending' : 'resize',
      centerX,
      centerY,
      handleAngle,
      startPointerAngle,
      initialRotation,
      initialLayerStates,
      isText: l.type === 'text',
      isImage,
      lockProportions,
      aspectRatio,
      layerType: l.type,
      sx: e.clientX,
      sy: e.clientY,
      ox: originX,
      oy: originY,
      ow: originW,
      oh: originH,
      ofs: l.fontSize || 40,
      origPadTop: l.paddingTop || 0,
      origPadRight: l.paddingRight || 0,
      origPadBottom: l.paddingBottom || 0,
      origPadLeft: l.paddingLeft || 0,
      group,
      bgShapeIds,
      minFgLeft,
      maxFgRight,
      minFgTop,
      maxFgBottom,
      origCrop,
      origPoints: l.type === 'path' && l.points ? JSON.parse(JSON.stringify(l.points)) : undefined,
    }
  }

  const bg = project.background
  const bgStyle: React.CSSProperties =
    bg.type === 'color'
      ? { background: bg.value }
      : bg.type === 'gradient'
        ? { backgroundImage: bg.value }
        : { backgroundImage: `url(${bg.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }

  const eff = scale * view.scale
  const hs = eff ? 11 / eff : 11 // handle size in artboard px (constant on screen)

  return (
    <div
      ref={ref}
      className={`checkerboard relative z-0 flex min-h-0 min-w-0 flex-1 touch-none items-center justify-center overflow-hidden select-none ${
        eyedropper ? 'pointer-events-none' : ''
      }`}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDownCapture={(e) => {
        if (e.pointerType !== 'touch') return
        if (activeTouches.current.size === 0) {
          touchSelectionLock.current = gestureStartSelectionRef.current
        }
        activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        touchCount.current = activeTouches.current.size
        if (activeTouches.current.size >= 2) {
          pinchTouchSequence.current = true
          pinchStartedInMultiSelect.current = multiSelectModeRef.current || selectedIdsRef.current.length > 1
          if (marqueeLongPress.current) {
            window.clearTimeout(marqueeLongPress.current)
            marqueeLongPress.current = null
          }
          if (marqueeSession.current.active) {
            setMarquee(null)
            marqueeSession.current.active = false
          }
          e.preventDefault()
          e.stopPropagation()
        }
        if (activeTouches.current.size < 2 || pinch.current) return

        const points = Array.from(activeTouches.current.values())
        const startDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
        if (startDist < 1) return
        e.preventDefault()
        e.stopPropagation()
        pinching.current = true
        pinchTouchSequence.current = true
        gesture.current = null
        const targetId = touchSelectionLock.current || gestureStartSelectionRef.current
        const info = targetId ? getPinchTargetAndItems(targetId) : null
        if (info) {
          const targetL = layersRef.current.find((l) => l.id === info.primaryId)
          const isCroppedImage = targetL?.type === 'image' && Boolean(targetL.crop)
          if (isCroppedImage && targetL) {
            updateLayer(targetL.id, {
              lockProportions: true,
              aspectRatio: targetL.h > 0 ? targetL.w / targetL.h : 1,
            })
          }
          if (info.measured) {
            for (const m of info.measured) {
              const l = layersRef.current.find((candidate) => candidate.id === m.id)
              if (l?.type === 'image' && l.crop) {
                updateLayer(l.id, {
                  lockProportions: true,
                  aspectRatio: l.h > 0 ? l.w / l.h : 1,
                })
              }
            }
          }
          pinch.current = {
            mode: 'resize',
            id: info.primaryId,
            startDist,
            w0: Math.max(20, info.maxX - info.minX),
            h0: Math.max(20, info.maxY - info.minY),
            x0: info.minX,
            y0: info.minY,
            fontSize: info.targetLayer.fontSize || 40,
            group: info.measured,
            crop0: isCroppedImage && targetL?.crop ? { ...targetL.crop } : undefined,
            isCroppedImage,
            points0: targetL?.type === 'path' && targetL.points ? cloneVectorPoints(targetL.points) : undefined,
          }
          setPinchActive(true)
        } else {
          select(null)
          const v = viewRef.current
          const { cx, cy } = center()
          const mx = (points[0].x + points[1].x) / 2
          const my = (points[0].y + points[1].y) / 2
          pinch.current = { mode: 'zoom', startDist, s0: v.scale, lx: (mx - cx - v.x) / v.scale, ly: (my - cy - v.y) / v.scale }
          setPinchActive(true)
        }
      }}
      onPointerMoveCapture={(e) => {
        if (e.pointerType === 'touch') {
          activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pinching.current && pinch.current && activeTouches.current.size >= 2) {
            const points = Array.from(activeTouches.current.values())
            const currentDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
            const p = pinch.current
            if (p.startDist > 0 && p.mode === 'resize') {
              const ratio = currentDist / p.startDist
              applyPinchScaling(p, ratio)
            } else if (p.startDist > 0 && p.mode === 'zoom') {
              const ratio = currentDist / p.startDist
              const mx = (points[0].x + points[1].x) / 2
              const my = (points[0].y + points[1].y) / 2
              const s1 = clampN(p.s0 * ratio, 0.5, 6)
              const { cx, cy } = center()
              setView({ scale: s1, x: mx - cx - s1 * p.lx, y: my - cy - s1 * p.ly })
            }
          }
        }
      }}
      onPointerUpCapture={(e) => {
        if (e.pointerType === 'touch') {
          activeTouches.current.delete(e.pointerId)
          if (activeTouches.current.size < 2 && (pinch.current || pinching.current)) {
            if (pinch.current?.mode === 'resize') {
              if (pinch.current.isCroppedImage) {
                updateLayer(pinch.current.id, { lockProportions: false })
              }
              if (pinch.current.group) {
                for (const item of pinch.current.group) {
                  if (item.isCroppedImage) {
                    updateLayer(item.id, { lockProportions: false })
                  }
                }
              }
            }
            lastPinchEndTime.current = Date.now()
            lastGestureMovedRef.current = true
            pinch.current = null
            pinching.current = false
            setPinchActive(false)
            setSizeMatch(null)
          }
          if (activeTouches.current.size === 0) {
            pinchTouchSequence.current = false
            touchSelectionLock.current = null
            gestureStartSelectionRef.current = (selectedRef.current && selectedIdsRef.current.includes(selectedRef.current))
              ? selectedRef.current
              : (selectedIdsRef.current[0] ?? null)
          }
        }
      }}
      onPointerCancelCapture={(e) => {
        if (e.pointerType === 'touch') {
          activeTouches.current.delete(e.pointerId)
          if (activeTouches.current.size < 2 && (pinch.current || pinching.current)) {
            if (pinch.current?.mode === 'resize') {
              if (pinch.current.isCroppedImage) {
                updateLayer(pinch.current.id, { lockProportions: false })
              }
              if (pinch.current.group) {
                for (const item of pinch.current.group) {
                  if (item.isCroppedImage) {
                    updateLayer(item.id, { lockProportions: false })
                  }
                }
              }
            }
            lastPinchEndTime.current = Date.now()
            lastGestureMovedRef.current = true
            pinch.current = null
            pinching.current = false
            setPinchActive(false)
            setSizeMatch(null)
          }
          if (activeTouches.current.size === 0) {
            pinchTouchSequence.current = false
            touchSelectionLock.current = null
            gestureStartSelectionRef.current = (selectedRef.current && selectedIdsRef.current.includes(selectedRef.current))
              ? selectedRef.current
              : (selectedIdsRef.current[0] ?? null)
          }
        }
      }}
      onPointerDown={(e) => {
        if (isSpacePressed.current || (e.pointerType === 'mouse' && e.button === 1)) {
          e.preventDefault()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          const v = viewRef.current
          panGesture.current = { sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y, moved: false }
          return
        }
        if (e.pointerType === 'mouse' && e.button !== 0) return
        const target = e.target as HTMLElement
        const hitLayer = target.closest('[data-testid^="layer-"]')
        const hitHandle = target.closest('[data-testid^="resize-"]')
        if (hitHandle || hitLayer) return
        if (pinching.current || (e.pointerType === 'touch' && (touchCount.current >= 2 || activeTouches.current.size > 1))) return

        const artboard = e.currentTarget.querySelector('[data-testid="artboard"]')?.getBoundingClientRect()
        const v = viewRef.current
        const toArtboard = (clientX: number, clientY: number) => {
          if (!artboard) return { x: 0, y: 0 }
          const rawX = (clientX - artboard.left) / (scale * v.scale)
          const rawY = (clientY - artboard.top) / (scale * v.scale)
          return {
            x: rawX,
            y: rawY,
          }
        }

        // Check if there are selected layers to move
        const allSelectedAndDescIds = new Set<string>()
        for (const id of selectedIds) {
          allSelectedAndDescIds.add(id)
          const desc = getDescendantLayers(id, project.layers)
          for (const d of desc) allSelectedAndDescIds.add(d.id)
        }
        const selectedLayers = project.layers.filter((item) => allSelectedAndDescIds.has(item.id) && item.visible && !item.locked)
        const marqueeStart = toArtboard(e.clientX, e.clientY)
        const startClient = { x: e.clientX, y: e.clientY }
        const pointerId = e.pointerId
        const currentTarget = e.currentTarget

        if (marqueeLongPress.current) {
          window.clearTimeout(marqueeLongPress.current)
          marqueeLongPress.current = null
        }

        // If in vector editing mode and anchor points are selected, dragging anywhere on the canvas moves them
        const vectorEditLayer = vectorEditingIdRef.current
          ? project.layers.find((ly) => ly.id === vectorEditingIdRef.current && ly.type === 'path' && ly.visible && !ly.locked)
          : null
        const isVectorEditingAnchors = Boolean(
          vectorEditLayer &&
          vectorEditLayer.points &&
          vectorEditLayer.points.length > 0 &&
          selectedAnchorIndicesRef.current.length > 0
        )

        if (isVectorEditingAnchors && vectorEditLayer && vectorEditLayer.points) {
          setVectorAlign(null)
          const effVectorLayer = vectorEditLayer.keyframes && vectorEditLayer.keyframes.length > 0
            ? interpolateKeyframes(vectorEditLayer, time)
            : vectorEditLayer
          const effPoints = effVectorLayer.points || vectorEditLayer.points
          const startPoints = effPoints.map((p) => ({
            ...p,
            cp1: p.cp1 ? { ...p.cp1 } : undefined,
            cp2: p.cp2 ? { ...p.cp2 } : undefined,
          }))
          gesture.current = {
            id: vectorEditLayer.id,
            mode: 'vector-anchor',
            sx: e.clientX,
            sy: e.clientY,
            startPoints,
            activeSelected: [...selectedAnchorIndicesRef.current],
            snapAnchorIdx: selectedAnchorIndicesRef.current[0] ?? 0,
            layerW: effVectorLayer.w,
            layerH: effVectorLayer.h,
            rotation: effVectorLayer.rotation || 0,
            moved: false,
            deselectOnTap: true,
          }
          if (e.pointerType === 'touch') {
            e.currentTarget.setPointerCapture?.(e.pointerId)
          }
        } else if (selectedLayers.length > 0) {
          const primary = selectedLayers[0]
          const pNode = layerRefs.current.get(primary.id)
          const pW = (primary.type === 'text' && pNode ? pNode.offsetWidth : pNode?.offsetWidth) || primary.w
          const pH = (primary.type === 'text' && pNode ? pNode.offsetHeight : pNode?.offsetHeight) || primary.h
          const pX = (primary.type === 'text' && primary.align === 'center' && primary.x === 0 && primary.w === preset.w && pNode)
            ? (preset.w - pW) / 2
            : primary.x
          const group = selectedLayers.length > 1
            ? selectedLayers.map((item) => {
                const itemNode = layerRefs.current.get(item.id)
                const itemW = (item.type === 'text' && itemNode ? itemNode.offsetWidth : itemNode?.offsetWidth) || item.w
                const itemH = (item.type === 'text' && itemNode ? itemNode.offsetHeight : itemNode?.offsetHeight) || item.h
                const itemX = (item.type === 'text' && item.align === 'center' && item.x === 0 && item.w === preset.w && itemNode)
                  ? (preset.w - itemW) / 2
                  : item.x
                return { id: item.id, x: itemX, y: item.y, w: itemW, h: itemH }
              })
            : undefined
          gesture.current = {
            id: primary.id,
            mode: 'move',
            sx: e.clientX,
            sy: e.clientY,
            ox: pX,
            oy: primary.y,
            ow: pW,
            oh: pH,
            fromCanvas: true,
            moved: false,
            deselectOnTap: true,
            group,
          }
          if (e.pointerType === 'touch') {
            e.currentTarget.setPointerCapture?.(e.pointerId)
          }
        } else if (e.pointerType === 'touch') {
          // On touch, allow panning if no element is selected
          panGesture.current = { sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y, moved: false }
        }

        const updateMarquee = (event: PointerEvent) => {
          if (!marqueeSession.current.active) {
            const dist = Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y)
            if (event.pointerType === 'mouse' && dist > 4 && selectedLayers.length === 0) {
              marqueeSession.current.active = true
              panGesture.current = null
              gesture.current = null
              setMarquee({ x: marqueeStart.x, y: marqueeStart.y, w: 0, h: 0 })
            } else if (dist > 8) {
              if (marqueeLongPress.current) {
                window.clearTimeout(marqueeLongPress.current)
                marqueeLongPress.current = null
              }
            }
            return
          }
          const end = toArtboard(event.clientX, event.clientY)
          const box = {
            left: Math.min(marqueeStart.x, end.x),
            top: Math.min(marqueeStart.y, end.y),
            right: Math.max(marqueeStart.x, end.x),
            bottom: Math.max(marqueeStart.y, end.y),
          }
          const ids = project.layers
            .filter((layer) => layer.visible && !layer.locked && layer.x < box.right && layer.x + layer.w > box.left && layer.y < box.bottom && layer.y + layer.h > box.top)
            .map((layer) => layer.id)
          setMarquee({ x: box.left, y: box.top, w: box.right - box.left, h: box.bottom - box.top })
          if (ids.length > 1) {
            setMultiSelectMode(true)
            multiSelectModeRef.current = true
            select(ids[0], false, ids)
          } else if (ids.length === 1) {
            setMultiSelectMode(false)
            multiSelectModeRef.current = false
            select(ids[0])
          } else {
            setMultiSelectMode(false)
            multiSelectModeRef.current = false
            select(null)
          }
        }

        const finishMarquee = (event: PointerEvent) => {
          if (marqueeLongPress.current) {
            window.clearTimeout(marqueeLongPress.current)
            marqueeLongPress.current = null
          }
          window.removeEventListener('pointermove', updateMarquee)
          window.removeEventListener('pointerup', finishMarquee)
          window.removeEventListener('pointercancel', finishMarquee)

          if (!marqueeSession.current.active) {
            panGesture.current = null
            return
          }

          const end = toArtboard(event.clientX, event.clientY)
          const box = {
            left: Math.min(marqueeStart.x, end.x),
            top: Math.min(marqueeStart.y, end.y),
            right: Math.max(marqueeStart.x, end.x),
            bottom: Math.max(marqueeStart.y, end.y),
          }
          const ids = project.layers
            .filter((layer) => layer.visible && !layer.locked && layer.x < box.right && layer.x + layer.w > box.left && layer.y < box.bottom && layer.y + layer.h > box.top)
            .map((layer) => layer.id)
          setMarquee(null)
          marqueeSession.current.active = false
          panGesture.current = null
          if (ids.length > 1) {
            setMultiSelectMode(true)
            multiSelectModeRef.current = true
            select(ids[0], false, ids)
          } else if (ids.length === 1) {
            setMultiSelectMode(false)
            multiSelectModeRef.current = false
            select(ids[0])
          } else {
            setMultiSelectMode(false)
            multiSelectModeRef.current = false
            select(null)
          }
        }

        marqueeSession.current = { active: false, start: marqueeStart, update: updateMarquee, finish: finishMarquee }
        if (e.pointerType === 'touch') {
          marqueeLongPress.current = window.setTimeout(() => {
            gesture.current = null
            panGesture.current = null
            marqueeSession.current.active = true
            try {
              navigator.vibrate?.(40)
            } catch {}
            setMarquee({ x: marqueeStart.x, y: marqueeStart.y, w: 0, h: 0 })
            try {
              currentTarget.setPointerCapture?.(pointerId)
            } catch {}
          }, 350)
        }

        window.addEventListener('pointermove', updateMarquee)
        window.addEventListener('pointerup', finishMarquee)
        window.addEventListener('pointercancel', finishMarquee)
      }}
      data-testid="canvas"
    >
      {scale > 0 && (
        <div
          className="relative shrink-0"
          style={{
            width: preset.w,
            height: preset.h,
            transform: `translate(${view.x}px, ${view.y}px) scale(${eff})`,
            transformOrigin: 'center',
          }}
          data-testid="camera-stage"
        >
        <div
          className="relative shrink-0 shadow-2xl"
          style={{ width: preset.w, height: preset.h, transformOrigin: 'center', ...bgStyle }}
          data-testid="artboard"
        >
          {snapGuides && snapGuides.active && (
            <>
              {snapGuides.xGuides.includes(preset.w / 2) && (
                <svg
                  key="snap-x-center"
                  aria-hidden="true"
                  data-testid="snap-guide-vertical"
                  data-snapped={snapGuides.xGuides.includes(preset.w / 2)}
                  className="pointer-events-none absolute overflow-visible"
                  style={{
                    left: preset.w / 2,
                    top: -48 / eff,
                    width: 1,
                    height: preset.h + 96 / eff,
                    zIndex: 70,
                  }}
                >
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={preset.h + 96 / eff}
                    stroke={snapGuides.xGuides.includes(preset.w / 2) ? '#ff3b30' : '#eeeeee'}
                    strokeWidth={Math.max(1, 1.5 / eff)}
                    shapeRendering="geometricPrecision"
                  />
                </svg>
              )}
              {Array.from(new Set(snapGuides.xGuides.filter((x) => x !== preset.w / 2))).map((x, idx) => (
                <svg
                  key={`snap-x-${x}-${idx}`}
                  aria-hidden="true"
                  data-testid="snap-guide-vertical"
                  data-snapped="true"
                  className="pointer-events-none absolute overflow-visible"
                  style={{
                    left: x,
                    top: -48 / eff,
                    width: 1,
                    height: preset.h + 96 / eff,
                    zIndex: 70,
                  }}
                >
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={preset.h + 96 / eff}
                    stroke="#ff3b30"
                    strokeWidth={Math.max(1, 1.5 / eff)}
                    shapeRendering="geometricPrecision"
                  />
                </svg>
              ))}
              {snapGuides.yGuides.includes(preset.h / 2) && (
                <svg
                  key="snap-y-center"
                  aria-hidden="true"
                  data-testid="snap-guide-horizontal"
                  data-snapped={snapGuides.yGuides.includes(preset.h / 2)}
                  className="pointer-events-none absolute overflow-visible"
                  style={{
                    left: -48 / eff,
                    top: preset.h / 2,
                    width: preset.w + 96 / eff,
                    height: 1,
                    zIndex: 70,
                  }}
                >
                  <line
                    x1={0}
                    y1={0}
                    x2={preset.w + 96 / eff}
                    y2={0}
                    stroke={snapGuides.yGuides.includes(preset.h / 2) ? '#ff3b30' : '#eeeeee'}
                    strokeWidth={Math.max(1, 1.5 / eff)}
                    shapeRendering="geometricPrecision"
                  />
                </svg>
              )}
              {Array.from(new Set(snapGuides.yGuides.filter((y) => y !== preset.h / 2))).map((y, idx) => (
                <svg
                  key={`snap-y-${y}-${idx}`}
                  aria-hidden="true"
                  data-testid="snap-guide-horizontal"
                  data-snapped="true"
                  className="pointer-events-none absolute overflow-visible"
                  style={{
                    left: -48 / eff,
                    top: y,
                    width: preset.w + 96 / eff,
                    height: 1,
                    zIndex: 70,
                  }}
                >
                  <line
                    x1={0}
                    y1={0}
                    x2={preset.w + 96 / eff}
                    y2={0}
                    stroke="#ff3b30"
                    strokeWidth={Math.max(1, 1.5 / eff)}
                    shapeRendering="geometricPrecision"
                  />
                </svg>
              ))}
            </>
          )}
          {rotationSnap && rotationSnap.active && (
            <div
              key="rotation-snap-overlay"
              className="pointer-events-none absolute inset-0 overflow-visible"
              style={{ zIndex: 75 }}
              data-testid="rotation-snap-overlay"
            >
              {/* Axis snap line */}
              {rotationSnap.isSnapped && (
                <svg
                  className="pointer-events-none absolute overflow-visible"
                  style={{
                    left: rotationSnap.cx,
                    top: rotationSnap.cy,
                    width: 1,
                    height: 1,
                  }}
                >
                  {rotationSnap.isNormal ? (
                    <>
                      <line
                        x1={-preset.w * 2}
                        y1={0}
                        x2={preset.w * 2}
                        y2={0}
                        stroke="#3b82f6"
                        strokeWidth={Math.max(1.5, 2 / eff)}
                        strokeDasharray={`${6 / eff} ${4 / eff}`}
                      />
                      <line
                        x1={0}
                        y1={-preset.h * 2}
                        x2={0}
                        y2={preset.h * 2}
                        stroke="#3b82f6"
                        strokeWidth={Math.max(1.5, 2 / eff)}
                        strokeDasharray={`${6 / eff} ${4 / eff}`}
                      />
                    </>
                  ) : (
                    <line
                      x1={-Math.cos((rotationSnap.snapDegree * Math.PI) / 180) * 1600}
                      y1={-Math.sin((rotationSnap.snapDegree * Math.PI) / 180) * 1600}
                      x2={Math.cos((rotationSnap.snapDegree * Math.PI) / 180) * 1600}
                      y2={Math.sin((rotationSnap.snapDegree * Math.PI) / 180) * 1600}
                      stroke="#3b82f6"
                      strokeWidth={Math.max(1.5, 2 / eff)}
                      strokeDasharray={`${6 / eff} ${4 / eff}`}
                    />
                  )}
                </svg>
              )}

              {/* Center pivot point indicator */}
              <div
                style={{
                  position: 'absolute',
                  left: rotationSnap.cx - 5 / eff,
                  top: rotationSnap.cy - 5 / eff,
                  width: 10 / eff,
                  height: 10 / eff,
                  borderRadius: '50%',
                  backgroundColor: rotationSnap.isNormal ? '#3b82f6' : '#22c55e',
                  boxShadow: '0 0 0 2px white',
                }}
              />

              {/* Degree badge */}
              <div
                style={{
                  position: 'absolute',
                  left: rotationSnap.cx,
                  top: rotationSnap.cy - 36 / eff,
                  transform: 'translate(-50%, -100%)',
                  backgroundColor: rotationSnap.isNormal
                    ? '#1d4ed8'
                    : rotationSnap.isSnapped
                      ? '#15803d'
                      : 'rgba(15, 23, 42, 0.92)',
                  color: '#ffffff',
                  padding: `${4 / eff}px ${10 / eff}px`,
                  borderRadius: `${6 / eff}px`,
                  fontSize: `${Math.max(11, 13 / eff)}px`,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${4 / eff}px`,
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <RotateCw style={{ width: 12 / eff, height: 12 / eff }} />
                <span>
                  {rotationSnap.isNormal ? '0° (Normal)' : rotationSnap.label}
                </span>
              </div>
            </div>
          )}
          {project.layers.map((l) => {
            const effectiveLayer = l.keyframes && l.keyframes.length > 0 ? interpolateKeyframes(l, time) : l
            const a = getCompositeAnim(effectiveLayer, time, active, project.layers)
            if (l.visible === false || a.hidden) return null
            const isSel = selectedIds.includes(l.id)
            return (
              <div
                key={l.id}
                ref={(node) => {
                  if (node) layerRefs.current.set(l.id, node)
                  else layerRefs.current.delete(l.id)
                  if (isSel) selRef.current = node
                }}
          onTouchStart={(e) => {
            e.stopPropagation()
            if (l.locked || editingId === l.id) return
            if (e.touches.length > 1 || pinchTouchSequence.current || touchCount.current >= 2 || activeTouches.current.size > 1) {
              if (longPress.current) {
                window.clearTimeout(longPress.current)
                longPress.current = null
              }
              return
            }
            if (multiSelectModeRef.current) return
            if (longPress.current) window.clearTimeout(longPress.current)
            longPress.current = window.setTimeout(() => {
              setMultiSelectMode(true)
              multiSelectModeRef.current = true
              select(l.id, true)
              gesture.current = null
              longPress.current = null
              try {
                navigator.vibrate?.(40)
              } catch {}
            }, 450)
          }}
                  onPointerDownCapture={(e) => {
                    if (e.pointerType !== 'touch') return
                    if (activeTouches.current.size === 0 && !multiSelectModeRef.current) {
                      touchSelectionLock.current = gestureStartSelectionRef.current
                    }
                    activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
                    touchCount.current = activeTouches.current.size
                    if (activeTouches.current.size >= 2) {
                      pinchTouchSequence.current = true
                      e.preventDefault()
                      e.stopPropagation()
                    }
                  }}
                onPointerDown={(e) => startMove(e, l)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (longPress.current) {
                    window.clearTimeout(longPress.current)
                    longPress.current = null
                  }
                  if (!multiSelectModeRef.current) {
                    setMultiSelectMode(true)
                    multiSelectModeRef.current = true
                    select(l.id, true)
                    gesture.current = null
                    try {
                      navigator.vibrate?.(40)
                    } catch {}
                  }
                }}
                onClick={(e) => handleLayerClick(e, l)}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  if (l.locked) return
                  handleDoubleTap(l)
                }}
                data-testid={`layer-${l.id}`}
                data-layer-id={l.id}
                style={{
                  position: 'absolute',
                  left: !l.keyframes?.length && effectiveLayer.type === 'text' && effectiveLayer.align === 'center' && effectiveLayer.x === 0 && effectiveLayer.w === preset.w && !effectiveLayer.paddingLeft && !effectiveLayer.paddingRight && layerRefs.current.get(l.id)
                    ? (preset.w - layerRefs.current.get(l.id)!.offsetWidth) / 2
                    : effectiveLayer.x,
                  top: effectiveLayer.y,
                  width: effectiveLayer.type === 'text' ? 'max-content' : effectiveLayer.w,
                  height: effectiveLayer.type === 'text' && effectiveLayer.h !== preset.h ? 'auto' : effectiveLayer.h,
                  fontSize: effectiveLayer.type === 'text' ? effectiveLayer.fontSize : undefined,
                  lineHeight: effectiveLayer.type === 'text' ? 0.8 : undefined,
                  paddingTop: effectiveLayer.paddingTop ? `${effectiveLayer.paddingTop}px` : undefined,
                  paddingRight: effectiveLayer.paddingRight ? `${effectiveLayer.paddingRight}px` : undefined,
                  paddingBottom: effectiveLayer.paddingBottom ? `${effectiveLayer.paddingBottom}px` : undefined,
                  paddingLeft: effectiveLayer.paddingLeft ? `${effectiveLayer.paddingLeft}px` : undefined,
                  background: effectiveLayer.type === 'text' && effectiveLayer.fill ? effectiveLayer.fill : undefined,
                  borderRadius: effectiveLayer.type === 'shape'
                    ? (effectiveLayer.shape === 'circle' || effectiveLayer.shape === 'pill'
                        ? (effectiveLayer.radius !== undefined ? `${effectiveLayer.radius}px` : '9999px')
                        : (effectiveLayer.radius !== undefined ? `${effectiveLayer.radius}px` : undefined))
                    : (effectiveLayer.type === 'text' && effectiveLayer.radius ? `${effectiveLayer.radius}px` : undefined),
                  margin: 0,
                  boxSizing: 'border-box',
                  opacity: a.opacity,
                  transform: a.transform,
                  filter: a.filter,
                  backdropFilter: (effectiveLayer.blurType === 'backdrop' && effectiveLayer.blur && effectiveLayer.blur > 0)
                    ? `blur(${effectiveLayer.blur}px)`
                    : undefined,
                  WebkitBackdropFilter: (effectiveLayer.blurType === 'backdrop' && effectiveLayer.blur && effectiveLayer.blur > 0)
                    ? `blur(${effectiveLayer.blur}px)`
                    : undefined,
                  willChange: (a.filter !== 'none' || Boolean(effectiveLayer.blur)) ? 'filter, opacity' : undefined,
                  outline: 'none',
                  outlineOffset: 0,
                  cursor: l.locked
                    ? 'default'
                    : (imagePositioningId === l.id && l.type === 'image' ? 'grab' : 'move'),
                  pointerEvents: l.type === 'group' ? 'none' : 'auto',
                  touchAction: 'none',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                }}
              >
                {/* Crisp Vector Border on Selected Layer */}
                {isSel && !playing && l.type !== 'group' && !(vectorEditingId === l.id && l.type === 'path') && (
                  <svg
                    data-testid={`layer-vector-border-${l.id}`}
                    className="pointer-events-none absolute inset-0 overflow-visible"
                    style={{ zIndex: 60, width: '100%', height: '100%' }}
                  >
                    <rect
                      x={0}
                      y={0}
                      width="100%"
                      height="100%"
                      rx={effectiveLayer.type === 'shape'
                        ? (effectiveLayer.shape === 'circle' || effectiveLayer.shape === 'pill'
                            ? (effectiveLayer.radius !== undefined ? effectiveLayer.radius : 9999)
                            : (effectiveLayer.radius || 0))
                        : (effectiveLayer.type === 'text' && effectiveLayer.radius ? effectiveLayer.radius : 0)}
                      fill="none"
                      stroke={imagePositioningId === l.id && l.type === 'image'
                        ? '#38bdf8'
                        : ((multiSelectMode || selectedIds.length > 1) && !pinchActive ? '#4B1D6B' : '#007AFF')}
                      strokeWidth={1.5 / eff}
                      shapeRendering="geometricPrecision"
                    />
                  </svg>
                )}
                <LayerContent
                  layer={effectiveLayer}
                  editing={editingId === l.id}
                  isVectorEditing={vectorEditingId === l.id && l.type === 'path'}
                  eff={eff}
                  onEdit={(t) => updateLayer(l.id, { text: t })}
                  onEndEdit={() => setEditingId(null)}
                />
              </div>
            )
          })}

          {/* Selection handles overlay — rendered above all layers so they are never occluded */}
          {(() => {
            if (playing) return null
            const allTargetIds = new Set<string>()
            for (const id of selectedIds) {
              allTargetIds.add(id)
              const desc = getDescendantLayers(id, project.layers)
              for (const d of desc) allTargetIds.add(d.id)
            }
            if (selectedId) {
              allTargetIds.add(selectedId)
              const desc = getDescendantLayers(selectedId, project.layers)
              for (const d of desc) allTargetIds.add(d.id)
            }

            // For measuring the bounds, use all visible content layers (non-group)
            let selected = project.layers.filter(
              (layer) => allTargetIds.has(layer.id) && layer.visible && !layer.locked && layer.type !== 'group'
            )
            const sel = project.layers.find((l) => l.id === selectedId)
            if (!sel || editingId || sel.locked || !sel.visible) return null
            if (selected.length === 0) selected = [sel]

            const isGroup = selected.length > 1 || multiSelectMode || sel.type === 'group'
            const measured = (layer: Layer) => {
              const effLayer = layer.keyframes && layer.keyframes.length > 0 ? interpolateKeyframes(layer, time) : layer
              const node = layerRefs.current.get(effLayer.id)
              const isText = effLayer.type === 'text'
              const textW = (isText && node ? node.offsetWidth : 0) || effLayer.w
              const posX = !effLayer.keyframes?.length && isText && effLayer.align === 'center' && effLayer.x === 0 && effLayer.w === preset.w
                ? (preset.w - textW) / 2
                : effLayer.x
              const textH = (isText && node ? node.offsetHeight : 0) || (isText && effLayer.id === selectedId ? selH : 0) || effLayer.h
              return {
                x: posX,
                y: effLayer.y,
                w: isText ? textW : effLayer.w,
                h: isText ? textH : effLayer.h,
              }
            }
            let bounds = selected.reduce(
              (box, layer) => {
                const rect = measured(layer)
                return {
                  left: Math.min(box.left, rect.x),
                  top: Math.min(box.top, rect.y),
                  right: Math.max(box.right, rect.x + rect.w),
                  bottom: Math.max(box.bottom, rect.y + rect.h),
                }
              },
              { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
            )
            const hasBgShape = selected.some((l) => l.type === 'shape')
            if (isGroup && !hasBgShape && (sel.paddingLeft || sel.paddingRight || sel.paddingTop || sel.paddingBottom)) {
              bounds = {
                left: bounds.left - (sel.paddingLeft || 0),
                top: bounds.top - (sel.paddingTop || 0),
                right: bounds.right + (sel.paddingRight || 0),
                bottom: bounds.bottom + (sel.paddingBottom || 0),
              }
            }
            const boxW = Math.max(20, bounds.right - bounds.left)
            const boxH = Math.max(20, bounds.bottom - bounds.top)
            const size = hs * 3.8
            const dot = hs * 1.5
            const corners: { c: ResizeHandle; cx: number; cy: number }[] = [
              { c: 'tl', cx: 0, cy: 0 },
              { c: 'tr', cx: boxW, cy: 0 },
              { c: 'bl', cx: 0, cy: boxH },
              { c: 'br', cx: boxW, cy: boxH },
            ]
            const sideHandles: { h: ResizeHandle; cx: number; cy: number; cursor: string }[] = [
              { h: 't', cx: boxW / 2, cy: 0, cursor: 'ns-resize' },
              { h: 'r', cx: boxW, cy: boxH / 2, cursor: 'ew-resize' },
              { h: 'b', cx: boxW / 2, cy: boxH, cursor: 'ns-resize' },
              { h: 'l', cx: 0, cy: boxH / 2, cursor: 'ew-resize' },
            ]
            const showSideHandles = !sel.isComponent || editingComponentId === sel.id
            const groupItems = (isGroup && sel.type === 'group' && !selected.some((l) => l.id === sel.id))
              ? [...selected, sel]
              : selected
            const group = isGroup ? groupItems.map((layer) => {
              const rect = measured(layer)
              return {
                id: layer.id,
                x: rect.x,
                y: rect.y,
                w: rect.w,
                h: rect.h,
                fontSize: layer.type === 'text' ? layer.fontSize : undefined,
                crop0: layer.type === 'image' && layer.crop ? { ...layer.crop } : undefined,
                isCroppedImage: layer.type === 'image' && Boolean(layer.crop),
                origPoints: layer.type === 'path' && layer.points ? JSON.parse(JSON.stringify(layer.points)) : undefined,
              }
            }) : undefined
            const isImagePositioning = Boolean(imagePositioningId && imagePositioningId === sel.id && sel.type === 'image')
            const isVectorEditing = Boolean(vectorEditingId && vectorEditingId === sel.id && sel.type === 'path')
            const effSel = (sel.keyframes && sel.keyframes.length > 0)
              ? interpolateKeyframes(sel, time)
              : sel
            const isSingleGroup = selected.length === 1 && sel.type === 'group'
            const groupKfDx = (isSingleGroup && sel.keyframes?.length) ? effSel.x - sel.x : 0
            const groupKfDy = (isSingleGroup && sel.keyframes?.length) ? effSel.y - sel.y : 0
            const boxRot = (selected.length === 1 && !isGroup && effSel.rotation)
              ? effSel.rotation
              : (isSingleGroup && effSel.rotation)
                ? effSel.rotation
                : undefined

            return (
              <div
                style={{
                  position: 'absolute',
                  left: isVectorEditing ? effSel.x : bounds.left + groupKfDx,
                  top: isVectorEditing ? effSel.y : bounds.top + groupKfDy,
                  width: isVectorEditing ? effSel.w : boxW,
                  height: isVectorEditing ? effSel.h : boxH,
                  transform: boxRot
                    ? `rotate(${boxRot}deg)`
                    : (rotationSnap?.active && rotationSnap.deltaAngle)
                      ? `rotate(${rotationSnap.deltaAngle}deg)`
                      : undefined,
                  transformOrigin: '50% 50%',
                  border: 'none',
                  pointerEvents: 'none',
                  zIndex: isVectorEditing ? 100 : 60,
                  boxSizing: 'border-box',
                }}
              >
                {/* Crisp Vector Selection Frame Border */}
                {!isVectorEditing && ((isGroup || multiSelectMode) || isImagePositioning) && (
                  <svg
                    data-testid="selection-vector-border"
                    className="pointer-events-none absolute inset-0 overflow-visible"
                    style={{ width: '100%', height: '100%', zIndex: 1 }}
                  >
                    <rect
                      x={0}
                      y={0}
                      width={boxW}
                      height={boxH}
                      fill="none"
                      stroke={
                        isImagePositioning
                          ? '#38bdf8'
                          : (sel.isComponent ? '#9333ea' : '#4f46e5')
                      }
                      strokeWidth={1.5 / eff}
                      shapeRendering="geometricPrecision"
                    />
                  </svg>
                )}

                {isImagePositioning && (
                  <div
                    data-testid="image-manual-position-badge"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: -36 / eff,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: '#090d16',
                      color: '#ffffff',
                      fontSize: Math.max(11, 12 / eff),
                      fontWeight: 600,
                      padding: `${3 / eff}px ${10 / eff}px`,
                      borderRadius: 9999,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8 / eff,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'auto',
                      border: '1px solid rgba(255,255,255,0.2)',
                      zIndex: 90,
                    }}
                  >
                    <Move style={{ width: 14 / eff, height: 14 / eff, color: '#38bdf8' }} />
                    <span>Drag image to adjust</span>
                    <button
                      type="button"
                      data-testid="image-manual-position-done-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setImagePositioningId(null)
                      }}
                      style={{
                        marginLeft: 4 / eff,
                        backgroundColor: '#2563eb',
                        color: '#fff',
                        padding: `${2 / eff}px ${10 / eff}px`,
                        borderRadius: 9999,
                        fontSize: Math.max(10, 11 / eff),
                        cursor: 'pointer',
                        border: 'none',
                        fontWeight: 600,
                      }}
                    >
                      Done
                    </button>
                  </div>
                )}
                {isImagePositioning && (
                  <div
                    data-testid="image-manual-position-grid"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      border: `${2 / eff}px dashed #38bdf8`,
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ position: 'absolute', left: '33.333%', top: 0, bottom: 0, width: 1 / eff, backgroundColor: 'rgba(255,255,255,0.4)' }} />
                    <div style={{ position: 'absolute', left: '66.666%', top: 0, bottom: 0, width: 1 / eff, backgroundColor: 'rgba(255,255,255,0.4)' }} />
                    <div style={{ position: 'absolute', top: '33.333%', left: 0, right: 0, height: 1 / eff, backgroundColor: 'rgba(255,255,255,0.4)' }} />
                    <div style={{ position: 'absolute', top: '66.666%', left: 0, right: 0, height: 1 / eff, backgroundColor: 'rgba(255,255,255,0.4)' }} />
                  </div>
                )}
                {(sel.type === 'group' || sel.isComponent) && (
                  <div
                    data-testid="group-header-badge"
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      startMove(e, sel)
                    }}
                    onClick={(e) => handleLayerClick(e, sel)}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      if (sel.locked) return
                      handleDoubleTap(sel)
                    }}
                    style={{
                      position: 'absolute',
                      top: -24 / eff,
                      left: 0,
                      backgroundColor: sel.isComponent ? '#9333ea' : '#4f46e5',
                      color: 'white',
                      fontSize: Math.max(10, 11 / eff),
                      fontWeight: 700,
                      padding: `${2 / eff}px ${8 / eff}px`,
                      borderRadius: 4 / eff,
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6 / eff,
                      cursor: 'move',
                      pointerEvents: 'auto',
                      touchAction: 'none',
                      userSelect: 'none',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }}
                  >
                    <span>{sel.isComponent ? (editingComponentId === sel.id ? '❖ Editing Component' : '❖ Component') : '📁 Group'}: {sel.name}</span>
                    {sel.isComponent && (
                      <button
                        type="button"
                        data-testid={editingComponentId === sel.id ? 'component-done-btn' : 'component-edit-btn'}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingComponentId((prev) => (prev === sel.id ? null : sel.id))
                        }}
                        style={{
                          marginLeft: 4 / eff,
                          padding: `${1 / eff}px ${6 / eff}px`,
                          background: editingComponentId === sel.id ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.2)',
                          borderRadius: 3 / eff,
                          fontSize: Math.max(9, 9 / eff),
                          fontWeight: 600,
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {editingComponentId === sel.id ? 'Done' : 'Tap to edit'}
                      </button>
                    )}
                  </div>
                )}
                {!isImagePositioning && !isVectorEditing && corners.map(({ c, cx, cy }) => (
                  <div
                    key={c}
                    data-testid={`resize-${c}-${isGroup ? 'group' : sel.id}`}
                    onPointerDown={(e) => startResize(e, sel, c, boxW, boxH, bounds.left, bounds.top, group)}
                    style={{
                      position: 'absolute',
                      left: cx - size / 2,
                      top: cy - size / 2,
                      width: size,
                      height: size,
                      display: 'grid',
                      placeItems: 'center',
                      pointerEvents: 'auto',
                      cursor: c === 'tl' || c === 'br' ? 'nwse-resize' : 'nesw-resize',
                      touchAction: 'none',
                    }}
                  >
                    {/* Vector Resize Handle */}
                    <svg
                      width={dot + 4 / eff}
                      height={dot + 4 / eff}
                      viewBox={`0 0 ${dot + 4 / eff} ${dot + 4 / eff}`}
                      className="pointer-events-none overflow-visible"
                    >
                      <circle
                        cx={(dot + 4 / eff) / 2}
                        cy={(dot + 4 / eff) / 2}
                        r={dot / 2}
                        fill="#ffffff"
                        stroke={multiSelectMode || isGroup ? (sel.isComponent ? '#9333ea' : '#4f46e5') : '#007AFF'}
                        strokeWidth={1.5 / eff}
                        shapeRendering="geometricPrecision"
                      />
                    </svg>
                  </div>
                ))}
                {!isImagePositioning && !isVectorEditing && showSideHandles && sideHandles.map(({ h, cx, cy, cursor }) => (
                  <div
                    key={h}
                    data-testid={`resize-${h}-${isGroup ? 'group' : sel.id}`}
                    onPointerDown={(e) => startResize(e, sel, h, boxW, boxH, bounds.left, bounds.top, group)}
                    style={{
                      position: 'absolute',
                      left: cx - size / 2,
                      top: cy - size / 2,
                      width: size,
                      height: size,
                      display: 'grid',
                      placeItems: 'center',
                      pointerEvents: 'auto',
                      cursor,
                      touchAction: 'none',
                    }}
                  >
                    {/* Vector Side Handle */}
                    <svg
                      width={dot + 4 / eff}
                      height={dot + 4 / eff}
                      viewBox={`0 0 ${dot + 4 / eff} ${dot + 4 / eff}`}
                      className="pointer-events-none overflow-visible"
                    >
                      <rect
                        x={2 / eff}
                        y={2 / eff}
                        width={dot}
                        height={dot}
                        rx={dot / 2}
                        fill="#ffffff"
                        stroke={multiSelectMode || isGroup ? (sel.isComponent ? '#9333ea' : '#4f46e5') : '#007AFF'}
                        strokeWidth={1.5 / eff}
                        shapeRendering="geometricPrecision"
                      />
                    </svg>
                  </div>
                ))}

                {/* ON-CANVAS VECTOR ANCHOR POINTS & BÉZIER CONTROLS */}
                {isVectorEditing && sel.points && sel.points.length > 0 && !multiSelectMode && (() => {
                  const isAnimated = Boolean(sel.keyframes && sel.keyframes.length > 0)
                  const effSel = isAnimated ? interpolateKeyframes(sel, time) : sel
                  const pts = effSel.points || sel.points!
                  return (
                    <div
                      data-testid="vector-canvas-points-overlay"
                      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 70 }}
                    >
                      {pts.map((pt, pIdx) => {
                        const isAnchorSelected = selectedAnchorIndices.includes(pIdx)
                        const pRadius = 5.5 / eff
                        const cRadius = 4.5 / eff
                        const hitRadius = Math.max(pRadius, 14 / eff)
                        const cHitRadius = Math.max(cRadius, 12 / eff)

                        const handlePointDrag = (e: React.PointerEvent) => {
                          e.stopPropagation()
                          e.preventDefault()

                          setVectorAlign(null)

                          if (anchorHoldTimer.current) {
                            window.clearTimeout(anchorHoldTimer.current)
                            anchorHoldTimer.current = null
                          }
                          anchorHoldTriggered.current = false
                          lastAnchorGestureMoved.current = false
                          setHoldingAnchorIdx(pIdx)

                          // Holding down on any anchor point triggers multi-select mode
                          anchorHoldTimer.current = window.setTimeout(() => {
                            anchorHoldTriggered.current = true
                            anchorHoldTimer.current = null
                            setHoldingAnchorIdx(null)
                            setAnchorMultiSelectMode(true)
                            anchorMultiSelectModeRef.current = true

                            // Ensure the held anchor point is in the multi-selection
                            const curr = selectedAnchorIndicesRef.current
                            if (!curr.includes(pIdx)) {
                              setSelectedAnchors([...curr, pIdx])
                            }
                            try {
                              navigator.vibrate?.(45)
                            } catch {}
                            if (gesture.current && gesture.current.mode === 'vector-anchor') {
                              gesture.current.moved = false
                            }
                          }, 400)

                          const target = e.currentTarget as HTMLElement
                          target.setPointerCapture?.(e.pointerId)

                          const isMulti = anchorMultiSelectModeRef.current || e.shiftKey
                          const currentIndices = selectedAnchorIndicesRef.current
                          let activeSelected: number[]
                          if (currentIndices.includes(pIdx)) {
                            activeSelected = currentIndices.length > 0 ? [...currentIndices] : [pIdx]
                          } else {
                            activeSelected = isMulti ? [...currentIndices, pIdx] : [pIdx]
                          }

                          const startPoints = pts.map((p) => ({
                            ...p,
                            cp1: p.cp1 ? { ...p.cp1 } : undefined,
                            cp2: p.cp2 ? { ...p.cp2 } : undefined,
                          }))

                          gesture.current = {
                            id: sel.id,
                            mode: 'vector-anchor',
                            sx: e.clientX,
                            sy: e.clientY,
                            startPoints,
                            activeSelected: [...activeSelected],
                            snapAnchorIdx: pIdx,
                            layerW: effSel.w,
                            layerH: effSel.h,
                            rotation: effSel.rotation || 0,
                            moved: false,
                            deselectOnTap: false,
                          }
                        }

                        const handleCpDrag = (cpKey: 'cp1' | 'cp2', e: React.PointerEvent) => {
                          e.stopPropagation()
                          e.preventDefault()
                          const target = e.currentTarget as HTMLElement
                          target.setPointerCapture?.(e.pointerId)
                          const origPoint = { ...pts[pIdx] }
                          const origCp = pts[pIdx][cpKey] || { x: pt.x, y: pt.y }
                          const startX = e.clientX
                          const startY = e.clientY

                          const onPointerMove = (ev: PointerEvent) => {
                            const dx = (ev.clientX - startX) / (scale * view.scale)
                            const dy = (ev.clientY - startY) / (scale * view.scale)
                            let newCpX = Math.round(origCp.x + dx)
                            let newCpY = Math.round(origCp.y + dy)

                            if (vectorSnap) {
                              const snapped = snapVectorHandle(newCpX, newCpY, pt.x, pt.y)
                              newCpX = snapped.x
                              newCpY = snapped.y
                            }

                            const handlePatch = updateHandleWithMode(origPoint, cpKey, { x: newCpX, y: newCpY })
                            const updated = [...pts]
                            updated[pIdx] = {
                              ...pts[pIdx],
                              ...handlePatch,
                            }
                            updateLayer(sel.id, { points: updated })
                          }

                          const onPointerUp = () => {
                            window.removeEventListener('pointermove', onPointerMove)
                            window.removeEventListener('pointerup', onPointerUp)
                            setVectorAlign(null)
                            const current = layersRef.current.find((cand) => cand.id === sel.id)
                            if (current && current.type === 'path' && current.points) {
                              const isAnim = Boolean(current.keyframes && current.keyframes.length > 0)
                              if (!isAnim) {
                                const tight = tightenVectorLayer(current)
                                updateLayer(sel.id, tight)
                              }
                            }
                          }

                          window.addEventListener('pointermove', onPointerMove)
                          window.addEventListener('pointerup', onPointerUp)
                        }

                      return (
                        <div key={`vpt-group-${pIdx}`}>
                          {/* Vector Bézier Handle Lines */}
                          {pt.cp1 && (
                            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
                              <line
                                x1={pt.x}
                                y1={pt.y}
                                x2={pt.cp1.x}
                                y2={pt.cp1.y}
                                stroke="#ec4899"
                                strokeWidth={1.5 / eff}
                                strokeDasharray={`${3 / eff} ${3 / eff}`}
                                shapeRendering="geometricPrecision"
                              />
                            </svg>
                          )}
                          {pt.cp2 && (
                            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
                              <line
                                x1={pt.x}
                                y1={pt.y}
                                x2={pt.cp2.x}
                                y2={pt.cp2.y}
                                stroke="#ec4899"
                                strokeWidth={1.5 / eff}
                                strokeDasharray={`${3 / eff} ${3 / eff}`}
                                shapeRendering="geometricPrecision"
                              />
                            </svg>
                          )}

                          {/* Control Handle 1 Vector Pip */}
                          {pt.cp1 && (
                            <div
                              data-testid={`vector-cp1-${pIdx}`}
                              onPointerDown={(e) => handleCpDrag('cp1', e)}
                              style={{
                                position: 'absolute',
                                left: pt.cp1.x - cHitRadius,
                                top: pt.cp1.y - cHitRadius,
                                width: cHitRadius * 2,
                                height: cHitRadius * 2,
                                display: 'grid',
                                placeItems: 'center',
                                cursor: 'crosshair',
                                pointerEvents: 'auto',
                                touchAction: 'none',
                                zIndex: 72,
                              }}
                              title={`Control Point 1 (${Math.round(pt.cp1.x)}, ${Math.round(pt.cp1.y)})`}
                            >
                              <svg
                                width={cRadius * 2}
                                height={cRadius * 2}
                                viewBox={`0 0 ${cRadius * 2} ${cRadius * 2}`}
                                className="pointer-events-none overflow-visible"
                              >
                                <circle
                                  cx={cRadius}
                                  cy={cRadius}
                                  r={Math.max(1 / eff, cRadius - 1 / eff)}
                                  fill="#ec4899"
                                  stroke="#ffffff"
                                  strokeWidth={1.5 / eff}
                                  shapeRendering="geometricPrecision"
                                />
                              </svg>
                            </div>
                          )}

                          {/* Control Handle 2 Vector Pip */}
                          {pt.cp2 && (
                            <div
                              data-testid={`vector-cp2-${pIdx}`}
                              onPointerDown={(e) => handleCpDrag('cp2', e)}
                              style={{
                                position: 'absolute',
                                left: pt.cp2.x - cHitRadius,
                                top: pt.cp2.y - cHitRadius,
                                width: cHitRadius * 2,
                                height: cHitRadius * 2,
                                display: 'grid',
                                placeItems: 'center',
                                cursor: 'crosshair',
                                pointerEvents: 'auto',
                                touchAction: 'none',
                                zIndex: 72,
                              }}
                              title={`Control Point 2 (${Math.round(pt.cp2.x)}, ${Math.round(pt.cp2.y)})`}
                            >
                              <svg
                                width={cRadius * 2}
                                height={cRadius * 2}
                                viewBox={`0 0 ${cRadius * 2} ${cRadius * 2}`}
                                className="pointer-events-none overflow-visible"
                              >
                                <circle
                                  cx={cRadius}
                                  cy={cRadius}
                                  r={Math.max(1 / eff, cRadius - 1 / eff)}
                                  fill="#ec4899"
                                  stroke="#ffffff"
                                  strokeWidth={1.5 / eff}
                                  shapeRendering="geometricPrecision"
                                />
                              </svg>
                            </div>
                          )}

                          {/* Main Anchor Point Handle (Vector Shape) */}
                          <div
                            data-testid={`vector-anchor-${pIdx}`}
                            onPointerDown={handlePointDrag}
                            onPointerUp={(e) => {
                              try {
                                (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
                              } catch {}
                              if (anchorHoldTimer.current) {
                                window.clearTimeout(anchorHoldTimer.current)
                                anchorHoldTimer.current = null
                                setHoldingAnchorIdx(null)
                              }
                              setVectorAlign(null)
                            }}
                            onPointerCancel={(e) => {
                              try {
                                (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
                              } catch {}
                              if (anchorHoldTimer.current) {
                                window.clearTimeout(anchorHoldTimer.current)
                                anchorHoldTimer.current = null
                                setHoldingAnchorIdx(null)
                              }
                              setVectorAlign(null)
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (lastAnchorGestureMoved.current) {
                                lastAnchorGestureMoved.current = false
                                return
                              }
                              if (anchorHoldTriggered.current) {
                                anchorHoldTriggered.current = false
                                return
                              }
                              if (anchorMultiSelectModeRef.current || e.shiftKey) {
                                toggleSelectedAnchor(pIdx)
                              } else {
                                setSelectedAnchors([pIdx])
                              }
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              const hasCp = pt.cp1 !== undefined || pt.cp2 !== undefined
                              const updated = [...pts]
                              const { prevPt, nextPt } = getAdjacentVectorPoints(pts, pIdx, sel.closed !== false)
                              updated[pIdx] = switchPointBezierMode(pt, hasCp ? 1 : 2, prevPt, nextPt)
                              const isAnim = Boolean(sel.keyframes && sel.keyframes.length > 0)
                              if (isAnim) {
                                updateLayer(sel.id, { points: updated })
                              } else {
                                const tight = tightenVectorLayer({ ...sel, points: updated })
                                updateLayer(sel.id, tight)
                              }
                            }}
                            style={{
                              position: 'absolute',
                              left: pt.x - hitRadius,
                              top: pt.y - hitRadius,
                              width: hitRadius * 2,
                              height: hitRadius * 2,
                              display: 'grid',
                              placeItems: 'center',
                              cursor: isAnchorSelected ? 'grab' : (anchorMultiSelectMode ? 'pointer' : 'grab'),
                              pointerEvents: 'auto',
                              touchAction: 'none',
                              zIndex: 75,
                            }}
                            title={
                              anchorMultiSelectMode
                                ? `Anchor ${pIdx + 1}: ${isAnchorSelected ? 'Selected (Tap to remove)' : 'Tap to add to selection'}`
                                : `Anchor ${pIdx + 1}: (${Math.round(pt.x)}, ${Math.round(pt.y)}). Hold to multi-select.`
                            }
                          >
                            <svg
                              width={pRadius * 2}
                              height={pRadius * 2}
                              viewBox={`0 0 ${pRadius * 2} ${pRadius * 2}`}
                              className="pointer-events-none overflow-visible"
                            >
                              {/* Pulse ring when user is holding down this anchor */}
                              {holdingAnchorIdx === pIdx && (
                                <circle
                                  cx={pRadius}
                                  cy={pRadius}
                                  r={pRadius + 3.5 / eff}
                                  fill="none"
                                  stroke="#3b82f6"
                                  strokeWidth={2 / eff}
                                  className="animate-pulse"
                                />
                              )}
                              {/* Multi-select halo for selected anchors in multi-select mode */}
                              {anchorMultiSelectMode && isAnchorSelected && (
                                <circle
                                  cx={pRadius}
                                  cy={pRadius}
                                  r={pRadius + 2.5 / eff}
                                  fill="none"
                                  stroke="#2563eb"
                                  strokeWidth={1.5 / eff}
                                  strokeDasharray={`${3 / eff} ${2 / eff}`}
                                />
                              )}
                              {/* Anchor point circle: thin border matching fill (#007AFF) when selected, filled white with thin border when inactive */}
                              <circle
                                cx={pRadius}
                                cy={pRadius}
                                r={pRadius}
                                fill={isAnchorSelected ? '#007AFF' : '#ffffff'}
                                stroke={isAnchorSelected ? '#007AFF' : (anchorMultiSelectMode ? '#3b82f6' : '#007AFF')}
                                strokeWidth={(isAnchorSelected ? 1.5 : (anchorMultiSelectMode ? 1.5 : 1)) / eff}
                                shapeRendering="geometricPrecision"
                              />
                              {/* Inner white dot when selected in multi-select mode */}
                              {anchorMultiSelectMode && isAnchorSelected && (
                                <circle
                                  cx={pRadius}
                                  cy={pRadius}
                                  r={Math.max(1.2, pRadius * 0.4)}
                                  fill="#ffffff"
                                />
                              )}
                            </svg>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  )
                })()}

                {/* VECTOR ALIGNMENT SMART GUIDES */}
                {isVectorEditing && vectorAlign && vectorAlign.layerId === sel.id && (vectorAlign.xMatches.length > 0 || vectorAlign.yMatches.length > 0) && (
                  <div
                    data-testid="vector-align-guides"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      zIndex: 100,
                      overflow: 'visible',
                      transform: 'translateZ(0)',
                      WebkitTransform: 'translateZ(0)',
                    }}
                  >
                    {/* Vertical Alignment Lines (X Matches) */}
                    {vectorAlign.xMatches.map((m, idx) => {
                      const strokeColor = '#7e22ce'
                      const pipR = Math.max(2, 2.5 / eff)
                      const lineH = Math.max(1, m.endCoord - m.startCoord)

                      return (
                        <div
                          key={`vector-align-x-${idx}`}
                          data-testid={`vector-align-guide-x-${idx}`}
                          data-align-type={m.targetType}
                          data-coord={m.coord}
                          style={{
                            position: 'absolute',
                            left: m.coord,
                            top: m.startCoord,
                            width: 1,
                            height: lineH,
                            transform: 'translateX(-50%) translateZ(0)',
                            WebkitTransform: 'translateX(-50%) translateZ(0)',
                            overflow: 'visible',
                            pointerEvents: 'none',
                            zIndex: 100,
                          }}
                        >
                          <svg
                            className="absolute inset-0 overflow-visible pointer-events-none"
                            style={{ width: '100%', height: '100%' }}
                          >
                            <line
                              data-testid="vector-align-line-x"
                              x1="50%"
                              y1={0}
                              x2="50%"
                              y2={lineH}
                              stroke={strokeColor}
                              strokeWidth={Math.max(0.6, 0.75 / eff)}
                              shapeRendering="geometricPrecision"
                            />
                            {m.targetPoints?.map((pt, pIdx) => (
                              <circle
                                key={`x-pip-${pIdx}`}
                                cx="50%"
                                cy={pt.y - m.startCoord}
                                r={pipR}
                                fill={strokeColor}
                                stroke="#ffffff"
                                strokeWidth={0.75 / eff}
                                shapeRendering="geometricPrecision"
                              />
                            ))}
                          </svg>
                        </div>
                      )
                    })}

                    {/* Horizontal Alignment Lines (Y Matches) */}
                    {vectorAlign.yMatches.map((m, idx) => {
                      const strokeColor = '#7e22ce'
                      const pipR = Math.max(2, 2.5 / eff)
                      const lineW = Math.max(1, m.endCoord - m.startCoord)

                      return (
                        <div
                          key={`vector-align-y-${idx}`}
                          data-testid={`vector-align-guide-y-${idx}`}
                          data-align-type={m.targetType}
                          data-coord={m.coord}
                          style={{
                            position: 'absolute',
                            left: m.startCoord,
                            top: m.coord,
                            width: lineW,
                            height: 1,
                            transform: 'translateY(-50%) translateZ(0)',
                            WebkitTransform: 'translateY(-50%) translateZ(0)',
                            overflow: 'visible',
                            pointerEvents: 'none',
                            zIndex: 100,
                          }}
                        >
                          <svg
                            className="absolute inset-0 overflow-visible pointer-events-none"
                            style={{ width: '100%', height: '100%' }}
                          >
                            <line
                              data-testid="vector-align-line-y"
                              x1={0}
                              y1="50%"
                              x2={lineW}
                              y2="50%"
                              stroke={strokeColor}
                              strokeWidth={Math.max(0.6, 0.75 / eff)}
                              shapeRendering="geometricPrecision"
                            />
                            {m.targetPoints?.map((pt, pIdx) => (
                              <circle
                                key={`y-pip-${pIdx}`}
                                cx={pt.x - m.startCoord}
                                cy="50%"
                                r={pipR}
                                fill={strokeColor}
                                stroke="#ffffff"
                                strokeWidth={0.75 / eff}
                                shapeRendering="geometricPrecision"
                              />
                            ))}
                          </svg>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          {/* SIZE MATCH GUIDES & INDICATOR */}
          {sizeMatch && (sizeMatch.widthMatch || sizeMatch.heightMatch) && (
            <>
              {/* Width match indicator lines & dimension labels */}
              {sizeMatch.widthMatch && (
                <div
                  data-testid="size-match-guide-width"
                  data-dimension-width={sizeMatch.widthMatch.size}
                  data-matched-target-id={sizeMatch.widthMatch.targetBox.id}
                  className="pointer-events-none"
                >
                  {/* Dimension line on resizing element */}
                  <div
                    style={{
                      position: 'absolute',
                      left: sizeMatch.widthMatch.resizingBox.x,
                      top: sizeMatch.widthMatch.resizingBox.y + sizeMatch.widthMatch.resizingBox.h + 8 / (scale * view.scale),
                      width: sizeMatch.widthMatch.resizingBox.w,
                      height: 12 / (scale * view.scale),
                      zIndex: 75,
                      transform: 'translateY(-50%)',
                    }}
                  >
                    <svg
                      className="absolute inset-0 overflow-visible pointer-events-none"
                      style={{ width: '100%', height: '100%' }}
                    >
                      <line
                        x1={0}
                        y1="50%"
                        x2={sizeMatch.widthMatch.resizingBox.w}
                        y2="50%"
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                      <line
                        x1={0}
                        y1={0}
                        x2={0}
                        y2="100%"
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                      <line
                        x1={sizeMatch.widthMatch.resizingBox.w}
                        y1={0}
                        x2={sizeMatch.widthMatch.resizingBox.w}
                        y2="100%"
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: '#ec4899',
                        color: '#fff',
                        fontSize: Math.max(9, 10 / (scale * view.scale)),
                        lineHeight: 1,
                        padding: `${2 / (scale * view.scale)}px ${5 / (scale * view.scale)}px`,
                        borderRadius: 3 / (scale * view.scale),
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }}
                    >
                      {Math.round(sizeMatch.widthMatch.size)} px
                    </div>
                  </div>

                  {/* Dimension line on matched target element */}
                  <div
                    style={{
                      position: 'absolute',
                      left: sizeMatch.widthMatch.targetBox.x,
                      top: sizeMatch.widthMatch.targetBox.type === 'artboard' && sizeMatch.widthMatch.resizingBox.y + sizeMatch.widthMatch.resizingBox.h > preset.h - 35
                        ? -12 / (scale * view.scale)
                        : sizeMatch.widthMatch.targetBox.y + sizeMatch.widthMatch.targetBox.h + 8 / (scale * view.scale),
                      width: sizeMatch.widthMatch.targetBox.w,
                      height: 12 / (scale * view.scale),
                      zIndex: 75,
                      transform: 'translateY(-50%)',
                    }}
                  >
                    <svg
                      className="absolute inset-0 overflow-visible pointer-events-none"
                      style={{ width: '100%', height: '100%' }}
                    >
                      <line
                        x1={0}
                        y1="50%"
                        x2={sizeMatch.widthMatch.targetBox.w}
                        y2="50%"
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                      <line
                        x1={0}
                        y1={0}
                        x2={0}
                        y2="100%"
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                      <line
                        x1={sizeMatch.widthMatch.targetBox.w}
                        y1={0}
                        x2={sizeMatch.widthMatch.targetBox.w}
                        y2="100%"
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: '#ec4899',
                        color: '#fff',
                        fontSize: Math.max(9, 10 / (scale * view.scale)),
                        lineHeight: 1,
                        padding: `${2 / (scale * view.scale)}px ${5 / (scale * view.scale)}px`,
                        borderRadius: 3 / (scale * view.scale),
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }}
                    >
                      {Math.round(sizeMatch.widthMatch.size)} px
                    </div>
                  </div>
                </div>
              )}

              {/* Height match indicator lines & dimension labels */}
              {sizeMatch.heightMatch && (
                <div
                  data-testid="size-match-guide-height"
                  data-dimension-height={sizeMatch.heightMatch.size}
                  data-matched-target-id={sizeMatch.heightMatch.targetBox.id}
                  className="pointer-events-none"
                >
                  {/* Dimension line on resizing element */}
                  <div
                    style={{
                      position: 'absolute',
                      left: sizeMatch.heightMatch.resizingBox.x + sizeMatch.heightMatch.resizingBox.w + 8 / (scale * view.scale),
                      top: sizeMatch.heightMatch.resizingBox.y,
                      width: 12 / (scale * view.scale),
                      height: sizeMatch.heightMatch.resizingBox.h,
                      zIndex: 75,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <svg
                      className="absolute inset-0 overflow-visible pointer-events-none"
                      style={{ width: '100%', height: '100%' }}
                    >
                      <line
                        x1="50%"
                        y1={0}
                        x2="50%"
                        y2={sizeMatch.heightMatch.resizingBox.h}
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                      <line
                        x1={0}
                        y1={0}
                        x2="100%"
                        y2={0}
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                      <line
                        x1={0}
                        y1={sizeMatch.heightMatch.resizingBox.h}
                        x2="100%"
                        y2={sizeMatch.heightMatch.resizingBox.h}
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: '#ec4899',
                        color: '#fff',
                        fontSize: Math.max(9, 10 / (scale * view.scale)),
                        lineHeight: 1,
                        padding: `${2 / (scale * view.scale)}px ${5 / (scale * view.scale)}px`,
                        borderRadius: 3 / (scale * view.scale),
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }}
                    >
                      {Math.round(sizeMatch.heightMatch.size)} px
                    </div>
                  </div>

                  {/* Dimension line on matched target element */}
                  <div
                    style={{
                      position: 'absolute',
                      left: sizeMatch.heightMatch.targetBox.type === 'artboard' && sizeMatch.heightMatch.resizingBox.x + sizeMatch.heightMatch.resizingBox.w > preset.w - 35
                        ? -12 / (scale * view.scale)
                        : sizeMatch.heightMatch.targetBox.x + sizeMatch.heightMatch.targetBox.w + 8 / (scale * view.scale),
                      top: sizeMatch.heightMatch.targetBox.y,
                      width: 12 / (scale * view.scale),
                      height: sizeMatch.heightMatch.targetBox.h,
                      zIndex: 75,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <svg
                      className="absolute inset-0 overflow-visible pointer-events-none"
                      style={{ width: '100%', height: '100%' }}
                    >
                      <line
                        x1="50%"
                        y1={0}
                        x2="50%"
                        y2={sizeMatch.heightMatch.targetBox.h}
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                      <line
                        x1={0}
                        y1={0}
                        x2="100%"
                        y2={0}
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                      <line
                        x1={0}
                        y1={sizeMatch.heightMatch.targetBox.h}
                        x2="100%"
                        y2={sizeMatch.heightMatch.targetBox.h}
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / (scale * view.scale))}
                        shapeRendering="geometricPrecision"
                      />
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: '#ec4899',
                        color: '#fff',
                        fontSize: Math.max(9, 10 / (scale * view.scale)),
                        lineHeight: 1,
                        padding: `${2 / (scale * view.scale)}px ${5 / (scale * view.scale)}px`,
                        borderRadius: 3 / (scale * view.scale),
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }}
                    >
                      {Math.round(sizeMatch.heightMatch.size)} px
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* DISTANCE / GAP MATCH GUIDES & INDICATORS */}
          {gapMatch && gapMatch.gaps.length > 0 && (
            <div data-testid="gap-match-guides" className="pointer-events-none">
              {gapMatch.gaps.map((gap, idx) => {
                const eff = scale * view.scale
                if (gap.axis === 'y') {
                  const lineH = Math.max(1, gap.y2 - gap.y1)
                  const tickW = 8.5 / eff
                  return (
                    <div
                      key={`gap-y-${idx}`}
                      data-testid={`gap-guide-y-${idx}`}
                      data-gap-size={gap.size}
                      style={{
                        position: 'absolute',
                        left: gap.x1,
                        top: gap.y1,
                        width: Math.max(12, tickW),
                        height: lineH,
                        zIndex: 75,
                        transform: 'translateX(-50%)',
                      }}
                    >
                      <svg
                        className="absolute inset-0 overflow-visible pointer-events-none"
                        style={{ width: '100%', height: '100%' }}
                      >
                        <line
                          x1="50%"
                          y1={0}
                          x2="50%"
                          y2={lineH}
                          stroke="#ec4899"
                          strokeWidth={Math.max(1, 1.5 / eff)}
                          shapeRendering="geometricPrecision"
                        />
                        <line
                          x1={`calc(50% - ${tickW / 2}px)`}
                          y1={0}
                          x2={`calc(50% + ${tickW / 2}px)`}
                          y2={0}
                          stroke="#ec4899"
                          strokeWidth={Math.max(1, 1.5 / eff)}
                          shapeRendering="geometricPrecision"
                        />
                        <line
                          x1={`calc(50% - ${tickW / 2}px)`}
                          y1={lineH}
                          x2={`calc(50% + ${tickW / 2}px)`}
                          y2={lineH}
                          stroke="#ec4899"
                          strokeWidth={Math.max(1, 1.5 / eff)}
                          shapeRendering="geometricPrecision"
                        />
                      </svg>
                      {/* Gap measurement badge */}
                      <div
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          background: '#ec4899',
                          color: '#fff',
                          fontSize: Math.max(9, 10 / eff),
                          lineHeight: 1,
                          padding: `${2 / eff}px ${5 / eff}px`,
                          borderRadius: 3 / eff,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }}
                      >
                        {Math.round(gap.size)} px
                      </div>
                    </div>
                  )
                }

                // Horizontal gap
                const lineW = Math.max(1, gap.x2 - gap.x1)
                const tickH = 8.5 / eff
                return (
                  <div
                    key={`gap-x-${idx}`}
                    data-testid={`gap-guide-x-${idx}`}
                    data-gap-size={gap.size}
                    style={{
                      position: 'absolute',
                      left: gap.x1,
                      top: gap.y1,
                      width: lineW,
                      height: Math.max(12, tickH),
                      zIndex: 75,
                      transform: 'translateY(-50%)',
                    }}
                  >
                    <svg
                      className="absolute inset-0 overflow-visible pointer-events-none"
                      style={{ width: '100%', height: '100%' }}
                    >
                      <line
                        x1={0}
                        y1="50%"
                        x2={lineW}
                        y2="50%"
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / eff)}
                        shapeRendering="geometricPrecision"
                      />
                      <line
                        x1={0}
                        y1={`calc(50% - ${tickH / 2}px)`}
                        x2={0}
                        y2={`calc(50% + ${tickH / 2}px)`}
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / eff)}
                        shapeRendering="geometricPrecision"
                      />
                      <line
                        x1={lineW}
                        y1={`calc(50% - ${tickH / 2}px)`}
                        x2={lineW}
                        y2={`calc(50% + ${tickH / 2}px)`}
                        stroke="#ec4899"
                        strokeWidth={Math.max(1, 1.5 / eff)}
                        shapeRendering="geometricPrecision"
                      />
                    </svg>
                    {/* Gap measurement badge */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: '#ec4899',
                        color: '#fff',
                        fontSize: Math.max(9, 10 / eff),
                        lineHeight: 1,
                        padding: `${2 / eff}px ${5 / eff}px`,
                        borderRadius: 3 / eff,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }}
                    >
                      {Math.round(gap.size)} px
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ELEMENT-TO-ELEMENT ALIGNMENT SMART GUIDES */}
          {elementAlign && (elementAlign.xMatches.length > 0 || elementAlign.yMatches.length > 0) && (
            <div data-testid="element-align-guides" className="pointer-events-none">
              {elementAlign.xMatches.map((m, idx) => {
                const eff = scale * view.scale
                const lineH = Math.max(1, m.endCoord - m.startCoord)
                const pipR = Math.max(2, 2.5 / eff)
                return (
                  <div
                    key={`elem-align-x-${idx}`}
                    data-testid={`element-align-guide-x-${idx}`}
                    data-align-type={m.type}
                    data-target-id={m.targetBox.id}
                    style={{
                      position: 'absolute',
                      left: m.guideCoord,
                      top: m.startCoord,
                      width: Math.max(6, 6 / eff),
                      height: lineH,
                      zIndex: 76,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <svg
                      className="absolute inset-0 overflow-visible pointer-events-none"
                      style={{ width: '100%', height: '100%' }}
                    >
                      <line
                        x1="50%"
                        y1={0}
                        x2="50%"
                        y2={lineH}
                        stroke="#06b6d4"
                        strokeWidth={Math.max(1, 1.5 / eff)}
                        shapeRendering="geometricPrecision"
                      />
                      {/* Top indicator pip */}
                      <circle
                        cx="50%"
                        cy={0}
                        r={pipR}
                        fill="#06b6d4"
                        shapeRendering="geometricPrecision"
                      />
                      {/* Bottom indicator pip */}
                      <circle
                        cx="50%"
                        cy={lineH}
                        r={pipR}
                        fill="#06b6d4"
                        shapeRendering="geometricPrecision"
                      />
                    </svg>
                  </div>
                )
              })}
              {elementAlign.yMatches.map((m, idx) => {
                const eff = scale * view.scale
                const lineW = Math.max(1, m.endCoord - m.startCoord)
                const pipR = Math.max(2, 2.5 / eff)
                return (
                  <div
                    key={`elem-align-y-${idx}`}
                    data-testid={`element-align-guide-y-${idx}`}
                    data-align-type={m.type}
                    data-target-id={m.targetBox.id}
                    style={{
                      position: 'absolute',
                      left: m.startCoord,
                      top: m.guideCoord,
                      width: lineW,
                      height: Math.max(6, 6 / eff),
                      zIndex: 76,
                      transform: 'translateY(-50%)',
                    }}
                  >
                    <svg
                      className="absolute inset-0 overflow-visible pointer-events-none"
                      style={{ width: '100%', height: '100%' }}
                    >
                      <line
                        x1={0}
                        y1="50%"
                        x2={lineW}
                        y2="50%"
                        stroke="#06b6d4"
                        strokeWidth={Math.max(1, 1.5 / eff)}
                        shapeRendering="geometricPrecision"
                      />
                      {/* Left indicator pip */}
                      <circle
                        cx={0}
                        cy="50%"
                        r={pipR}
                        fill="#06b6d4"
                        shapeRendering="geometricPrecision"
                      />
                      {/* Right indicator pip */}
                      <circle
                        cx={lineW}
                        cy="50%"
                        r={pipR}
                        fill="#06b6d4"
                        shapeRendering="geometricPrecision"
                      />
                    </svg>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </div>
      )}

      {marquee && (
        <svg
          aria-hidden="true"
          data-testid="marquee-selection"
          className="pointer-events-none absolute overflow-visible"
          style={{
            left: marquee.x * scale * view.scale + view.x + (size.w - preset.w * scale * view.scale) / 2,
            top: marquee.y * scale * view.scale + view.y + (size.h - preset.h * scale * view.scale) / 2,
            width: marquee.w * scale * view.scale,
            height: marquee.h * scale * view.scale,
            zIndex: 80,
          }}
        >
          <rect
            x={0}
            y={0}
            width="100%"
            height="100%"
            fill="rgba(75, 29, 107, 0.12)"
            stroke="#4B1D6B"
            strokeWidth={1.5}
            shapeRendering="geometricPrecision"
          />
        </svg>
      )}


      {/* Floating nudge buttons in bottom-left corner with increment control */}
      <div
        className="absolute bottom-3 left-3 z-40 flex items-center select-none"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          data-testid="nudge-controls"
          id="nudge-controls"
          className="flex h-9 items-center gap-1 rounded-full bg-black/60 px-2 py-1.5 text-xs font-semibold text-white backdrop-blur-md border border-white/10 shadow-lg"
        >
          <button
            data-testid="nudge-left"
            id="nudge-left"
            data-action="nudge-left"
            data-direction="left"
            type="button"
            aria-label={`Nudge left (${nudgeIncrement}px)`}
            title={`Nudge left (${nudgeIncrement}px)`}
            onClick={() => handleNudge(-1, 0)}
            className="grid h-6 w-6 place-items-center rounded-full text-white/90 hover:text-white hover:bg-white/20 active:scale-90 transition-all focus:outline-none"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="sr-only">Nudge left</span>
          </button>
          <button
            data-testid="nudge-right"
            id="nudge-right"
            data-action="nudge-right"
            data-direction="right"
            type="button"
            aria-label={`Nudge right (${nudgeIncrement}px)`}
            title={`Nudge right (${nudgeIncrement}px)`}
            onClick={() => handleNudge(1, 0)}
            className="grid h-6 w-6 place-items-center rounded-full text-white/90 hover:text-white hover:bg-white/20 active:scale-90 transition-all focus:outline-none"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="sr-only">Nudge right</span>
          </button>
          <button
            data-testid="nudge-up"
            id="nudge-up"
            data-action="nudge-up"
            data-direction="up"
            type="button"
            aria-label={`Nudge up (${nudgeIncrement}px)`}
            title={`Nudge up (${nudgeIncrement}px)`}
            onClick={() => handleNudge(0, -1)}
            className="grid h-6 w-6 place-items-center rounded-full text-white/90 hover:text-white hover:bg-white/20 active:scale-90 transition-all focus:outline-none"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            <span className="sr-only">Nudge up</span>
          </button>
          <button
            data-testid="nudge-down"
            id="nudge-down"
            data-action="nudge-down"
            data-direction="down"
            type="button"
            aria-label={`Nudge down (${nudgeIncrement}px)`}
            title={`Nudge down (${nudgeIncrement}px)`}
            onClick={() => handleNudge(0, 1)}
            className="grid h-6 w-6 place-items-center rounded-full text-white/90 hover:text-white hover:bg-white/20 active:scale-90 transition-all focus:outline-none"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span className="sr-only">Nudge down</span>
          </button>
        </div>

        {/* Round button in the same height as the nudge panel to change nudge increment */}
        <div ref={nudgePopoverRef} className="relative flex items-center">
          <button
            data-testid="nudge-increment-btn"
            id="nudge-increment-btn"
            type="button"
            aria-label={`Change nudge increment (currently ${nudgeIncrement}px)`}
            title={`Nudge increment: ${nudgeIncrement}px (tap to change)`}
            onClick={() => {
              setCustomNudgeInput(String(nudgeIncrement))
              setEditingNudgeIncrement((prev) => !prev)
            }}
            className="flex h-9 min-w-[36px] px-2 items-center justify-center rounded-full bg-black/60 text-[11px] font-semibold text-white backdrop-blur-md border border-white/10 shadow-lg hover:bg-white/20 hover:text-white active:scale-90 transition-all focus:outline-none tabular-nums whitespace-nowrap"
          >
            {nudgeIncrement}px
          </button>

          {editingNudgeIncrement && (
            <div
              data-testid="nudge-increment-popover"
              id="nudge-increment-popover"
              className="absolute bottom-full left-0 mb-2 flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-black/85 p-2.5 shadow-2xl backdrop-blur-lg text-white z-50 min-w-[140px]"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] font-medium text-white/60 px-1 uppercase tracking-wider">
                Nudge Step
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[1, 5, 10, 20].map((step) => (
                  <button
                    key={step}
                    type="button"
                    data-testid={`nudge-preset-${step}`}
                    onClick={() => {
                      setNudgeIncrement(step)
                      setCustomNudgeInput(String(step))
                      setEditingNudgeIncrement(false)
                    }}
                    className={`h-7 rounded-lg text-xs font-semibold transition-all ${
                      nudgeIncrement === step
                        ? 'bg-white text-black shadow'
                        : 'bg-white/10 text-white/90 hover:bg-white/20 hover:text-white'
                    }`}
                  >
                    {step}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
                <input
                  data-testid="nudge-custom-input"
                  id="nudge-custom-input"
                  type="number"
                  min="1"
                  max="500"
                  step="1"
                  value={customNudgeInput}
                  onChange={(e) => setCustomNudgeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseInt(customNudgeInput, 10)
                      if (!isNaN(val) && val > 0) {
                        setNudgeIncrement(val)
                      }
                      setEditingNudgeIncrement(false)
                    } else if (e.key === 'Escape') {
                      setEditingNudgeIncrement(false)
                    }
                  }}
                  className="h-7 w-16 rounded-lg border border-white/20 bg-white/10 px-2 text-xs font-medium text-white placeholder-white/40 focus:border-white/50 focus:outline-none tabular-nums"
                  placeholder="px"
                />
                <button
                  type="button"
                  data-testid="nudge-set-btn"
                  id="nudge-set-btn"
                  onClick={() => {
                    const val = parseInt(customNudgeInput, 10)
                    if (!isNaN(val) && val > 0) {
                      setNudgeIncrement(val)
                    }
                    setEditingNudgeIncrement(false)
                  }}
                  className="flex-1 h-7 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-medium text-white transition-colors flex items-center justify-center"
                >
                  Set
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {view.scale !== 1 && (
        <button
          data-testid="reset-zoom"
          onClick={() => setView({ scale: 1, x: 0, y: 0 })}
          className="absolute bottom-3 right-3 z-40 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md active:scale-95"
        >
          {Math.round(view.scale * 100)}% · Reset
        </button>
      )}

      {project.layers.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-full bg-black/50 px-4 py-2 text-sm text-white/70">
            Tap a tool below to add elements
          </p>
        </div>
      )}
    </div>
  )
}

function EditableText({ initial, style, onCommit, onDone }: { initial: string; style: React.CSSProperties; onCommit: (t: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(initial)
  const committed = useRef(false)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  const commit = () => {
    if (committed.current) return
    committed.current = true
    commitRef.current(latest.current)
  }
  useEffect(() => {
    const el = ref.current
    if (!el) return
    committed.current = false
    el.textContent = initial
    el.focus()
    const r = document.createRange()
    r.selectNodeContents(el)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(r)
    return () => commit() // commit even if unmounted (tap empty canvas) without a blur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      style={{ ...style, minWidth: '1ch', minHeight: '0.8em' }}
      onPointerDown={(e) => e.stopPropagation()}
      onInput={(e) => { latest.current = (e.currentTarget as HTMLElement).innerText }}
      onBlur={() => { commit(); onDone() }}
    />
  )
}

function LayerContent({
  layer,
  editing,
  isVectorEditing = false,
  eff = 1,
  onEdit,
  onEndEdit,
}: {
  layer: Layer
  editing: boolean
  isVectorEditing?: boolean
  eff?: number
  onEdit: (t: string) => void
  onEndEdit: () => void
}) {
  if (layer.type === 'group') {
    return null
  }

  if (layer.type === 'text') {
    const style: React.CSSProperties = {
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: layer.fontWeight,
      color: layer.color,
      textAlign: layer.align,
      lineHeight: 0.8,
      width: 'max-content',
      margin: 0,
      padding: 0,
      boxSizing: 'border-box',
      // Keep pinch resizing from introducing accidental soft wraps that change
      // the selected text layer's auto height. Explicit line breaks still work.
      whiteSpace: 'pre',
      wordBreak: 'normal',
      outline: 'none',
    }
    if (editing) {
      return <EditableText style={style} initial={layer.text || ''} onCommit={(t) => onEdit(t)} onDone={onEndEdit} />
    }
    return <div style={style}>{layer.text}</div>
  }

  if (layer.type === 'shape') {
    const fill = layer.fill || '#000000'
    const fillOpacity = isVectorEditing ? 0.65 : undefined
    const stroke = layer.stroke || undefined
    const strokeWidth = layer.strokeWidth || 0

    switch (layer.shape) {
      case 'circle':
        return (
          <svg viewBox={`0 0 ${layer.w} ${layer.h}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} shapeRendering="geometricPrecision">
            <ellipse cx={layer.w / 2} cy={layer.h / 2} rx={layer.w / 2} ry={layer.h / 2} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} shapeRendering="geometricPrecision" style={{ transition: 'fill-opacity 0.2s ease' }} />
            {isVectorEditing && (
              <ellipse cx={layer.w / 2} cy={layer.h / 2} rx={layer.w / 2} ry={layer.h / 2} fill="none" stroke="#d1d5db" strokeWidth={1 / eff} shapeRendering="geometricPrecision" />
            )}
          </svg>
        )
      case 'triangle':
        return (
          <svg viewBox={`0 0 ${layer.w} ${layer.h}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} shapeRendering="geometricPrecision">
            <polygon points={`${layer.w / 2},0 ${layer.w},${layer.h} 0,${layer.h}`} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" shapeRendering="geometricPrecision" style={{ transition: 'fill-opacity 0.2s ease' }} />
            {isVectorEditing && (
              <polygon points={`${layer.w / 2},0 ${layer.w},${layer.h} 0,${layer.h}`} fill="none" stroke="#d1d5db" strokeWidth={1 / eff} strokeLinejoin="round" shapeRendering="geometricPrecision" />
            )}
          </svg>
        )
      case 'star':
        return (
          <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} shapeRendering="geometricPrecision">
            <polygon points="50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35" fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" shapeRendering="geometricPrecision" style={{ transition: 'fill-opacity 0.2s ease' }} />
            {isVectorEditing && (
              <polygon points="50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35" fill="none" stroke="#d1d5db" strokeWidth={1 / eff} strokeLinejoin="round" shapeRendering="geometricPrecision" />
            )}
          </svg>
        )
      case 'line':
        return (
          <svg viewBox={`0 0 ${layer.w} ${layer.h}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} shapeRendering="geometricPrecision">
            <line x1={0} y1={layer.h / 2} x2={layer.w} y2={layer.h / 2} stroke={fill} strokeWidth={Math.max(2, layer.h * 0.12)} strokeLinecap="round" shapeRendering="geometricPrecision" />
          </svg>
        )
      case 'pill':
        return (
          <svg viewBox={`0 0 ${layer.w} ${layer.h}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} shapeRendering="geometricPrecision">
            <rect
              x={0}
              y={0}
              width={layer.w}
              height={layer.h}
              rx={Math.min(layer.w, layer.h) / 2}
              ry={Math.min(layer.w, layer.h) / 2}
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeWidth={strokeWidth}
              shapeRendering="geometricPrecision"
              style={{ transition: 'fill-opacity 0.2s ease' }}
            />
            {isVectorEditing && (
              <rect
                x={0}
                y={0}
                width={layer.w}
                height={layer.h}
                rx={Math.min(layer.w, layer.h) / 2}
                ry={Math.min(layer.w, layer.h) / 2}
                fill="none"
                stroke="#d1d5db"
                strokeWidth={1 / eff}
                shapeRendering="geometricPrecision"
              />
            )}
          </svg>
        )
      case 'rectangle':
        return (
          <svg viewBox={`0 0 ${layer.w} ${layer.h}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} shapeRendering="geometricPrecision">
            <rect
              x={0}
              y={0}
              width={layer.w}
              height={layer.h}
              rx={layer.radius !== undefined ? layer.radius : 0}
              ry={layer.radius !== undefined ? layer.radius : 0}
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeWidth={strokeWidth}
              shapeRendering="geometricPrecision"
              style={{ transition: 'fill-opacity 0.2s ease' }}
            />
            {isVectorEditing && (
              <rect
                x={0}
                y={0}
                width={layer.w}
                height={layer.h}
                rx={layer.radius !== undefined ? layer.radius : 0}
                ry={layer.radius !== undefined ? layer.radius : 0}
                fill="none"
                stroke="#d1d5db"
                strokeWidth={1 / eff}
                shapeRendering="geometricPrecision"
              />
            )}
          </svg>
        )
      default:
        return (
          <svg viewBox={`0 0 ${layer.w} ${layer.h}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} shapeRendering="geometricPrecision">
            <rect x={0} y={0} width={layer.w} height={layer.h} rx={layer.radius || 0} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} shapeRendering="geometricPrecision" style={{ transition: 'fill-opacity 0.2s ease' }} />
            {isVectorEditing && (
              <rect x={0} y={0} width={layer.w} height={layer.h} rx={layer.radius || 0} fill="none" stroke="#d1d5db" strokeWidth={1 / eff} shapeRendering="geometricPrecision" />
            )}
          </svg>
        )
    }
  }

  if (layer.type === 'path') {
    // Editable points are the source of truth. Keeping stale pathData first makes
    // the rendered shape drift away from its anchor handles after vector edits.
    const d = layer.points ? buildSvgPath(layer.points, layer.closed !== false, layer.w, layer.h) : (layer.pathData || '')
    const fill = layer.fill || 'none'
    const fillOpacity = isVectorEditing && fill !== 'none' ? 0.65 : undefined
    const stroke = layer.stroke || (layer.strokeWidth ? '#007AFF' : undefined)
    const strokeWidth = layer.strokeWidth ?? (stroke ? 2 : 0)
    const strokeLinecap = layer.strokeLinecap || 'round'
    const strokeLinejoin = layer.strokeLinejoin || 'round'

    return (
      <svg
        viewBox={`0 0 ${layer.w} ${layer.h}`}
        width="100%"
        height="100%"
        style={{ display: 'block', overflow: 'visible' }}
        shapeRendering="geometricPrecision"
      >
        <path
          d={d}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
          fillRule={layer.fillRule || 'nonzero'}
          shapeRendering="geometricPrecision"
          style={{ transition: 'fill-opacity 0.2s ease' }}
        />
        {isVectorEditing && (
          <path
            data-testid={`vector-shape-border-${layer.id}`}
            d={d}
            fill="none"
            stroke="#d1d5db"
            strokeWidth={1 / eff}
            strokeLinecap={strokeLinecap}
            strokeLinejoin={strokeLinejoin}
            shapeRendering="geometricPrecision"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>
    )
  }

  if (layer.type === 'image') {
    if (layer.crop) {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            position: 'relative',
            borderRadius: layer.radius || 0,
            pointerEvents: 'none',
          }}
        >
          <img
            crossOrigin="anonymous"
            src={layer.src}
            alt=""
            draggable={false}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onDragStart={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            style={{
              position: 'absolute',
              left: `${layer.crop.x}px`,
              top: `${layer.crop.y}px`,
              width: `${layer.crop.w}px`,
              height: `${layer.crop.h}px`,
              maxWidth: 'none',
              maxHeight: 'none',
              objectFit: 'cover',
              pointerEvents: 'none',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              // @ts-expect-error non-standard css property
              WebkitUserDrag: 'none',
            }}
          />
        </div>
      )
    }
    return (
      <img
        crossOrigin="anonymous"
        src={layer.src}
        alt=""
        draggable={false}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDragStart={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: layer.imageFit || 'cover',
          objectPosition: layer.imagePosition || 'center center',
          borderRadius: layer.radius || 0,
          pointerEvents: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          // @ts-expect-error non-standard css property
          WebkitUserDrag: 'none',
        }}
      />
    )
  }

  // sticker
  return (
    <div style={{ width: '100%', height: '100%', fontSize: layer.h * 0.8, display: 'grid', placeItems: 'center', lineHeight: 1 }}>
      {layer.emoji}
    </div>
  )
}
