import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react'
import type { Project, Layer, LayerType, Background } from '#/types'
import { createLayer } from '#/lib/data'
import {
  createGroupFromSelection,
  ungroupLayer,
  duplicateLayerOrGroup,
  deleteLayerOrGroup,
  reorderSibling,
  instantiateComponent,
  saveComponentToLibrary,
  getDescendantLayers,
  computeGroupBounds,
  type ComponentItem,
} from '#/lib/groups'
import {
  convertAnimationToKeyframes,
  hasKeyframeAt,
  removeKeyframeAt,
  upsertKeyframe,
} from '#/lib/keyframes'
import { scaleVectorPoints, buildSvgPath } from '#/lib/vector'
import { convertTextLayerToVectors } from '#/lib/textToVector'

export interface HistoryEntry {
  project: Project
  selectedId: string | null
  selectedIds: string[]
}

export interface EyedropperSession {
  target: 'layer' | 'background'
  layerId?: string
  key?: 'fill' | 'stroke' | 'color'
  initialColor: string
  currentColor: string
}

interface State {
  project: Project
  past: HistoryEntry[]
  future: HistoryEntry[]
  selectedId: string | null
  selectedIds: string[]
  tool: string | null
  eyedropper: EyedropperSession | null
  time: number
  playing: boolean
  artboardSnap: boolean
  vectorSnap: boolean
  selectedAnchorIndices: number[]
  anchorMultiSelectMode: boolean
  timelineOpen: boolean
  imagePositioningId: string | null
  vectorEditingId: string | null
  animationSide: 'in' | 'out'
  _lastHistoryTime?: number
  _lastHistoryKey?: string
}

export type AlignMode =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'distribute-h'
  | 'distribute-v'

type Action =
  | { t: 'select'; id: string | null; additive?: boolean; ids?: string[] }
  | { t: 'toggleSelect'; id: string }
  | { t: 'alignSelected'; mode: AlignMode; measured?: Record<string, { x: number; y: number; w: number; h: number }>; targetGroupId?: string }
  | { t: 'tool'; tool: string | null }
  | { t: 'addLayer'; layer: Layer }
  | { t: 'updateLayer'; id: string; patch: Partial<Layer> }
  | { t: 'updateLayers'; ids: string[]; patch: Partial<Layer> }
  | { t: 'deleteLayer'; id: string }
  | { t: 'deleteLayers'; ids: string[] }
  | { t: 'reorder'; id: string; dir: number }
  | { t: 'duplicate'; id?: string; ids?: string[] }
  | { t: 'createGroup'; ids?: string[]; name?: string; isComponent?: boolean }
  | { t: 'ungroup'; groupId: string }
  | { t: 'toggleGroupCollapse'; groupId: string }
  | { t: 'insertComponent'; component: ComponentItem }
  | { t: 'convertToComponent'; groupId: string; name?: string }
  | { t: 'setBackground'; bg: Background }
  | { t: 'setTime'; time: number }
  | { t: 'setPlaying'; playing: boolean }
  | { t: 'setArtboardSnap'; enabled: boolean }
  | { t: 'setVectorSnap'; enabled: boolean }
  | { t: 'toggleVectorSnap' }
  | { t: 'setSelectedAnchors'; indices: number[] }
  | { t: 'toggleSelectedAnchor'; index: number }
  | { t: 'setAnchorMultiSelectMode'; enabled: boolean }
  | { t: 'toggleAnchorMultiSelectMode' }
  | { t: 'setMode'; mode: 'static' | 'animated' }
  | { t: 'rename'; name: string }
  | { t: 'setDuration'; duration: number }
  | { t: 'toggleTimeline'; open?: boolean }
  | { t: 'setTimelineOpen'; open: boolean }
  | { t: 'setImagePositioningId'; id: string | null }
  | { t: 'setVectorEditingId'; id: string | null }
  | { t: 'setAnimationSide'; side: 'in' | 'out' }
  | { t: 'nudge'; dx: number; dy: number; measured?: Record<string, { x: number; y: number; w: number; h: number }> }
  | { t: 'toggleKeyframe'; layerId?: string; time?: number }
  | { t: 'moveKeyframe'; layerId: string; keyframeId: string; newTime: number }
  | { t: 'deleteKeyframe'; layerId: string; keyframeId: string }
  | { t: 'clearKeyframes'; layerId: string }
  | { t: 'replaceLayerWithLayers'; targetId: string; newLayers: Layer[]; selectId?: string; selectIds?: string[] }
  | { t: 'startEyedropper'; session: EyedropperSession }
  | { t: 'updateEyedropperColor'; color: string }
  | { t: 'cancelEyedropper' }
  | { t: 'finishEyedropper' }
  | { t: 'undo' }
  | { t: 'redo' }
  | { t: 'checkpoint' }

function touch(p: Project): Project {
  return { ...p, updatedAt: Date.now() }
}

function applyLayerUpdate(l: Layer, patch: Partial<Layer>, currentTime: number): Layer {
  let updated = { ...l, ...patch }

  // If path layer's dimensions changed without explicit points provided, scale points proportionally
  if (l.type === 'path' && l.points && !patch.points) {
    const nextW = patch.w !== undefined ? patch.w : l.w
    const nextH = patch.h !== undefined ? patch.h : l.h
    const sx = l.w > 0 ? nextW / l.w : 1
    const sy = l.h > 0 ? nextH / l.h : 1
    if (Math.abs(sx - 1) > 1e-4 || Math.abs(sy - 1) > 1e-4) {
      updated.points = scaleVectorPoints(l.points, sx, sy)
    }
  }

  // If points were updated for a path layer, synchronize pathData
  if (l.type === 'path' && updated.points) {
    const targetW = updated.w !== undefined ? updated.w : l.w
    const targetH = updated.h !== undefined ? updated.h : l.h
    updated.pathData = buildSvgPath(updated.points, updated.closed !== false, targetW, targetH)
  }

  // If layer has keyframes and a transform, style, or points property is patched, update/upsert keyframe at currentTime
  if (l.keyframes && l.keyframes.length > 0 && !('keyframes' in patch)) {
    const keyframePropKeys = [
      'x', 'y', 'w', 'h', 'rotation', 'opacity', 'scale',
      'fontSize', 'fontWeight', 'color', 'fill', 'radius', 'blur',
      'dropShadow', 'innerShadow',
      'points'
    ]
    const isKeyframeProp = keyframePropKeys.some((k) => k in patch)
    if (isKeyframeProp) {
      updated.keyframes = upsertKeyframe(l, currentTime, patch)
    }

    // If layer start or end was trimmed, clamp keyframes to valid range
    if ('start' in patch || 'end' in patch) {
      const newStart = updated.start
      const newEnd = updated.end
      updated.keyframes = (updated.keyframes || []).map((kf) => ({
        ...kf,
        time: Math.max(newStart, Math.min(newEnd, kf.time)),
      }))
    }
  }
  return updated
}

