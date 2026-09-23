import React, { useEffect, useRef, useState, useMemo } from 'react'
import {
  Play, Pause, Scissors, Diamond, ZoomIn, ZoomOut,
  ChevronDown, ChevronRight, ChevronLeft, Folder, Component as ComponentIcon,
  ArrowUp, ArrowDown, Eye, EyeOff, Infinity as InfinityIcon,
} from 'lucide-react'
import { useEditor } from '#/store/editor'
import type { Layer, Keyframe } from '#/types'
import { getDescendantLayers } from '#/lib/groups'
import { hasKeyframeAt, getAdjacentKeyframes } from '#/lib/keyframes'

const TRACK_COLOR: Record<string, string> = {
  text: 'var(--color-track-text)',
  shape: 'var(--color-track-shape)',
  image: 'var(--color-track-image)',
  sticker: 'var(--color-track-sticker)',
  group: '#4338CA',
}

function fmt(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`
}

type Drag =
  | { kind: 'playhead' }
  | { kind: 'trim'; id: string; edge: 'l' | 'r'; s0: number; e0: number; sx: number }
  | { kind: 'move'; id: string; sx: number; initialStart: number; initialEnd: number; initialKeyframes?: Keyframe[] }
  | { kind: 'keyframe'; layerId: string; keyframeId: string; sx: number; initialTime: number; layerStart: number; layerEnd: number }
  | { kind: 'trim-group'; id: string; edge: 'l' | 'r'; s0: number; e0: number; sx: number; initialStarts: Map<string, number>; initialEnds: Map<string, number>; groupStart?: number; groupEnd?: number }
  | { kind: 'move-group'; id: string; sx: number; initialStarts: Map<string, number>; initialEnds: Map<string, number>; groupStart?: number; groupEnd?: number; groupKeyframes?: Keyframe[] }
  | null

const LABEL_W = 184

interface TimelineRowItem {
  layer: Layer
  depth: number
  isGroup: boolean
  isComponent: boolean
  hasChildren: boolean
  collapsed?: boolean
  effectiveStart: number
  effectiveEnd: number
}

export default function Timeline() {
  const {
    project, time, setTime, playing, setPlaying, selectedId, select,
    updateLayer, updateLayers, toggleGroupCollapse, reorder, timelineOpen, toggleTimeline, openTool, setAnimationSide,
    toggleKeyframe, moveKeyframe, deleteKeyframe, checkpoint,
  } = useEditor()
  const [ppms, setPpms] = useState(0.05)
  const [scrollTop, setScrollTop] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag>(null)
  const { duration } = project

  const timeToX = (t: number) => t * ppms
  const xToTime = (clientX: number) => {
    const el = trackRef.current!
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft - LABEL_W
    return Math.max(0, Math.min(duration, x / ppms))
  }

  // Build the hierarchical timeline row list
  const rows = useMemo<TimelineRowItem[]>(() => {
    const layers = project.layers
    const layerMap = new Map(layers.map((l) => [l.id, l]))
    const rootLayers = layers.filter((l) => !l.groupId || !layerMap.has(l.groupId))

    const result: TimelineRowItem[] = []

    function addNode(layer: Layer, depth: number) {
      const isGroup = layer.type === 'group'
      const isComponent = Boolean(layer.isComponent)
      const children = layers.filter((l) => l.groupId === layer.id).reverse()
      const hasChildren = children.length > 0
      const collapsed = Boolean(layer.collapsed)

      let effectiveStart = layer.start
      let effectiveEnd = layer.end

      if (isGroup) {
        const descendants = getDescendantLayers(layer.id, layers).filter((l) => l.type !== 'group')
        if (descendants.length > 0) {
          effectiveStart = Math.min(...descendants.map((d) => d.start))
          effectiveEnd = Math.max(...descendants.map((d) => d.end))
        }
      }

      result.push({
        layer,
        depth,
        isGroup,
        isComponent,
        hasChildren,
        collapsed,
        effectiveStart,
        effectiveEnd,
      })

      if (isGroup && !collapsed) {
        for (const child of children) {
          addNode(child, depth + 1)
        }
      }
    }

    const reversedRoots = [...rootLayers].reverse()
    for (const root of reversedRoots) {
      addNode(root, 0)
    }

    return result
  }, [project.layers])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      if (d.kind === 'playhead') {
        setTime(xToTime(e.clientX))
      } else if (d.kind === 'trim') {
        const dt = (e.clientX - d.sx) / ppms
        if (d.edge === 'l') {
          updateLayer(d.id, { start: Math.max(0, Math.min(d.e0 - 200, d.s0 + dt)) })
        } else {
          updateLayer(d.id, { end: Math.min(duration, Math.max(d.s0 + 200, d.e0 + dt)) })
        }
      } else if (d.kind === 'move') {
        const dt = (e.clientX - d.sx) / ppms
        const span = d.initialEnd - d.initialStart
        const newStart = Math.max(0, Math.min(duration - span, d.initialStart + dt))
        let keyframesPatch: Keyframe[] | undefined = undefined
        if (d.initialKeyframes && d.initialKeyframes.length > 0) {
          const shift = Math.round(newStart - d.initialStart)
          keyframesPatch = d.initialKeyframes.map((kf) => ({
            ...kf,
            time: Math.round(kf.time + shift),
          }))
        }
        updateLayer(d.id, {
          start: newStart,
          end: newStart + span,
          ...(keyframesPatch ? { keyframes: keyframesPatch } : {}),
        })
      } else if (d.kind === 'keyframe') {
        const dt = (e.clientX - d.sx) / ppms
        const newTime = Math.max(d.layerStart, Math.min(d.layerEnd, Math.round(d.initialTime + dt)))
        moveKeyframe(d.layerId, d.keyframeId, newTime)
        setTime(newTime)
      } else if (d.kind === 'move-group') {
        const dt = (e.clientX - d.sx) / ppms
        for (const [childId, initStart] of d.initialStarts.entries()) {
          const initEnd = d.initialEnds.get(childId) ?? (initStart + 1000)
          const span = initEnd - initStart
          const newStart = Math.max(0, Math.min(duration - span, initStart + dt))
          updateLayer(childId, { start: newStart, end: newStart + span })
        }
        if (d.groupStart !== undefined && d.groupEnd !== undefined) {
          const span = d.groupEnd - d.groupStart
          const newStart = Math.max(0, Math.min(duration - span, d.groupStart + dt))
          let keyframesPatch: Keyframe[] | undefined = undefined
          if (d.groupKeyframes && d.groupKeyframes.length > 0) {
            const shift = Math.round(newStart - d.groupStart)
            keyframesPatch = d.groupKeyframes.map((kf) => ({
              ...kf,
              time: Math.round(kf.time + shift),
            }))
          }
          updateLayer(d.id, {
            start: newStart,
            end: newStart + span,
            ...(keyframesPatch ? { keyframes: keyframesPatch } : {}),
          })
        }
      } else if (d.kind === 'trim-group') {
        const dt = (e.clientX - d.sx) / ppms
        for (const [childId, initStart] of d.initialStarts.entries()) {
          const initEnd = d.initialEnds.get(childId) ?? (initStart + 1000)
          if (d.edge === 'l') {
            const newStart = Math.max(0, Math.min(initEnd - 100, initStart + dt))
            updateLayer(childId, { start: newStart })
          } else {
            const newEnd = Math.min(duration, Math.max(initStart + 100, initEnd + dt))
            updateLayer(childId, { end: newEnd })
          }
        }
        if (d.groupStart !== undefined && d.groupEnd !== undefined) {
          if (d.edge === 'l') {
            const newStart = Math.max(0, Math.min(d.groupEnd - 100, d.groupStart + dt))
            updateLayer(d.id, { start: newStart })
          } else {
            const newEnd = Math.min(duration, Math.max(d.groupStart + 100, d.groupEnd + dt))
            updateLayer(d.id, { end: newEnd })
          }
        }
      }
    }
    const up = () => {
      if (drag.current && drag.current.kind !== 'playhead') {
        checkpoint()
      }
      drag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [ppms, duration, setTime, updateLayer])

  const ticks = Array.from({ length: Math.floor(duration / 1000) + 1 }, (_, i) => i)

  const startGroupDrag = (groupId: string, e: React.PointerEvent) => {
    e.stopPropagation()
    const descendants = getDescendantLayers(groupId, project.layers)
    const initialStarts = new Map<string, number>()
    const initialEnds = new Map<string, number>()
    for (const d of descendants) {
      initialStarts.set(d.id, d.start)
      initialEnds.set(d.id, d.end)
    }
    const groupLayer = project.layers.find((l) => l.id === groupId)
    drag.current = {
      kind: 'move-group',
      id: groupId,
      sx: e.clientX,
      initialStarts,
      initialEnds,
      groupStart: groupLayer?.start,
      groupEnd: groupLayer?.end,
      groupKeyframes: groupLayer?.keyframes ? [...groupLayer.keyframes] : undefined,
    }
  }

  const startGroupTrim = (groupId: string, edge: 'l' | 'r', s0: number, e0: number, e: React.PointerEvent) => {
    e.stopPropagation()
    const descendants = getDescendantLayers(groupId, project.layers)
    const initialStarts = new Map<string, number>()
    const initialEnds = new Map<string, number>()
    for (const d of descendants) {
      initialStarts.set(d.id, d.start)
      initialEnds.set(d.id, d.end)
    }
    const groupLayer = project.layers.find((l) => l.id === groupId)
    drag.current = {
      kind: 'trim-group',
      id: groupId,
      edge,
      s0,
      e0,
      sx: e.clientX,
      initialStarts,
      initialEnds,
      groupStart: groupLayer?.start ?? s0,
      groupEnd: groupLayer?.end ?? e0,
    }
  }

  return (
    <div
      className={`shrink-0 border-t border-line bg-timeline transition-all duration-200 ${
        timelineOpen ? 'block' : 'hidden'
      }`}
      data-testid="timeline"
      data-collapsed={!timelineOpen}
      data-state={timelineOpen ? 'open' : 'collapsed'}
      aria-hidden={!timelineOpen}
    >
      {/* controls header */}
      <div className="flex h-11 items-center gap-2 px-3 border-b border-line bg-timeline">
        <button
          onClick={() => setPlaying(!playing)}
          data-testid="play-btn"
          aria-label={playing ? 'Pause' : 'Play'}
          className="grid h-8 w-8 place-items-center rounded-full bg-txt text-bg transition-transform active:scale-90 cursor-pointer shadow-xs"
        >
          {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
        </button>
        <span className="font-mono text-xs tabular-nums text-txt2" data-testid="time-display">
          {fmt(time)} <span className="text-txt3">/ {fmt(duration)}</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button data-testid="split-btn" disabled className="grid h-8 w-8 place-items-center rounded-lg text-txt3 opacity-40" title="Split (coming with backend)">
            <Scissors className="h-4 w-4" />
          </button>
          {(() => {
            const selectedLayer = project.layers.find((x) => x.id === selectedId)
            const hasKf = Boolean(selectedLayer?.keyframes && selectedLayer.keyframes.length > 0)
            const isAtKf = selectedLayer ? hasKeyframeAt(selectedLayer, time, 60) : false
            const { prev: prevKf, next: nextKf } = getAdjacentKeyframes(selectedLayer?.keyframes, time)

            return (
              <div className="flex items-center gap-0.5">
                {hasKf && (
                  <button
                    data-testid="keyframe-prev-btn"
                    disabled={!prevKf}
                    onClick={() => prevKf && setTime(prevKf.time)}
                    className="grid h-8 w-6 place-items-center rounded-lg text-txt2 hover:text-txt disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    title={prevKf ? `Jump to previous keyframe (${fmt(prevKf.time)})` : 'No previous keyframe'}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  data-testid="keyframe-btn"
                  disabled={!selectedLayer}
                  onClick={() => {
                    if (!selectedId) return
                    toggleKeyframe(selectedId, time)
                  }}
                  className={`grid h-8 w-8 place-items-center rounded-lg transition-all ${
                    isAtKf
                      ? 'text-amber-400 bg-amber-400/20 ring-1 ring-amber-400/60 shadow-[0_0_8px_rgba(251,191,36,0.3)]'
                      : hasKf
                        ? 'text-amber-400/90 hover:text-amber-300 hover:bg-surface2'
                        : 'text-txt2 hover:text-white active:bg-surface2'
                  } disabled:opacity-40`}
                  title={
                    !selectedLayer
                      ? 'Select an element or group to add keyframes'
                      : isAtKf
                        ? `Remove keyframe at ${fmt(time)}`
                        : hasKf
                          ? `Add keyframe at ${fmt(time)}`
                          : 'Convert to Keyframe animation mode'
                  }
                >
                  <Diamond className={`h-4 w-4 ${isAtKf ? 'fill-amber-400' : ''}`} />
                </button>
                {hasKf && (
                  <button
                    data-testid="keyframe-next-btn"
                    disabled={!nextKf}
                    onClick={() => nextKf && setTime(nextKf.time)}
                    className="grid h-8 w-6 place-items-center rounded-lg text-txt2 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title={nextKf ? `Jump to next keyframe (${fmt(nextKf.time)})` : 'No next keyframe'}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })()}
          <button data-testid="zoom-out" onClick={() => setPpms((p) => Math.max(0.03, p - 0.03))} className="grid h-8 w-8 place-items-center rounded-lg text-txt2 active:bg-surface2">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button data-testid="zoom-in" onClick={() => setPpms((p) => Math.min(0.4, p + 0.03))} className="grid h-8 w-8 place-items-center rounded-lg text-txt2 active:bg-surface2">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            data-testid="timeline-collapse-btn"
            onClick={() => toggleTimeline(false)}
            className="grid h-8 w-8 place-items-center rounded-lg text-txt2 hover:text-white active:bg-surface2 transition-colors"
            title="Collapse timeline"
            aria-label="Collapse timeline"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* tracks & ruler scroll container */}
      <div
        ref={trackRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="relative h-48 overflow-auto no-scrollbar"
        style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'contain' }}
      >
        <div className="relative" style={{ width: LABEL_W + timeToX(duration) + 40, minWidth: '100%' }}>
          {/* Seconds ruler (sticky top-0) */}
          <div
            className="sticky top-0 z-30 flex h-6 items-center border-b border-white/[0.08] bg-timeline select-none"
            aria-label="Timeline seconds"
          >
            {/* Left header column above the layer panel */}
            <div
              className="sticky left-0 z-40 flex h-full items-center px-3 text-[10px] font-medium text-txt3 bg-timeline border-r border-white/[0.06]"
              style={{ width: LABEL_W }}
            >
              <span>Layers</span>
            </div>

            {/* Ruler ticks container */}
            <div
              className="relative flex h-full flex-1 items-center cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation()
                drag.current = { kind: 'playhead' }
                setTime(xToTime(e.clientX))
              }}
            >
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 border-l border-white/[0.12] text-[10px] text-txt3"
                  style={{ left: t * 1000 * ppms }}
                >
                  <span className="absolute left-1 top-0.5 font-mono text-[10px] text-txt3 select-none">{t}s</span>
                </div>
              ))}
            </div>
          </div>

          {/* rows */}
          <div className="pb-3 pt-1">
            {rows.length === 0 && (
              <p className="py-8 text-center text-xs text-txt3">Add elements to see them on the timeline</p>
            )}
            {(() => {
              const handleToggleVisibility = (layer: Layer) => {
                const nextVis = layer.visible === false
                if (layer.type === 'group') {
                  const descendants = getDescendantLayers(layer.id, project.layers)
                  const allIds = [layer.id, ...descendants.map((d) => d.id)]
                  updateLayers(allIds, { visible: nextVis })
                } else {
                  updateLayer(layer.id, { visible: nextVis })
                }
              }

              const handleToggleAlwaysVisible = (layer: Layer) => {
                const nextAlways = !layer.alwaysVisible
                if (layer.type === 'group') {
                  const descendants = getDescendantLayers(layer.id, project.layers)
                  const allIds = [layer.id, ...descendants.map((d) => d.id)]
                  updateLayers(allIds, { alwaysVisible: nextAlways })
                } else {
                  updateLayer(layer.id, { alwaysVisible: nextAlways })
                }
              }

              return rows.map((item) => (
                <TimelineRow
                  key={item.layer.id}
                  item={item}
                  ppms={ppms}
                  time={time}
                  selected={selectedId === item.layer.id}
                  onSelect={() => select(item.layer.id)}
                  onToggleCollapse={() => toggleGroupCollapse(item.layer.id)}
                  onToggleVisibility={() => handleToggleVisibility(item.layer)}
                  onToggleAlwaysVisible={() => handleToggleAlwaysVisible(item.layer)}
                  onReorder={(dir) => reorder(item.layer.id, dir)}
                  onTrimLayer={(edge, e) => {
                    e.stopPropagation()
                    drag.current = { kind: 'trim', id: item.layer.id, edge, s0: item.layer.start, e0: item.layer.end, sx: e.clientX }
                  }}
                  onMoveLayer={(e) => {
                    e.stopPropagation()
                    drag.current = {
                      kind: 'move',
                      id: item.layer.id,
                      sx: e.clientX,
                      initialStart: item.layer.start,
                      initialEnd: item.layer.end,
                      initialKeyframes: item.layer.keyframes ? [...item.layer.keyframes] : undefined,
                    }
                  }}
                  onKeyframePointerDown={(kfId, e) => {
                    e.stopPropagation()
                    select(item.layer.id)
                    const targetKf = item.layer.keyframes?.find((k) => k.id === kfId)
                    if (!targetKf) return
                    setTime(targetKf.time)
                    drag.current = {
                      kind: 'keyframe',
                      layerId: item.layer.id,
                      keyframeId: kfId,
                      sx: e.clientX,
                      initialTime: targetKf.time,
                      layerStart: item.isGroup ? item.effectiveStart : item.layer.start,
                      layerEnd: item.isGroup ? item.effectiveEnd : item.layer.end,
                    }
                  }}
                  onKeyframeClick={(kfTime) => setTime(kfTime)}
                  onDeleteKeyframe={(kfId) => deleteKeyframe(item.layer.id, kfId)}
                  onAnimation={(side, e) => {
                    e.stopPropagation()
                    select(item.layer.id)
                    setAnimationSide(side)
                    const animStart = item.isGroup ? item.effectiveStart : item.layer.start
                    const animEnd = item.isGroup ? item.effectiveEnd : item.layer.end
                    if (side === 'in') {
                      setTime(animStart)
                    } else {
                      const dur = item.layer.outAnim === 'blur' ? 650 : item.layer.outAnim === 'rotate' ? (item.layer.outRotateMs ?? 150) : item.layer.outAnim === 'pulse' ? 500 : 380
                      setTime(Math.max(0, animEnd - dur))
                    }
                    openTool('animate')
                  }}
                  onDragGroup={(e) => startGroupDrag(item.layer.id, e)}
                  onTrimGroup={(edge, e) => startGroupTrim(item.layer.id, edge, item.effectiveStart, item.effectiveEnd, e)}
                />
              ))
            })()}
          </div>

          {/* playhead */}
          <div
            className="pointer-events-none absolute inset-y-0 z-50"
            style={{ left: LABEL_W }}
            data-testid="playhead"
          >
            {/* Scrubber Handle */}
            <div
              className="pointer-events-auto absolute z-50 flex flex-col items-center -translate-x-1/2 cursor-ew-resize select-none group"
              style={{
                left: timeToX(time),
                top: scrollTop,
                touchAction: 'none',
              }}
              onPointerDown={(e) => {
                e.stopPropagation()
                drag.current = { kind: 'playhead' }
                setTime(xToTime(e.clientX))
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  setTime(Math.max(0, time - 100))
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault()
                  setTime(Math.min(duration, time + 100))
                }
              }}
              aria-label="Drag timeline playhead"
              aria-valuenow={Math.round(time)}
              aria-valuemin={0}
              aria-valuemax={duration}
              role="slider"
              tabIndex={0}
            >
              <div className="relative flex h-6 w-4 items-center justify-center rounded-t-sm bg-white shadow-md shadow-black/60 transition-transform group-hover:scale-105 group-active:scale-95">
                <div className="h-3 w-0.5 rounded-full bg-black/60" />
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-l-[8px] border-r-[8px] border-t-[6px] border-l-transparent border-r-transparent border-t-white" />
              </div>
            </div>

            {/* Scrubber Line */}
            <div
              className="pointer-events-auto absolute top-0 bottom-0 z-50 -translate-x-1/2 cursor-ew-resize flex justify-center"
              style={{ left: timeToX(time), width: 16, touchAction: 'none' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                drag.current = { kind: 'playhead' }
                setTime(xToTime(e.clientX))
              }}
            >
              <div className="h-full w-[2px] bg-white shadow-[0_0_6px_rgba(0,0,0,0.8)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineRow({
  item,
  ppms,
  time,
  selected,
  onSelect,
  onToggleCollapse,
  onToggleVisibility,
  onToggleAlwaysVisible,
  onReorder,
  onTrimLayer,
  onMoveLayer,
  onKeyframePointerDown,
  onKeyframeClick,
  onDeleteKeyframe,
  onAnimation,
  onDragGroup,
  onTrimGroup,
}: {
  item: TimelineRowItem
  ppms: number
  time: number
  selected: boolean
  onSelect: () => void
  onToggleCollapse: () => void
  onToggleVisibility: () => void
  onToggleAlwaysVisible: () => void
  onReorder: (dir: number) => void
  onTrimLayer: (edge: 'l' | 'r', e: React.PointerEvent) => void
  onMoveLayer: (e: React.PointerEvent) => void
  onKeyframePointerDown: (kfId: string, e: React.PointerEvent) => void
  onKeyframeClick: (kfTime: number) => void
  onDeleteKeyframe: (kfId: string) => void
  onAnimation: (side: 'in' | 'out', e: React.PointerEvent) => void
  onDragGroup: (e: React.PointerEvent) => void
  onTrimGroup: (edge: 'l' | 'r', e: React.PointerEvent) => void
}) {
  const { layer, depth, isGroup, isComponent, hasChildren, collapsed, effectiveStart, effectiveEnd } = item
  const label = layer.type === 'text'
    ? (layer.text || 'Text')
    : layer.type === 'sticker'
      ? `Sticker ${layer.emoji}`
      : layer.name

  const indentPx = Math.min(depth * 14, 42)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerDownX = useRef(0)
  const pointerDownY = useRef(0)
  const lastPointerEvent = useRef<React.PointerEvent | null>(null)
  const touchDragging = useRef(false)
  const pointerTarget = useRef<HTMLDivElement | null>(null)
  const pointerId = useRef<number | null>(null)

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  const handleLayerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onSelect()
    pointerDownX.current = e.clientX
    pointerDownY.current = e.clientY
    lastPointerEvent.current = e
    pointerTarget.current = e.currentTarget
    pointerId.current = e.pointerId
    touchDragging.current = false

    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null
        touchDragging.current = true
        if (pointerTarget.current && pointerId.current !== null) {
          pointerTarget.current.setPointerCapture(pointerId.current)
        }
        if (lastPointerEvent.current) onMoveLayer(lastPointerEvent.current)
      }, 350)
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    onMoveLayer(e)
  }

  const handleLayerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    lastPointerEvent.current = e
    if (
      holdTimer.current &&
      Math.hypot(e.clientX - pointerDownX.current, e.clientY - pointerDownY.current) > 8
    ) {
      clearHold()
    }
    if (touchDragging.current) e.preventDefault()
  }

  const handleLayerPointerUp = () => {
    clearHold()
    touchDragging.current = false
    lastPointerEvent.current = null
    pointerTarget.current = null
    pointerId.current = null
  }

  // Group touch-and-hold handling so swiping over group clips scrolls smoothly
  const groupHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const groupPointerDownX = useRef(0)
  const groupPointerDownY = useRef(0)
  const groupLastPointerEvent = useRef<React.PointerEvent | null>(null)
  const groupTouchDragging = useRef(false)
  const groupPointerTarget = useRef<HTMLDivElement | null>(null)
  const groupPointerId = useRef<number | null>(null)

  const clearGroupHold = () => {
    if (groupHoldTimer.current) {
      clearTimeout(groupHoldTimer.current)
      groupHoldTimer.current = null
    }
  }

  const handleGroupPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onSelect()
    groupPointerDownX.current = e.clientX
    groupPointerDownY.current = e.clientY
    groupLastPointerEvent.current = e
    groupPointerTarget.current = e.currentTarget
    groupPointerId.current = e.pointerId
    groupTouchDragging.current = false

    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      groupHoldTimer.current = setTimeout(() => {
        groupHoldTimer.current = null
        groupTouchDragging.current = true
        if (groupPointerTarget.current && groupPointerId.current !== null) {
          groupPointerTarget.current.setPointerCapture(groupPointerId.current)
        }
        if (groupLastPointerEvent.current) onDragGroup(groupLastPointerEvent.current)
      }, 350)
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    onDragGroup(e)
  }

  const handleGroupPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    groupLastPointerEvent.current = e
    if (
      groupHoldTimer.current &&
      Math.hypot(e.clientX - groupPointerDownX.current, e.clientY - groupPointerDownY.current) > 8
    ) {
      clearGroupHold()
    }
    if (groupTouchDragging.current) e.preventDefault()
  }

  const handleGroupPointerUp = () => {
    clearGroupHold()
    groupTouchDragging.current = false
    groupLastPointerEvent.current = null
    groupPointerTarget.current = null
    groupPointerId.current = null
  }

  return (
    <div
      className={`group/row flex h-11 items-center border-b border-line/40 transition-colors ${
        selected ? 'bg-accent/15' : 'hover:bg-line/20'
      }`}
      style={{ touchAction: 'pan-x pan-y' }}
    >
      {/* Left label column */}
      <div
        className="sticky left-0 z-10 flex h-full items-center gap-1.5 bg-timeline pr-2 pl-2"
        style={{ width: LABEL_W, paddingLeft: `${8 + indentPx}px`, touchAction: 'pan-y' }}
        onClick={onSelect}
      >
        {isGroup && hasChildren && (
          <button
            type="button"
            data-testid={`toggle-group-${layer.id}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse()
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-txt3 hover:bg-surface2 hover:text-txt cursor-pointer"
            title={collapsed ? 'Expand group' : 'Collapse group'}
          >
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
        {isGroup && !hasChildren && (
          <span className="w-4 shrink-0" />
        )}

        {!isGroup && depth > 0 && (
          <span className="h-3 w-1.5 shrink-0 border-b border-l border-white/20 -mt-1 mr-0.5" />
        )}

        {isComponent ? (
          <ComponentIcon className="h-3.5 w-3.5 shrink-0 text-purple-400" />
        ) : isGroup ? (
          <Folder className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
        ) : (
          <span
            className="h-2 w-2 shrink-0 rounded-sm"
            style={{ background: TRACK_COLOR[layer.type] || '#3B82F6' }}
          />
        )}

        <span
          className={`truncate text-[11px] select-none flex-1 min-w-0 ${
            isComponent
              ? 'font-semibold text-purple-300'
              : isGroup
                ? 'font-semibold text-indigo-200'
                : 'text-txt2'
          }`}
          title={label}
        >
          {label}
        </span>

        {/* Action icons: Always Visible toggle, Visibility toggle, Reorder */}
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          {/* Always Visible Toggle: shows layer at all times across timeline to easily align elements */}
          <button
            type="button"
            data-testid={`toggle-always-visible-${layer.id}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleAlwaysVisible()
            }}
            className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
              layer.alwaysVisible
                ? 'text-amber-400 bg-amber-400/15 hover:bg-amber-400/25 ring-1 ring-amber-400/30'
                : 'text-txt3/40 hover:text-white hover:bg-white/10'
            }`}
            title={
              layer.alwaysVisible
                ? 'Always visible: ON (showing at all times across timeline to help align)'
                : 'Always visible: OFF (click to keep visible across entire timeline for alignment)'
            }
            aria-label={layer.alwaysVisible ? 'Disable always visible' : 'Enable always visible'}
          >
            <InfinityIcon className="h-3 w-3 stroke-[2]" />
          </button>

          {/* Visibility Toggle: open eye for visible (default), closed eye for hidden at all times */}
          <button
            type="button"
            data-testid={`toggle-visibility-${layer.id}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleVisibility()
            }}
            className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
              layer.visible !== false
                ? 'text-txt3/70 hover:text-white hover:bg-white/10'
                : 'text-rose-400 bg-rose-400/15 hover:bg-rose-400/25 ring-1 ring-rose-400/30'
            }`}
            title={
              layer.visible !== false
                ? 'Visible (click to hide at all times)'
                : 'Hidden at all times (click to show)'
            }
            aria-label={layer.visible !== false ? 'Hide layer' : 'Show layer'}
          >
            {layer.visible !== false ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3" />
            )}
          </button>

          {/* Up / Down reorder arrows */}
          <div className="flex items-center opacity-0 group-hover/row:opacity-100 transition-opacity">
            <button
              type="button"
              data-testid={`reorder-up-${layer.id}`}
              onClick={(e) => {
                e.stopPropagation()
                onReorder(1)
              }}
              className="h-4 w-3 text-txt3 hover:text-white flex items-center justify-center"
              title="Move layer up"
            >
              <ArrowUp className="h-2.5 w-2.5" />
            </button>
            <button
              type="button"
              data-testid={`reorder-down-${layer.id}`}
              onClick={(e) => {
                e.stopPropagation()
                onReorder(-1)
              }}
              className="h-4 w-3 text-txt3 hover:text-white flex items-center justify-center"
              title="Move layer down"
            >
              <ArrowDown className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Right track area */}
      <div className="relative h-full flex-1" style={{ touchAction: 'pan-x pan-y' }}>
        {layer.keyframes && layer.keyframes.length > 0 ? (
          /* Keyframe Layer or Group clip — seamlessly switches the element in place inside the same lane height */
          <div
            onPointerDown={isGroup ? handleGroupPointerDown : handleLayerPointerDown}
            onPointerMove={isGroup ? handleGroupPointerMove : handleLayerPointerMove}
            onPointerUp={isGroup ? handleGroupPointerUp : handleLayerPointerUp}
            onPointerCancel={isGroup ? handleGroupPointerUp : handleLayerPointerUp}
            data-testid={`clip-${layer.id}`}
            className={`absolute top-1.5 flex h-8 items-center rounded-md border shadow-sm select-none transition-colors ${
              selected
                ? isComponent
                  ? 'border-purple-400 bg-slate-900/95 ring-1 ring-purple-400/80 shadow-[0_0_10px_rgba(192,132,252,0.22)]'
                  : isGroup
                    ? 'border-indigo-400 bg-slate-900/95 ring-1 ring-indigo-400/80 shadow-[0_0_10px_rgba(129,140,248,0.22)]'
                    : 'border-amber-400 bg-slate-900/95 ring-1 ring-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.18)]'
                : isComponent
                  ? 'border-purple-500/40 bg-slate-900/85 hover:border-purple-400/70'
                  : isGroup
                    ? 'border-indigo-500/40 bg-slate-900/85 hover:border-indigo-400/70'
                    : 'border-amber-500/40 bg-slate-900/85 hover:border-amber-400/70'
            }`}
            style={{
              left: (isGroup ? effectiveStart : layer.start) * ppms,
              width: Math.max(selected ? 92 : 48, ((isGroup ? effectiveEnd : layer.end) - (isGroup ? effectiveStart : layer.start)) * ppms),
              touchAction: 'pan-x pan-y',
            }}
          >
            {/* Left trim handle */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                if (isGroup) {
                  onTrimGroup('l', e)
                } else {
                  onTrimLayer('l', e)
                }
              }}
              data-testid={`trim-l-${layer.id}`}
              className="absolute left-0 top-0 z-20 flex h-full w-4 cursor-ew-resize items-center justify-center bg-black/40 hover:bg-amber-400/30 transition-colors"
              style={{ touchAction: 'none' }}
              title={isGroup ? 'Trim group start' : 'Trim clip start'}
            >
              <span className="pointer-events-none h-3 w-0.5 rounded-full bg-amber-400/80" />
            </div>

            {/* Connecting keyframe track line */}
            {layer.keyframes.length >= 2 && (() => {
              const times = layer.keyframes.map((k) => k.time)
              const minT = Math.min(...times)
              const maxT = Math.max(...times)
              const clipStart = isGroup ? effectiveStart : layer.start
              return (
                <div
                  className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-amber-400/40 pointer-events-none z-10"
                  style={{
                    left: (minT - clipStart) * ppms,
                    width: Math.max(0, (maxT - minT) * ppms),
                  }}
                />
              )
            })()}

            {/* Center label & keyframe badge */}
            <div className="pointer-events-none flex w-full items-center justify-center gap-1.5 px-5 truncate select-none z-0">
              {isGroup && (
                isComponent ? (
                  <span className="rounded bg-purple-500/30 px-1 py-0.2 text-[8px] font-bold text-purple-200">CMP</span>
                ) : (
                  <span className="rounded bg-indigo-500/30 px-1 py-0.2 text-[8px] font-bold text-indigo-200">GRP</span>
                )
              )}
              <span className="truncate text-[10px] font-semibold text-white/85">{label}</span>
              <span className="rounded bg-amber-400/20 px-1 py-0.2 text-[8px] font-bold text-amber-300 tracking-wider shrink-0">
                ◆ {layer.keyframes.length}
              </span>
            </div>

            {/* Keyframe Diamond Markers */}
            {layer.keyframes.map((kf) => {
              const clipStart = isGroup ? effectiveStart : layer.start
              const kfX = (kf.time - clipStart) * ppms
              const isCurrent = Math.abs(time - kf.time) <= 60
              return (
                <button
                  key={kf.id}
                  type="button"
                  data-testid={`keyframe-marker-${kf.id}`}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onKeyframePointerDown(kf.id, e)
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onKeyframeClick(kf.time)
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    onDeleteKeyframe(kf.id)
                  }}
                  title={`Keyframe at ${fmt(kf.time)}\n• Drag to re-time\n• Click to jump\n• Double-click to remove`}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex h-6 w-6 items-center justify-center cursor-ew-resize select-none group touch-none"
                  style={{ left: kfX }}
                >
                  <div
                    className={`h-3 w-3 rotate-45 transition-transform ${
                      isCurrent
                        ? 'bg-amber-300 ring-2 ring-white shadow-[0_0_8px_rgba(251,191,36,0.95)] scale-110'
                        : 'bg-amber-400 group-hover:bg-amber-200 border border-black/80'
                    }`}
                  />
                </button>
              )
            })}

            {/* Right trim handle */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                if (isGroup) {
                  onTrimGroup('r', e)
                } else {
                  onTrimLayer('r', e)
                }
              }}
              data-testid={`trim-r-${layer.id}`}
              className="absolute right-0 top-0 z-20 flex h-full w-4 cursor-ew-resize items-center justify-center bg-black/40 hover:bg-amber-400/30 transition-colors"
              style={{ touchAction: 'none' }}
              title={isGroup ? 'Trim group end' : 'Trim clip end'}
            >
              <span className="pointer-events-none h-3 w-0.5 rounded-full bg-amber-400/80" />
            </div>
          </div>
        ) : isGroup ? (
          /* Group track clip (no keyframes) with In/Out animation triggers */
          <div
            data-testid={`clip-${layer.id}`}
            onPointerDown={handleGroupPointerDown}
            onPointerMove={handleGroupPointerMove}
            onPointerUp={handleGroupPointerUp}
            onPointerCancel={handleGroupPointerUp}
            className={`absolute top-1.5 flex h-8 items-center overflow-hidden rounded-md border shadow-sm cursor-grab active:cursor-grabbing ${
              selected
                ? isComponent
                  ? 'border-purple-400 bg-purple-950/70 ring-1 ring-purple-400'
                  : 'border-indigo-400 bg-indigo-950/70 ring-1 ring-indigo-400'
                : isComponent
                  ? 'border-purple-500/40 bg-purple-950/40'
                  : 'border-indigo-500/40 bg-indigo-950/40'
            }`}
            style={{
              left: effectiveStart * ppms,
              width: Math.max(selected ? 92 : 48, (effectiveEnd - effectiveStart) * ppms),
              touchAction: 'pan-x pan-y',
            }}
          >
            {selected && (
              <button
                type="button"
                onPointerDown={(e) => onAnimation('in', e)}
                data-testid={`anim-in-${layer.id}`}
                aria-label={`Edit in-animation for ${label}`}
                title={`In-animation: ${layer.inAnim || layer.anim || 'none'}`}
                className={`absolute left-0 top-0 z-10 flex h-full w-[22px] cursor-pointer items-center justify-center border-r border-white/20 transition-colors hover:bg-emerald-300/60 ${
                  (layer.inAnim && layer.inAnim !== 'none') || (layer.anim && layer.anim !== 'none')
                    ? 'bg-emerald-500/40 text-emerald-100'
                    : 'bg-black/20 text-white/70'
                }`}
              >
                <span className="pointer-events-none text-[8.5px] font-bold">IN</span>
              </button>
            )}
            <div
              onPointerDown={(e) => onTrimGroup('l', e)}
              data-testid={`trim-l-${layer.id}`}
              className={`absolute top-0 z-20 flex h-full cursor-ew-resize items-center justify-center bg-black/30 hover:bg-white/20 ${
                selected ? 'left-[22px] w-5 border-r border-white/10' : 'left-0 w-5'
              }`}
              style={{ touchAction: 'none' }}
              title="Trim group start"
            >
              <span className="pointer-events-none h-3.5 w-0.5 rounded-full bg-white/50" />
            </div>
            <div className={`flex w-full items-center gap-1.5 truncate select-none pointer-events-none ${selected ? 'px-12' : 'px-6'}`}>
              {isComponent ? (
                <span className="rounded bg-purple-500/30 px-1 py-0.2 text-[9px] font-bold text-purple-200">CMP</span>
              ) : (
                <span className="rounded bg-indigo-500/30 px-1 py-0.2 text-[9px] font-bold text-indigo-200">GRP</span>
              )}
              <span className="truncate text-[11px] font-semibold text-white/90">{label}</span>
              {(Boolean(layer.inAnim && layer.inAnim !== 'none') || Boolean(layer.anim && layer.anim !== 'none') || Boolean(layer.outAnim && layer.outAnim !== 'none')) && (
                <span className="rounded bg-emerald-500/20 px-1 py-0.2 text-[8px] font-bold text-emerald-300 uppercase shrink-0">
                  {layer.inAnim || layer.anim || layer.outAnim}
                </span>
              )}
            </div>
            <div
              onPointerDown={(e) => onTrimGroup('r', e)}
              data-testid={`trim-r-${layer.id}`}
              className={`absolute top-0 z-20 flex h-full cursor-ew-resize items-center justify-center bg-black/30 hover:bg-white/20 ${
                selected ? 'right-[22px] w-5 border-l border-white/10' : 'right-0 w-5'
              }`}
              style={{ touchAction: 'none' }}
              title="Trim group end"
            >
              <span className="pointer-events-none h-3.5 w-0.5 rounded-full bg-white/50" />
            </div>
            {selected && (
              <button
                type="button"
                onPointerDown={(e) => onAnimation('out', e)}
                data-testid={`anim-out-${layer.id}`}
                aria-label={`Edit out-animation for ${label}`}
                title={`Out-animation: ${layer.outAnim || 'none'}`}
                className={`absolute right-0 top-0 z-10 flex h-full w-[22px] cursor-pointer items-center justify-center border-l border-white/20 transition-colors hover:bg-rose-300/60 ${
                  layer.outAnim && layer.outAnim !== 'none'
                    ? 'bg-rose-500/40 text-rose-100'
                    : 'bg-black/20 text-white/70'
                }`}
              >
                <span className="pointer-events-none text-[8.5px] font-bold">OUT</span>
              </button>
            )}
          </div>
        ) : (
          /* Normal Layer clip */
          <div
            onPointerDown={handleLayerPointerDown}
            onPointerMove={handleLayerPointerMove}
            onPointerUp={handleLayerPointerUp}
            onPointerCancel={handleLayerPointerUp}
            data-testid={`clip-${layer.id}`}
            className={`absolute top-1.5 flex h-8 items-center overflow-hidden rounded-md border ${
              selected ? 'border-white ring-1 ring-white/60' : 'border-white/20'
            }`}
            style={{
              left: layer.start * ppms,
              width: Math.max(selected ? 92 : 48, (layer.end - layer.start) * ppms),
              background: TRACK_COLOR[layer.type] || '#3B82F6',
              opacity: 0.92,
              touchAction: 'pan-x pan-y',
            }}
          >
            {selected && (
              <button
                type="button"
                onPointerDown={(e) => onAnimation('in', e)}
                data-testid={`anim-in-${layer.id}`}
                aria-label={`Edit in-animation for ${label}`}
                title={`In-animation: ${layer.inAnim || layer.anim || 'none'}`}
                className={`absolute left-0 top-0 z-10 flex h-full w-[22px] cursor-pointer items-center justify-center border-r border-white/20 transition-colors hover:bg-emerald-300/60 ${
                  (layer.inAnim && layer.inAnim !== 'none') || (layer.anim && layer.anim !== 'none')
                    ? 'bg-emerald-500/40 text-emerald-100'
                    : 'bg-black/20 text-white/70'
                }`}
              >
                <span className="pointer-events-none text-[8.5px] font-bold">IN</span>
              </button>
            )}
            <div
              onPointerDown={(e) => {
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                onTrimLayer('l', e)
              }}
              data-testid={`trim-l-${layer.id}`}
              className={`absolute top-0 z-20 flex h-full cursor-ew-resize items-center justify-center bg-black/25 hover:bg-black/45 ${
                selected ? 'left-[22px] w-5 border-r border-white/10' : 'left-0 w-5'
              }`}
              style={{ touchAction: 'none' }}
              title="Trim start"
            >
              <span className="pointer-events-none h-3.5 w-0.5 rounded-full bg-white/50" />
            </div>
            <span
              className={`pointer-events-none w-full truncate text-[11px] font-semibold text-white/95 select-none ${
                selected ? 'px-12' : 'px-6'
              }`}
            >
              {label}
            </span>
            <div
              onPointerDown={(e) => {
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                onTrimLayer('r', e)
              }}
              data-testid={`trim-r-${layer.id}`}
              className={`absolute top-0 z-20 flex h-full cursor-ew-resize items-center justify-center bg-black/25 hover:bg-black/45 ${
                selected ? 'right-[22px] w-5 border-l border-white/10' : 'right-0 w-5'
              }`}
              style={{ touchAction: 'none' }}
              title="Trim end"
            >
              <span className="pointer-events-none h-3.5 w-0.5 rounded-full bg-white/50" />
            </div>
            {selected && (
              <button
                type="button"
                onPointerDown={(e) => onAnimation('out', e)}
                data-testid={`anim-out-${layer.id}`}
                aria-label={`Edit out-animation for ${label}`}
                title={`Out-animation: ${layer.outAnim || 'none'}`}
                className={`absolute right-0 top-0 z-10 flex h-full w-[22px] cursor-pointer items-center justify-center border-l border-white/20 transition-colors hover:bg-rose-300/60 ${
                  layer.outAnim && layer.outAnim !== 'none'
                    ? 'bg-rose-500/40 text-rose-100'
                    : 'bg-black/20 text-white/70'
                }`}
              >
                <span className="pointer-events-none text-[8.5px] font-bold">OUT</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