function innerReducer(state: State, a: Action): State {
  const p = state.project
  switch (a.t) {
    case 'setImagePositioningId':
      return { ...state, imagePositioningId: a.id }
    case 'setVectorEditingId':
      return {
        ...state,
        vectorEditingId: a.id,
        selectedAnchorIndices: a.id ? (state.selectedAnchorIndices?.length ? state.selectedAnchorIndices : [0]) : [],
        anchorMultiSelectMode: a.id ? state.anchorMultiSelectMode : false,
      }
    case 'setAnimationSide':
      return { ...state, animationSide: a.side }
    case 'select':
      return {
        ...state,
        selectedId: a.id,
        selectedIds: a.id ? (a.ids ?? (a.additive ? Array.from(new Set([...state.selectedIds, a.id])) : [a.id])) : [],
        imagePositioningId: a.id && a.id === state.imagePositioningId ? state.imagePositioningId : null,
        vectorEditingId: a.id && a.id === state.vectorEditingId ? state.vectorEditingId : null,
        anchorMultiSelectMode: a.id && a.id === state.vectorEditingId ? state.anchorMultiSelectMode : false,
      }
    case 'toggleSelect': {
      const selectedIds = state.selectedIds.includes(a.id)
        ? state.selectedIds.filter((id) => id !== a.id)
        : [...state.selectedIds, a.id]
      return { ...state, selectedIds, selectedId: selectedIds.at(-1) ?? null }
    }
    case 'alignSelected': {
      // Check if we are aligning the children of a single group
      const targetGroupId =
        a.targetGroupId ||
        (state.selectedIds.length === 1 && p.layers.find((l) => l.id === state.selectedIds[0])?.type === 'group'
          ? state.selectedIds[0]
          : undefined)

      if (targetGroupId) {
        const groupLayer = p.layers.find((l) => l.id === targetGroupId)
        if (!groupLayer) return state

        // Direct children of this group (non-locked, visible)
        const children = p.layers.filter((l) => l.groupId === targetGroupId && l.visible && !l.locked)
        if (children.length === 0) return state

        const getBox = (layer: Layer) => {
          if (a.measured && a.measured[layer.id]) {
            return a.measured[layer.id]
          }
          if (layer.type === 'group') {
            return computeGroupBounds(layer.id, p.layers)
          }
          const isCenteredTemplateText =
            layer.type === 'text' && layer.align === 'center' && layer.x === 0 && layer.w === p.preset.w
          const x = isCenteredTemplateText ? (p.preset.w - layer.w) / 2 : layer.x
          return { x, y: layer.y, w: layer.w, h: layer.h }
        }

        const boxes = new Map(children.map((layer) => [layer.id, getBox(layer)]))
        const left = Math.min(...children.map((l) => boxes.get(l.id)!.x))
        const right = Math.max(...children.map((l) => boxes.get(l.id)!.x + boxes.get(l.id)!.w))
        const top = Math.min(...children.map((l) => boxes.get(l.id)!.y))
        const bottom = Math.max(...children.map((l) => boxes.get(l.id)!.y + boxes.get(l.id)!.h))

        // Compute distribution maps if needed
        const isDistributeH = a.mode === 'distribute-h'
        const isDistributeV = a.mode === 'distribute-v'

        const sortedX = isDistributeH
          ? [...children].sort((c1, c2) => boxes.get(c1.id)!.x - boxes.get(c2.id)!.x)
          : []
        const sortedY = isDistributeV
          ? [...children].sort((c1, c2) => boxes.get(c1.id)!.y - boxes.get(c2.id)!.y)
          : []

        let distHGap = 0
        if (isDistributeH && children.length > 2) {
          const totalW = children.reduce((sum, c) => sum + boxes.get(c.id)!.w, 0)
          const span = right - left
          distHGap = (span - totalW) / (children.length - 1)
        }
        let distVGap = 0
        if (isDistributeV && children.length > 2) {
          const totalH = children.reduce((sum, c) => sum + boxes.get(c.id)!.h, 0)
          const span = bottom - top
          distVGap = (span - totalH) / (children.length - 1)
        }

        const distPositionsX = new Map<string, number>()
        if (isDistributeH) {
          let currX = left
          for (const c of sortedX) {
            distPositionsX.set(c.id, currX)
            currX += boxes.get(c.id)!.w + distHGap
          }
        }

        const distPositionsY = new Map<string, number>()
        if (isDistributeV) {
          let currY = top
          for (const c of sortedY) {
            distPositionsY.set(c.id, currY)
            currY += boxes.get(c.id)!.h + distVGap
          }
        }

        // Compute new positions and displacement deltas for each child
        const childDeltas = new Map<string, { dx: number; dy: number; newX: number; newY: number; w: number; h: number }>()
        for (const child of children) {
          const b = boxes.get(child.id)!
          let nx = b.x
          let ny = b.y

          if (a.mode === 'left') nx = left
          else if (a.mode === 'right') nx = right - b.w
          else if (a.mode === 'center') nx = (left + right - b.w) / 2
          else if (a.mode === 'distribute-h') nx = distPositionsX.get(child.id) ?? b.x

          if (a.mode === 'top') ny = top
          else if (a.mode === 'bottom') ny = bottom - b.h
          else if (a.mode === 'middle') ny = (top + bottom - b.h) / 2
          else if (a.mode === 'distribute-v') ny = distPositionsY.get(child.id) ?? b.y

          childDeltas.set(child.id, {
            dx: Math.round(nx) - b.x,
            dy: Math.round(ny) - b.y,
            newX: Math.round(nx),
            newY: Math.round(ny),
            w: Math.round(b.w),
            h: Math.round(b.h),
          })
        }

        // Sub-group descendants delta mapping
        const descendantDeltas = new Map<string, { dx: number; dy: number }>()
        for (const child of children) {
          if (child.type === 'group') {
            const desc = getDescendantLayers(child.id, p.layers)
            const delta = childDeltas.get(child.id)!
            for (const d of desc) {
              descendantDeltas.set(d.id, { dx: delta.dx, dy: delta.dy })
            }
          }
        }

        let updatedLayers = p.layers.map((layer) => {
          if (childDeltas.has(layer.id)) {
            const d = childDeltas.get(layer.id)!
            return {
              ...layer,
              x: d.newX,
              y: d.newY,
              w: layer.type === 'group' ? layer.w : d.w,
              h: layer.type === 'group' ? layer.h : d.h,
            }
          }
          if (descendantDeltas.has(layer.id)) {
            const d = descendantDeltas.get(layer.id)!
            return {
              ...layer,
              x: Math.round(layer.x + d.dx),
              y: Math.round(layer.y + d.dy),
            }
          }
          return layer
        })

        // Recompute the parent group bounds to fit the newly aligned children
        const newGroupBounds = computeGroupBounds(targetGroupId, updatedLayers)
        updatedLayers = updatedLayers.map((l) =>
          l.id === targetGroupId
            ? {
                ...l,
                x: newGroupBounds.x,
                y: newGroupBounds.y,
                w: newGroupBounds.w,
                h: newGroupBounds.h,
              }
            : l
        )

        return { ...state, project: touch({ ...p, layers: updatedLayers }) }
      }

      // Multi-selection alignment (or single element alignment to canvas)
      const selected = p.layers.filter((layer) => state.selectedIds.includes(layer.id))
      if (selected.length < 1) return state

      const getBox = (layer: Layer) => {
        if (a.measured && a.measured[layer.id]) {
          return a.measured[layer.id]
        }
        if (layer.type === 'group') {
          return computeGroupBounds(layer.id, p.layers)
        }
        const isCenteredTemplateText =
          layer.type === 'text' && layer.align === 'center' && layer.x === 0 && layer.w === p.preset.w
        const x = isCenteredTemplateText ? (p.preset.w - layer.w) / 2 : layer.x
        return { x, y: layer.y, w: layer.w, h: layer.h }
      }

      const boxes = new Map(selected.map((layer) => [layer.id, getBox(layer)]))
      const isSingle = selected.length === 1
      const left = isSingle ? 0 : Math.min(...selected.map((l) => boxes.get(l.id)!.x))
      const right = isSingle ? p.preset.w : Math.max(...selected.map((l) => boxes.get(l.id)!.x + boxes.get(l.id)!.w))
      const top = isSingle ? 0 : Math.min(...selected.map((l) => boxes.get(l.id)!.y))
      const bottom = isSingle ? p.preset.h : Math.max(...selected.map((l) => boxes.get(l.id)!.y + boxes.get(l.id)!.h))

      const isDistributeH = a.mode === 'distribute-h'
      const isDistributeV = a.mode === 'distribute-v'

      const sortedX = isDistributeH
        ? [...selected].sort((c1, c2) => boxes.get(c1.id)!.x - boxes.get(c2.id)!.x)
        : []
      const sortedY = isDistributeV
        ? [...selected].sort((c1, c2) => boxes.get(c1.id)!.y - boxes.get(c2.id)!.y)
        : []

      let distHGap = 0
      if (isDistributeH && selected.length > 2) {
        const totalW = selected.reduce((sum, c) => sum + boxes.get(c.id)!.w, 0)
        const span = right - left
        distHGap = (span - totalW) / (selected.length - 1)
      }
      let distVGap = 0
      if (isDistributeV && selected.length > 2) {
        const totalH = selected.reduce((sum, c) => sum + boxes.get(c.id)!.h, 0)
        const span = bottom - top
        distVGap = (span - totalH) / (selected.length - 1)
      }

      const distPositionsX = new Map<string, number>()
      if (isDistributeH) {
        let currX = left
        for (const c of sortedX) {
          distPositionsX.set(c.id, currX)
          currX += boxes.get(c.id)!.w + distHGap
        }
      }

      const distPositionsY = new Map<string, number>()
      if (isDistributeV) {
        let currY = top
        for (const c of sortedY) {
          distPositionsY.set(c.id, currY)
          currY += boxes.get(c.id)!.h + distVGap
        }
      }

      const groupDeltas = new Map<string, { dx: number; dy: number }>()

      let layers = p.layers.map((layer) => {
        if (!state.selectedIds.includes(layer.id)) return layer
        const b = boxes.get(layer.id)!
        let x = b.x
        let y = b.y

        if (a.mode === 'left') x = left
        else if (a.mode === 'right') x = right - b.w
        else if (a.mode === 'center') x = (left + right - b.w) / 2
        else if (a.mode === 'distribute-h') x = distPositionsX.get(layer.id) ?? b.x

        if (a.mode === 'top') y = top
        else if (a.mode === 'bottom') y = bottom - b.h
        else if (a.mode === 'middle') y = (top + bottom - b.h) / 2
        else if (a.mode === 'distribute-v') y = distPositionsY.get(layer.id) ?? b.y

        const newX = Math.round(x)
        const newY = Math.round(y)

        if (layer.type === 'group') {
          groupDeltas.set(layer.id, { dx: newX - b.x, dy: newY - b.y })
        }

        return {
          ...layer,
          x: newX,
          y: newY,
          w: layer.type === 'group' ? layer.w : Math.round(b.w),
          h: layer.type === 'group' ? layer.h : Math.round(b.h),
        }
      })

      // Shift descendants of any moved groups that were selected
      if (groupDeltas.size > 0) {
        layers = layers.map((layer) => {
          for (const [groupId, delta] of groupDeltas.entries()) {
            const desc = getDescendantLayers(groupId, p.layers)
            if (desc.some((d) => d.id === layer.id)) {
              return {
                ...layer,
                x: Math.round(layer.x + delta.dx),
                y: Math.round(layer.y + delta.dy),
              }
            }
          }
          return layer
        })
      }

      return { ...state, project: touch({ ...p, layers }) }
    }
    case 'nudge': {
      const targetId = state.selectedId || state.selectedIds[0] || null
      if (!targetId) return state

      // Determine all layers that should move together
      const allIds = new Set<string>()
      if (state.selectedIds.length > 1) {
        for (const id of state.selectedIds) {
          allIds.add(id)
          const desc = getDescendantLayers(id, p.layers)
          for (const d of desc) allIds.add(d.id)
        }
      } else {
        const target = p.layers.find((l) => l.id === targetId)
        if (!target || target.locked) return state
        allIds.add(target.id)
        if (target.type === 'group') {
          const desc = getDescendantLayers(target.id, p.layers)
          for (const d of desc) allIds.add(d.id)
        }
      }

      let layers = p.layers.map((l) => {
        if (!allIds.has(l.id) || l.locked) return l

        const isCenteredTemplateText =
          l.type === 'text' && l.align === 'center' && l.x === 0 && l.w === p.preset.w
        const measuredBox = a.measured?.[l.id]

        if (isCenteredTemplateText && measuredBox) {
          return {
            ...l,
            x: Math.round(measuredBox.x + a.dx),
            y: Math.round(measuredBox.y + a.dy),
            w: Math.round(measuredBox.w),
          }
        }

        return {
          ...l,
          x: Math.round(l.x + a.dx),
          y: Math.round(l.y + a.dy),
        }
      })

      // Recompute group bounds for any affected groups
      const affectedGroupIds = new Set<string>()
      for (const id of allIds) {
        const l = p.layers.find((layer) => layer.id === id)
        if (l?.type === 'group') affectedGroupIds.add(l.id)
        if (l?.groupId) affectedGroupIds.add(l.groupId)
      }

      if (affectedGroupIds.size > 0) {
        layers = layers.map((l) => {
          if (!affectedGroupIds.has(l.id) || l.type !== 'group') return l
          const bounds = computeGroupBounds(l.id, layers)
          return {
            ...l,
            x: bounds.x,
            y: bounds.y,
            w: bounds.w,
            h: bounds.h,
          }
        })
      }

      return {
        ...state,
        project: touch({ ...p, layers }),
      }
    }
    case 'tool':
      return { ...state, tool: a.tool }
    case 'addLayer':
      return { ...state, project: touch({ ...p, layers: [...p.layers, a.layer] }), selectedId: a.layer.id, selectedIds: [a.layer.id], tool: null }
    case 'updateLayer': {
      let layers = p.layers.map((l) => (l.id === a.id ? applyLayerUpdate(l, a.patch, state.time) : l))
      const targetLayer = layers.find((l) => l.id === a.id)
      if (targetLayer?.groupId) {
        let currGroupId: string | undefined = targetLayer.groupId
        while (currGroupId) {
          const bounds = computeGroupBounds(currGroupId, layers)
          const gId: string = currGroupId
          layers = layers.map((l) => (l.id === gId ? { ...l, ...bounds } : l))
          const parent = layers.find((l) => l.id === gId)
          currGroupId = parent?.groupId
        }
      }
      return { ...state, project: touch({ ...p, layers }) }
    }
    case 'updateLayers': {
      let layers = p.layers.map((l) => (a.ids.includes(l.id) ? applyLayerUpdate(l, a.patch, state.time) : l))
      const affectedGroupIds = new Set<string>()
      for (const id of a.ids) {
        const targetLayer = p.layers.find((layer) => layer.id === id)
        if (targetLayer?.groupId) affectedGroupIds.add(targetLayer.groupId)
      }
      for (const gid of affectedGroupIds) {
        let currGroupId: string | undefined = gid
        while (currGroupId) {
          const bounds = computeGroupBounds(currGroupId, layers)
          const gId: string = currGroupId
          layers = layers.map((l) => (l.id === gId ? { ...l, ...bounds } : l))
          const parent = layers.find((l) => l.id === gId)
          currGroupId = parent?.groupId
        }
      }
      return { ...state, project: touch({ ...p, layers }) }
    }
    case 'createGroup': {
      const targetIds = a.ids || state.selectedIds
      if (!targetIds || targetIds.length === 0) return state
      try {
        const { newLayers, groupLayer } = createGroupFromSelection(p.layers, targetIds, a.name, a.isComponent)
        return {
          ...state,
          project: touch({ ...p, layers: newLayers }),
          selectedId: groupLayer.id,
          selectedIds: [groupLayer.id],
        }
      } catch (err) {
        console.warn('Failed to create group:', err)
        return state
      }
    }
    case 'ungroup': {
      const { newLayers, unpackedIds } = ungroupLayer(p.layers, a.groupId)
      return {
        ...state,
        project: touch({ ...p, layers: newLayers }),
        selectedId: unpackedIds[0] || null,
        selectedIds: unpackedIds,
      }
    }
    case 'toggleGroupCollapse': {
      const layers = p.layers.map((l) => (l.id === a.groupId ? { ...l, collapsed: !l.collapsed } : l))
      return { ...state, project: touch({ ...p, layers }) }
    }
    case 'insertComponent': {
      const { rootLayer, childLayers } = instantiateComponent(a.component, p.preset)
      const layers = [...p.layers, ...childLayers, rootLayer]
      return {
        ...state,
        project: touch({ ...p, layers }),
        selectedId: rootLayer.id,
        selectedIds: [rootLayer.id],
        tool: null,
      }
    }
    case 'convertToComponent': {
      const layers = p.layers.map((l) => (l.id === a.groupId ? { ...l, isComponent: true, name: a.name || l.name } : l))
      return { ...state, project: touch({ ...p, layers }) }
    }
    case 'deleteLayer': {
      const layers = deleteLayerOrGroup(p.layers, a.id)
      const remainingIds = state.selectedIds.filter((id) => layers.some((l) => l.id === id))
      return {
        ...state,
        project: touch({ ...p, layers }),
        selectedId: layers.some((l) => l.id === state.selectedId) ? state.selectedId : remainingIds[0] || null,
        selectedIds: remainingIds,
        vectorEditingId: state.vectorEditingId === a.id ? null : state.vectorEditingId,
      }
    }
    case 'deleteLayers': {
      const layers = a.ids.reduce((current, id) => deleteLayerOrGroup(current, id), p.layers)
      const remainingIds = state.selectedIds.filter((id) => layers.some((l) => l.id === id))
      return {
        ...state,
        project: touch({ ...p, layers }),
        selectedId: remainingIds.at(-1) ?? null,
        selectedIds: remainingIds,
        vectorEditingId: a.ids.includes(state.vectorEditingId || '') ? null : state.vectorEditingId,
        tool: null,
      }
    }
    case 'replaceLayerWithLayers': {
      const idx = p.layers.findIndex((l) => l.id === a.targetId)
      if (idx === -1) return state
      const updatedLayers = [
        ...p.layers.slice(0, idx),
        ...a.newLayers,
        ...p.layers.slice(idx + 1),
      ]
      const nextSelectId = a.selectId || (a.newLayers.length > 0 ? a.newLayers[0].id : null)
      const nextSelectIds = a.selectIds || (nextSelectId ? [nextSelectId] : [])
      return {
        ...state,
        project: touch({ ...p, layers: updatedLayers }),
        selectedId: nextSelectId,
        selectedIds: nextSelectIds,
        vectorEditingId: null,
      }
    }
    case 'duplicate': {
  const targetIds = a.ids?.length ? a.ids : a.id ? [a.id] : []
  if (targetIds.length === 0) return state

  let layers = p.layers
  const newSelectedIds: string[] = []
  for (const targetId of targetIds) {
  const result = duplicateLayerOrGroup(layers, targetId)
  layers = result.newLayers
  newSelectedIds.push(result.newSelectedId)
  }

  return {
  ...state,
  project: touch({ ...p, layers }),
  selectedId: newSelectedIds.at(-1) ?? null,
  selectedIds: newSelectedIds,
  }
  }
    case 'reorder': {
      const layers = reorderSibling(p.layers, a.id, a.dir)
      return { ...state, project: touch({ ...p, layers }) }
    }
    case 'setBackground':
      return { ...state, project: touch({ ...p, background: a.bg }) }
    case 'setTime':
      return { ...state, time: a.time }
    case 'setPlaying':
      return { ...state, playing: a.playing }
    case 'setArtboardSnap':
      return { ...state, artboardSnap: a.enabled }
    case 'setVectorSnap':
      return { ...state, vectorSnap: a.enabled }
    case 'toggleVectorSnap':
      return { ...state, vectorSnap: !state.vectorSnap }
    case 'setSelectedAnchors':
      return { ...state, selectedAnchorIndices: a.indices }
    case 'toggleSelectedAnchor': {
      const exists = state.selectedAnchorIndices.includes(a.index)
      const next = exists
        ? state.selectedAnchorIndices.filter((i) => i !== a.index)
        : [...state.selectedAnchorIndices, a.index]
      return { ...state, selectedAnchorIndices: next }
    }
    case 'setAnchorMultiSelectMode':
      return { ...state, anchorMultiSelectMode: a.enabled }
    case 'toggleAnchorMultiSelectMode':
      return { ...state, anchorMultiSelectMode: !state.anchorMultiSelectMode }
    case 'setMode':
      return { ...state, project: touch({ ...p, mode: a.mode }) }
    case 'rename':
      return { ...state, project: touch({ ...p, name: a.name }) }
    case 'setDuration':
      return { ...state, project: touch({ ...p, duration: a.duration }) }
    case 'toggleTimeline':
      return { ...state, timelineOpen: a.open !== undefined ? a.open : !state.timelineOpen }
    case 'setTimelineOpen':
      return { ...state, timelineOpen: a.open }
    case 'toggleKeyframe': {
      const targetId = a.layerId || state.selectedId
      if (!targetId) return state
      const targetLayer = p.layers.find((l) => l.id === targetId)
      if (!targetLayer) return state

      const targetTime = a.time !== undefined ? a.time : state.time
      const hasKeyframes = Boolean(targetLayer.keyframes && targetLayer.keyframes.length > 0)

      let updatedLayers: Layer[]

      if (hasKeyframes) {
        const isAtKeyframe = hasKeyframeAt(targetLayer, targetTime, 60)
        if (isAtKeyframe) {
          // Remove keyframe at playhead
          const remaining = removeKeyframeAt(targetLayer, targetTime, 60)
          updatedLayers = p.layers.map((l) => {
            if (l.id !== targetId) return l
            return {
              ...l,
              keyframes: remaining.length > 0 ? remaining : undefined,
            }
          })
        } else {
          // Add keyframe at playhead with current interpolated state
          const nextKeyframes = upsertKeyframe(targetLayer, targetTime)
          updatedLayers = p.layers.map((l) => (l.id === targetId ? { ...l, keyframes: nextKeyframes } : l))
        }
      } else {
        // Convert existing animation presets into editable keyframes, ensuring a keyframe at targetTime
        let layerToConvert = targetLayer

        // If targetLayer is a group, ensure its visual coordinates and span match its descendant elements
        if (targetLayer.type === 'group') {
          const b = computeGroupBounds(targetLayer.id, p.layers)
          layerToConvert = {
            ...targetLayer,
            x: targetLayer.x || b.x,
            y: targetLayer.y || b.y,
            w: targetLayer.w || b.w,
            h: targetLayer.h || b.h,
            start: targetLayer.start ?? b.minStart,
            end: targetLayer.end ?? b.maxEnd,
          }
        }

        // If targetLayer is a centered text with template coordinates (x === 0 && (w === p.preset.w || w >= 800)),
        // normalize its x and w to its real visual artboard coordinates before converting
        if (
          targetLayer.type === 'text' &&
          targetLayer.align === 'center' &&
          targetLayer.x === 0 &&
          (targetLayer.w === p.preset.w || targetLayer.w >= 800)
        ) {
          let realW = targetLayer.w
          let realX = targetLayer.x
          if (typeof document !== 'undefined') {
            const node = document.querySelector(`[data-layer-id="${targetId}"]`) as HTMLElement | null
            if (node && node.offsetWidth > 0) {
              realW = node.offsetWidth
              realX = Math.round((p.preset.w - realW) / 2)
            }
          }
          if (realX === 0 && (realW === p.preset.w || realW >= 800)) {
            const estW = Math.max(40, Math.round((targetLayer.fontSize || 32) * (targetLayer.text || '').length * 0.55))
            realW = estW
            realX = Math.round((p.preset.w - realW) / 2)
          }
          layerToConvert = {
            ...targetLayer,
            x: realX,
            w: realW,
          }
        }

        const initialKeyframes = convertAnimationToKeyframes(layerToConvert, targetTime, p.preset)
        updatedLayers = p.layers.map((l) => {
          if (l.id !== targetId) return l
          return {
            ...layerToConvert,
            anim: 'none',
            inAnim: 'none',
            outAnim: 'none',
            keyframes: initialKeyframes,
          }
        })
      }

      return { ...state, project: touch({ ...p, layers: updatedLayers }) }
    }
    case 'moveKeyframe': {
      const targetLayer = p.layers.find((l) => l.id === a.layerId)
      if (!targetLayer || !targetLayer.keyframes) return state

      const clampedTime = Math.max(targetLayer.start, Math.min(targetLayer.end, Math.round(a.newTime)))
      const nextKeyframes = targetLayer.keyframes.map((kf) =>
        kf.id === a.keyframeId ? { ...kf, time: clampedTime } : kf
      )
      nextKeyframes.sort((x, y) => x.time - y.time)

      const layers = p.layers.map((l) => (l.id === a.layerId ? { ...l, keyframes: nextKeyframes } : l))
      return { ...state, project: touch({ ...p, layers }) }
    }
    case 'deleteKeyframe': {
      const targetLayer = p.layers.find((l) => l.id === a.layerId)
      if (!targetLayer || !targetLayer.keyframes) return state

      const nextKeyframes = targetLayer.keyframes.filter((kf) => kf.id !== a.keyframeId)
      const layers = p.layers.map((l) =>
        l.id === a.layerId
          ? { ...l, keyframes: nextKeyframes.length > 0 ? nextKeyframes : undefined }
          : l
      )
      return { ...state, project: touch({ ...p, layers }) }
    }
    case 'clearKeyframes': {
      const layers = p.layers.map((l) => (l.id === a.layerId ? { ...l, keyframes: undefined } : l))
      return { ...state, project: touch({ ...p, layers }) }
    }
    case 'startEyedropper':
      return {
        ...state,
        eyedropper: a.session,
        tool: null,
      }
    case 'updateEyedropperColor': {
      if (!state.eyedropper) return state
      const eyedropper = { ...state.eyedropper, currentColor: a.color }
      if (eyedropper.target === 'layer' && eyedropper.layerId && eyedropper.key) {
        const layers = p.layers.map((l) =>
          l.id === eyedropper.layerId ? { ...l, [eyedropper.key!]: a.color } : l
        )
        return { ...state, project: touch({ ...p, layers }), eyedropper }
      }
      if (eyedropper.target === 'background') {
        const background: Background = { type: 'color', value: a.color }
        return { ...state, project: touch({ ...p, background }), eyedropper }
      }
      return { ...state, eyedropper }
    }
    case 'cancelEyedropper': {
      if (!state.eyedropper) return state
      const { target, layerId, key, initialColor } = state.eyedropper
      let nextProject = p
      if (target === 'layer' && layerId && key) {
        const layers = p.layers.map((l) =>
          l.id === layerId ? { ...l, [key]: initialColor } : l
        )
        nextProject = touch({ ...p, layers })
      } else if (target === 'background') {
        const background: Background = { type: 'color', value: initialColor }
        nextProject = touch({ ...p, background })
      }
      return {
        ...state,
        project: nextProject,
        eyedropper: null,
        tool: null,
      }
    }
    case 'finishEyedropper': {
      if (!state.eyedropper) return state
      return {
        ...state,
        eyedropper: null,
        tool: null,
      }
    }
    default:
      return state
  }
}

const MAX_HISTORY = 60

function reducer(state: State, a: Action): State {
  if (a.t === 'undo') {
    if (state.past.length === 0) return state
    const prev = state.past[state.past.length - 1]
    const newPast = state.past.slice(0, -1)
    const currentEntry: HistoryEntry = {
      project: state.project,
      selectedId: state.selectedId,
      selectedIds: state.selectedIds,
    }
    const newFuture = [...state.future, currentEntry]

    const validIds = new Set(prev.project.layers.map((l) => l.id))
    const newSelectedIds = prev.selectedIds.filter((id) => validIds.has(id))
    const newSelectedId =
      prev.selectedId && validIds.has(prev.selectedId)
        ? prev.selectedId
        : newSelectedIds[0] ?? null

    return {
      ...state,
      project: prev.project,
      selectedId: newSelectedId,
      selectedIds: newSelectedIds,
      past: newPast,
      future: newFuture,
      _lastHistoryTime: 0,
      _lastHistoryKey: undefined,
    }
  }

  if (a.t === 'redo') {
    if (state.future.length === 0) return state
    const next = state.future[state.future.length - 1]
    const newFuture = state.future.slice(0, -1)
    const currentEntry: HistoryEntry = {
      project: state.project,
      selectedId: state.selectedId,
      selectedIds: state.selectedIds,
    }
    const newPast = [...state.past.slice(-(MAX_HISTORY - 1)), currentEntry]

    const validIds = new Set(next.project.layers.map((l) => l.id))
    const newSelectedIds = next.selectedIds.filter((id) => validIds.has(id))
    const newSelectedId =
      next.selectedId && validIds.has(next.selectedId)
        ? next.selectedId
        : newSelectedIds[0] ?? null

    return {
      ...state,
      project: next.project,
      selectedId: newSelectedId,
      selectedIds: newSelectedIds,
      past: newPast,
      future: newFuture,
      _lastHistoryTime: 0,
      _lastHistoryKey: undefined,
    }
  }

  if (a.t === 'checkpoint') {
    return {
      ...state,
      _lastHistoryTime: 0,
      _lastHistoryKey: undefined,
    }
  }

  // Pure UI actions that do not change state.project
  if (
    a.t === 'select' ||
    a.t === 'toggleSelect' ||
    a.t === 'tool' ||
    a.t === 'setTime' ||
    a.t === 'setPlaying' ||
    a.t === 'setArtboardSnap' ||
    a.t === 'toggleTimeline' ||
    a.t === 'setTimelineOpen' ||
    a.t === 'setImagePositioningId' ||
    a.t === 'setAnimationSide' ||
    a.t === 'startEyedropper' ||
    a.t === 'finishEyedropper'
  ) {
    return innerReducer(state, a)
  }

  // Mutating action: run inner reducer to calculate new state
  const nextState = innerReducer(state, a)
  if (nextState.project === state.project) {
    return nextState
  }

  const now = Date.now()
  const isContinuous =
    a.t === 'updateLayer' || a.t === 'updateLayers' || a.t === 'nudge' || a.t === 'moveKeyframe' || a.t === 'updateEyedropperColor'

  const actionKey =
    a.t === 'updateLayer'
      ? `updateLayer:${a.id}`
      : a.t === 'updateEyedropperColor'
      ? 'updateEyedropperColor'
      : a.t === 'updateLayers'
      ? `updateLayers:${a.ids.slice().sort().join(',')}`
      : a.t === 'nudge'
      ? 'nudge'
      : a.t === 'moveKeyframe'
      ? `moveKeyframe:${a.layerId}:${a.keyframeId}`
      : undefined

  const isSameTick = Boolean(state._lastHistoryTime && now - state._lastHistoryTime < 60)
  const isCoalescedStream = Boolean(
    isContinuous &&
      state._lastHistoryTime &&
      now - state._lastHistoryTime < 600 &&
      (state._lastHistoryKey === actionKey || isSameTick),
  )

  if (isCoalescedStream) {
    return {
      ...nextState,
      past: state.past,
      future: [],
      _lastHistoryTime: now,
      _lastHistoryKey: actionKey || state._lastHistoryKey,
    }
  }

  const snapshot: HistoryEntry = {
    project: state.project,
    selectedId: state.selectedId,
    selectedIds: state.selectedIds,
  }

  return {
    ...nextState,
    past: [...state.past.slice(-(MAX_HISTORY - 1)), snapshot],
    future: [],
    _lastHistoryTime: isContinuous ? now : 0,
    _lastHistoryKey: isContinuous ? actionKey : undefined,
  }
}

interface Ctx extends State {
  mode: 'static' | 'animated'
  selected: Layer | null
  selectedIds: string[]
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  checkpoint: () => void
  select: (id: string | null, additive?: boolean, ids?: string[]) => void
  toggleSelect: (id: string) => void
  alignSelected: (mode: AlignMode, measured?: Record<string, { x: number; y: number; w: number; h: number }>, targetGroupId?: string) => void
  openTool: (tool: string | null) => void
  addLayer: (type: LayerType, extra?: Partial<Layer>) => void
  updateLayer: (id: string, patch: Partial<Layer>) => void
  updateLayers: (ids: string[], patch: Partial<Layer>) => void
  deleteLayer: (id: string) => void
  deleteLayers: (ids: string[]) => void
  duplicate: (id: string, ids?: string[]) => void
  reorder: (id: string, dir: number) => void
  createGroup: (ids?: string[], name?: string, isComponent?: boolean) => void
  ungroup: (groupId: string) => void
  toggleGroupCollapse: (groupId: string) => void
  insertComponent: (component: ComponentItem) => void
  saveAsComponent: (name: string, targetId?: string) => ComponentItem | null
  setBackground: (bg: Background) => void
  setTime: (t: number) => void
  setPlaying: (v: boolean) => void
  setArtboardSnap: (v: boolean) => void
  vectorSnap: boolean
  setVectorSnap: (v: boolean) => void
  toggleVectorSnap: () => void
  selectedAnchorIndices: number[]
  setSelectedAnchors: (indices: number[]) => void
  toggleSelectedAnchor: (index: number) => void
  anchorMultiSelectMode: boolean
  setAnchorMultiSelectMode: (enabled: boolean) => void
  toggleAnchorMultiSelectMode: () => void
  setMode: (m: 'static' | 'animated') => void
  rename: (n: string) => void
  setDuration: (d: number) => void
  toggleTimeline: (open?: boolean) => void
  setTimelineOpen: (open: boolean) => void
  imagePositioningId: string | null
  setImagePositioningId: (id: string | null) => void
  vectorEditingId: string | null
  setVectorEditingId: (id: string | null) => void
  setAnimationSide: (side: 'in' | 'out') => void
  nudge: (dx: number, dy: number, measured?: Record<string, { x: number; y: number; w: number; h: number }>) => void
  toggleKeyframe: (layerId?: string, time?: number) => void
  moveKeyframe: (layerId: string, keyframeId: string, newTime: number) => void
  deleteKeyframe: (layerId: string, keyframeId: string) => void
  clearKeyframes: (layerId: string) => void
  replaceLayerWithLayers: (targetId: string, newLayers: Layer[], selectId?: string, selectIds?: string[]) => void
  eyedropper: EyedropperSession | null
  startEyedropper: (session: EyedropperSession) => void
  updateEyedropperColor: (color: string) => void
  cancelEyedropper: () => void
  finishEyedropper: () => void
  convertTextToVectors: (
    targetId: string,
    mode?: 'single' | 'group',
    options?: { preserveLigatures?: boolean; simplifyPaths?: boolean }
  ) => Promise<boolean>
}

const EditorCtx = createContext<Ctx | null>(null)

export function EditorProvider({ project, children }: { project: Project; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    project,
    past: [],
    future: [],
    selectedId: null,
    selectedIds: [],
    tool: null,
    eyedropper: null,
    time: 0,
    playing: false,
    artboardSnap: true,
    vectorSnap: true,
    selectedAnchorIndices: [0],
    anchorMultiSelectMode: false,
    timelineOpen: false,
    imagePositioningId: null,
    vectorEditingId: null,
    animationSide: 'in',
    _lastHistoryTime: 0,
    _lastHistoryKey: undefined,
  })

  const undo = useCallback(() => dispatch({ t: 'undo' }), [])
  const redo = useCallback(() => dispatch({ t: 'redo' }), [])
  const checkpoint = useCallback(() => dispatch({ t: 'checkpoint' }), [])

  const select = useCallback((id: string | null, additive = false, ids?: string[]) => dispatch({ t: 'select', id, additive, ids }), [])
  const toggleSelect = useCallback((id: string) => dispatch({ t: 'toggleSelect', id }), [])
  const alignSelected = useCallback((mode: AlignMode, measured?: Record<string, { x: number; y: number; w: number; h: number }>, targetGroupId?: string) => dispatch({ t: 'alignSelected', mode, measured, targetGroupId }), [])
  const openTool = useCallback((tool: string | null) => dispatch({ t: 'tool', tool }), [])
  const setAnimationSide = useCallback((side: 'in' | 'out') => dispatch({ t: 'setAnimationSide', side }), [])
  const updateLayer = useCallback((id: string, patch: Partial<Layer>) => dispatch({ t: 'updateLayer', id, patch }), [])
  const updateLayers = useCallback((ids: string[], patch: Partial<Layer>) => dispatch({ t: 'updateLayers', ids, patch }), [])
  const deleteLayer = useCallback((id: string) => dispatch({ t: 'deleteLayer', id }), [])
  const deleteLayers = useCallback((ids: string[]) => dispatch({ t: 'deleteLayers', ids }), [])
  const duplicate = useCallback((id: string, ids?: string[]) => dispatch({ t: 'duplicate', id, ids }), [])
  const reorder = useCallback((id: string, dir: number) => dispatch({ t: 'reorder', id, dir }), [])
  const createGroup = useCallback((ids?: string[], name?: string, isComponent = false) => dispatch({ t: 'createGroup', ids, name, isComponent }), [])
  const ungroup = useCallback((groupId: string) => dispatch({ t: 'ungroup', groupId }), [])
  const toggleGroupCollapse = useCallback((groupId: string) => dispatch({ t: 'toggleGroupCollapse', groupId }), [])
  const insertComponent = useCallback((component: ComponentItem) => dispatch({ t: 'insertComponent', component }), [])

  const saveAsComponent = useCallback((name: string, targetId?: string): ComponentItem | null => {
    const id = targetId || state.selectedId
    if (!id) return null
    let group = state.project.layers.find((l) => l.id === id)

    // If target is not already a group, but we have multiple items selected, group them first
    if (!group || group.type !== 'group') {
      if (state.selectedIds.length > 0) {
        const { newLayers, groupLayer } = createGroupFromSelection(state.project.layers, state.selectedIds, name, true)
        const descendants = getDescendantLayers(groupLayer.id, newLayers)
        const saved = saveComponentToLibrary(name, groupLayer, descendants, state.project.preset)
        dispatch({ t: 'createGroup', ids: state.selectedIds, name, isComponent: true })
        return saved
      }
      return null
    }

    const descendants = getDescendantLayers(group.id, state.project.layers)
    const saved = saveComponentToLibrary(name, group, descendants, state.project.preset)
    dispatch({ t: 'convertToComponent', groupId: group.id, name })
    return saved
  }, [state.selectedId, state.selectedIds, state.project.layers, state.project.preset])

  const setBackground = useCallback((bg: Background) => dispatch({ t: 'setBackground', bg }), [])
  const setTime = useCallback((t: number) => dispatch({ t: 'setTime', time: t }), [])
  const setPlaying = useCallback((v: boolean) => dispatch({ t: 'setPlaying', playing: v }), [])
  const setArtboardSnap = useCallback((v: boolean) => dispatch({ t: 'setArtboardSnap', enabled: v }), [])
  const setVectorSnap = useCallback((enabled: boolean) => dispatch({ t: 'setVectorSnap', enabled }), [])
  const toggleVectorSnap = useCallback(() => dispatch({ t: 'toggleVectorSnap' }), [])
  const setSelectedAnchors = useCallback((indices: number[]) => dispatch({ t: 'setSelectedAnchors', indices }), [])
  const toggleSelectedAnchor = useCallback((index: number) => dispatch({ t: 'toggleSelectedAnchor', index }), [])
  const setAnchorMultiSelectMode = useCallback((enabled: boolean) => dispatch({ t: 'setAnchorMultiSelectMode', enabled }), [])
  const toggleAnchorMultiSelectMode = useCallback(() => dispatch({ t: 'toggleAnchorMultiSelectMode' }), [])
  const setMode = useCallback((m: 'static' | 'animated') => dispatch({ t: 'setMode', mode: m }), [])
  const rename = useCallback((n: string) => dispatch({ t: 'rename', name: n }), [])
  const setDuration = useCallback((d: number) => dispatch({ t: 'setDuration', duration: d }), [])
  const toggleTimeline = useCallback((open?: boolean) => dispatch({ t: 'toggleTimeline', open }), [])
  const setTimelineOpen = useCallback((open: boolean) => dispatch({ t: 'setTimelineOpen', open }), [])
  const setImagePositioningId = useCallback((id: string | null) => dispatch({ t: 'setImagePositioningId', id }), [])
  const setVectorEditingId = useCallback((id: string | null) => dispatch({ t: 'setVectorEditingId', id }), [])
  const nudge = useCallback(
    (dx: number, dy: number, measured?: Record<string, { x: number; y: number; w: number; h: number }>) =>
      dispatch({ t: 'nudge', dx, dy, measured }),
    [],
  )
  const toggleKeyframe = useCallback((layerId?: string, time?: number) => dispatch({ t: 'toggleKeyframe', layerId, time }), [])
  const moveKeyframe = useCallback((layerId: string, keyframeId: string, newTime: number) => dispatch({ t: 'moveKeyframe', layerId, keyframeId, newTime }), [])
  const deleteKeyframe = useCallback((layerId: string, keyframeId: string) => dispatch({ t: 'deleteKeyframe', layerId, keyframeId }), [])
  const clearKeyframes = useCallback((layerId: string) => dispatch({ t: 'clearKeyframes', layerId }), [])

  const startEyedropper = useCallback((session: EyedropperSession) => dispatch({ t: 'startEyedropper', session }), [])
  const updateEyedropperColor = useCallback((color: string) => dispatch({ t: 'updateEyedropperColor', color }), [])
  const cancelEyedropper = useCallback(() => dispatch({ t: 'cancelEyedropper' }), [])
  const finishEyedropper = useCallback(() => dispatch({ t: 'finishEyedropper' }), [])

  const replaceLayerWithLayers = useCallback(
    (targetId: string, newLayers: Layer[], selectId?: string, selectIds?: string[]) => {
      dispatch({ t: 'replaceLayerWithLayers', targetId, newLayers, selectId, selectIds })
    },
    [],
  )

  const convertTextToVectors = useCallback(
    async (
      targetId: string,
      mode: 'single' | 'group' = 'single',
      options?: { preserveLigatures?: boolean; simplifyPaths?: boolean }
    ): Promise<boolean> => {
      const layer = state.project.layers.find((l) => l.id === targetId)
      if (!layer || layer.type !== 'text') return false
      try {
        const res = await convertTextLayerToVectors(layer, mode, options)
        if (res.mode === 'single' && res.singleLayer) {
          dispatch({
            t: 'replaceLayerWithLayers',
            targetId,
            newLayers: [res.singleLayer],
            selectId: res.singleLayer.id,
            selectIds: [res.singleLayer.id],
          })
          return true
        } else if (res.mode === 'group' && res.groupLayer && res.childLayers) {
          dispatch({
            t: 'replaceLayerWithLayers',
            targetId,
            newLayers: [...res.childLayers, res.groupLayer],
            selectId: res.groupLayer.id,
            selectIds: [res.groupLayer.id],
          })
          return true
        }
        return false
      } catch (err) {
        console.error('[convertTextToVectors] Error converting text to vectors:', err)
        return false
      }
    },
    [state.project.layers],
  )

  const addLayer = useCallback(
    (type: LayerType, extra?: Partial<Layer>) => {
      const layer = createLayer(type, state.project.preset, extra)
      layer.end = state.project.duration
      dispatch({ t: 'addLayer', layer })
    },
    [state.project.preset, state.project.duration],
  )

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      mode: state.project.mode,
      selected: state.project.layers.find((l) => l.id === state.selectedId) || null,
      selectedIds: state.selectedIds,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      undo,
      redo,
      checkpoint,
      select,
      toggleSelect,
      alignSelected,
      openTool,
      addLayer,
      updateLayer,
      updateLayers,
      deleteLayer,
      deleteLayers,
      duplicate,
      reorder,
      createGroup,
      ungroup,
      toggleGroupCollapse,
      insertComponent,
      saveAsComponent,
      setBackground,
      setTime,
      setPlaying,
      setArtboardSnap,
      vectorSnap: state.vectorSnap ?? true,
      setVectorSnap,
      toggleVectorSnap,
      selectedAnchorIndices: state.selectedAnchorIndices ?? [0],
      setSelectedAnchors,
      toggleSelectedAnchor,
      anchorMultiSelectMode: state.anchorMultiSelectMode ?? false,
      setAnchorMultiSelectMode,
      toggleAnchorMultiSelectMode,
      setMode,
      rename,
      setDuration,
      toggleTimeline,
      setTimelineOpen,
      setImagePositioningId,
      vectorEditingId: state.vectorEditingId ?? null,
      setVectorEditingId,
      setAnimationSide,
      nudge,
      toggleKeyframe,
      moveKeyframe,
      deleteKeyframe,
      clearKeyframes,
      replaceLayerWithLayers,
      convertTextToVectors,
      eyedropper: state.eyedropper,
      startEyedropper,
      updateEyedropperColor,
      cancelEyedropper,
      finishEyedropper,
    }),
    [
      state,
      undo,
      redo,
      checkpoint,
      select,
      toggleSelect,
      alignSelected,
      openTool,
      addLayer,
      updateLayer,
      updateLayers,
      deleteLayer,
      deleteLayers,
      duplicate,
      reorder,
      createGroup,
      ungroup,
      toggleGroupCollapse,
      insertComponent,
      saveAsComponent,
      setBackground,
      setTime,
      setPlaying,
      setArtboardSnap,
      setVectorSnap,
      toggleVectorSnap,
      setSelectedAnchors,
      toggleSelectedAnchor,
      setAnchorMultiSelectMode,
      toggleAnchorMultiSelectMode,
      setMode,
      rename,
      setDuration,
      toggleTimeline,
      setTimelineOpen,
      setImagePositioningId,
      setVectorEditingId,
      setAnimationSide,
      nudge,
      toggleKeyframe,
      moveKeyframe,
      deleteKeyframe,
      clearKeyframes,
      replaceLayerWithLayers,
      convertTextToVectors,
      startEyedropper,
      updateEyedropperColor,
      cancelEyedropper,
      finishEyedropper,
    ],
  )

  return <EditorCtx.Provider value={value}>{children}</EditorCtx.Provider>
}

export function useEditor() {
  const ctx = useContext(EditorCtx)
  if (!ctx) throw new Error('useEditor must be used within EditorProvider')
  return ctx
}
