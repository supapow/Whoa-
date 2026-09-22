import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Pipette, Check, X } from 'lucide-react'
import { useEditor } from '#/store/editor'
import type { Background, Layer } from '#/types'

function parseToHex(color: string | null | undefined): string | null {
  if (!color || color === 'none' || color === 'transparent') return null
  const trimmed = color.trim()
  if (trimmed.startsWith('#')) {
    if (trimmed.length === 4) {
      return ('#' + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3]).toUpperCase()
    }
    return trimmed.slice(0, 7).toUpperCase()
  }
  const match = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (match) {
    const r = parseInt(match[1], 10)
    const g = parseInt(match[2], 10)
    const b = parseInt(match[3], 10)
    return ('#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')).toUpperCase()
  }
  return null
}

function interpolateHex(hex1: string, hex2: string, t: number): string {
  const r1 = parseInt(hex1.slice(1, 3), 16) || 0
  const g1 = parseInt(hex1.slice(3, 5), 16) || 0
  const b1 = parseInt(hex1.slice(5, 7), 16) || 0

  const r2 = parseInt(hex2.slice(1, 3), 16) || 0
  const g2 = parseInt(hex2.slice(3, 5), 16) || 0
  const b2 = parseInt(hex2.slice(5, 7), 16) || 0

  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)

  return ('#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')).toUpperCase()
}

function sampleColorAtPoint(
  clientX: number,
  clientY: number,
  artboardEl: HTMLElement | null,
  layers: Layer[],
  background: Background
): string {
  // 1. Elements from point
  const elements = document.elementsFromPoint(clientX, clientY)
  for (const el of elements) {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue
    if (el.closest('#color-loupe-overlay') || el.closest('#circular-color-loupe')) continue

    // Layer element
    const layerContainer = el.closest('[data-layer-id]')
    if (layerContainer) {
      const layerId = layerContainer.getAttribute('data-layer-id')
      const layer = layers.find((l) => l.id === layerId)

      // Check SVG fill / stroke
      if (el instanceof SVGElement) {
        const fill = el.getAttribute('fill') || window.getComputedStyle(el).fill
        const hexFill = parseToHex(fill)
        if (hexFill) return hexFill

        const stroke = el.getAttribute('stroke') || window.getComputedStyle(el).stroke
        const hexStroke = parseToHex(stroke)
        if (hexStroke) return hexStroke
      }

      // Check computed background color
      const cs = window.getComputedStyle(el)
      const bg = parseToHex(cs.backgroundColor)
      if (bg) return bg

      if (layer) {
        if (layer.type === 'text') {
          const hex = parseToHex(layer.color || layer.fill)
          if (hex) return hex
        }
        if (layer.type === 'shape') {
          const hex = parseToHex(layer.fill || layer.color)
          if (hex) return hex
        }
        if (layer.type === 'path') {
          const hex = parseToHex(layer.fill !== 'transparent' ? layer.fill : layer.stroke)
          if (hex) return hex
        }
      }

      // Check computed text color if has text content
      const textHex = parseToHex(cs.color)
      if (textHex && el.textContent?.trim()) return textHex
    }

    // Direct background check on element
    const cs = window.getComputedStyle(el)
    const bg = parseToHex(cs.backgroundColor)
    if (bg) return bg
  }

  // 2. Artboard background
  if (background.type === 'color') {
    const hex = parseToHex(background.value)
    if (hex) return hex
  } else if (background.type === 'gradient') {
    if (artboardEl) {
      const rect = artboardEl.getBoundingClientRect()
      const px = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const py = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      const progress = (px + py) / 2
      const gradColors = background.value.match(/#[0-9a-fA-F]{6}|rgba?\([^)]+\)/g)
      if (gradColors && gradColors.length >= 2) {
        const c1 = parseToHex(gradColors[0])
        const c2 = parseToHex(gradColors[gradColors.length - 1])
        if (c1 && c2) {
          return interpolateHex(c1, c2, progress)
        }
      }
    }
  }

  return '#007AFF'
}

export default function ColorLoupe() {
  const { eyedropper, updateEyedropperColor, cancelEyedropper, finishEyedropper, project } = useEditor()
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null)
  const [isHolding, setIsHolding] = useState(false)
  const [artboardSnapshot, setArtboardSnapshot] = useState<{
    html: string
    rect: { left: number; top: number; width: number; height: number }
    bg: string
  } | null>(null)

  const activeColor = eyedropper?.currentColor || '#007AFF'
  const isHoldingRef = useRef(false)
  isHoldingRef.current = isHolding

  // Capture artboard snapshot when eyedropper opens or layers update
  useEffect(() => {
    if (!eyedropper) return
    const updateSnapshot = () => {
      const artboardEl = document.querySelector('[data-testid="artboard"]') as HTMLElement | null
      if (artboardEl) {
        const r = artboardEl.getBoundingClientRect()
        setArtboardSnapshot({
          html: artboardEl.innerHTML,
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
          bg: window.getComputedStyle(artboardEl).background || '',
        })
      }
    }
    updateSnapshot()
  }, [eyedropper, project.layers, project.background])

  const handlePointer = useCallback(
    (clientX: number, clientY: number) => {
      setTouchPos({ x: clientX, y: clientY })
      const artboardEl = document.querySelector('[data-testid="artboard"]') as HTMLElement | null
      const sampled = sampleColorAtPoint(clientX, clientY, artboardEl, project.layers, project.background)
      if (sampled) {
        updateEyedropperColor(sampled)
      }
    },
    [project.layers, project.background, updateEyedropperColor]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      setIsHolding(true)
      handlePointer(e.clientX, e.clientY)
    },
    [handlePointer]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isHoldingRef.current) return
      e.preventDefault()
      e.stopPropagation()
      handlePointer(e.clientX, e.clientY)
    },
    [handlePointer]
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      setIsHolding(false)
      try {
        navigator.vibrate?.(15)
      } catch {}
      // User lets go: choose current color in the picker and close
      finishEyedropper()
    },
    [finishEyedropper]
  )

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      setIsHolding(false)
      finishEyedropper()
    },
    [finishEyedropper]
  )

  // Allow Escape key to cancel
  useEffect(() => {
    if (!eyedropper) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelEyedropper()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [eyedropper, cancelEyedropper])

  if (!eyedropper) return null

  // Loupe dimensions
  const LOUPE_SIZE = 124
  const LOUPE_RADIUS = LOUPE_SIZE / 2
  const ZOOM = 2.8

  // Calculate loupe position offset to left or right of finger
  let loupeX = 0
  let loupeY = 0
  let isRightSide = true

  if (touchPos) {
    isRightSide = touchPos.x <= window.innerWidth / 2
    // If on left half of screen, place magnifier to the right of finger (+85px)
    // If on right half of screen, place magnifier to the left of finger (-85px)
    const offsetX = isRightSide ? 85 : -85
    const offsetY = -95

    loupeX = touchPos.x + offsetX
    loupeY = touchPos.y + offsetY

    // Clamp within viewport
    const margin = LOUPE_RADIUS + 12
    loupeX = Math.max(margin, Math.min(window.innerWidth - margin, loupeX))
    if (loupeY - LOUPE_RADIUS < 65) {
      // If near the top, flip below the finger
      loupeY = touchPos.y + 95
    }
  }

  // Artboard position for magnifying lens
  let artX = 0
  let artY = 0
  if (touchPos && artboardSnapshot?.rect) {
    artX = touchPos.x - artboardSnapshot.rect.left
    artY = touchPos.y - artboardSnapshot.rect.top
  }

  return (
    <div
      id="color-loupe-overlay"
      data-testid="color-loupe-overlay"
      className="fixed inset-0 z-50 touch-none select-none cursor-crosshair overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top Floating Control Bar */}
      <div
        id="color-loupe-header"
        data-testid="color-loupe-header"
        className="pointer-events-auto absolute top-3 inset-x-3 max-w-md mx-auto flex items-center justify-between gap-2.5 rounded-2xl bg-black/85 px-4 py-2.5 shadow-2xl backdrop-blur-xl border border-white/20 z-50 animate-in fade-in slide-in-from-top-4"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-accent/20 text-accent ring-1 ring-accent/40 shrink-0">
            <Pipette className="h-4 w-4 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white">Color Loupe</span>
              <span
                id="loupe-hex-display"
                data-testid="loupe-hex-display"
                className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-mono font-bold text-white tracking-wider"
              >
                {activeColor}
              </span>
            </div>
            <p className="text-[10px] text-white/60 truncate">
              {isHolding ? 'Release finger to choose color' : 'Tap & drag to sample • Release to choose'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            id="loupe-color-preview-circle"
            data-testid="loupe-color-preview-circle"
            className="h-7 w-7 rounded-full border-2 border-white shadow-sm ring-1 ring-black/30 shrink-0"
            style={{ backgroundColor: activeColor }}
            title={`Color: ${activeColor}`}
          />

          <button
            type="button"
            id="loupe-cancel-btn"
            data-testid="loupe-cancel-btn"
            onClick={cancelEyedropper}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white active:scale-95 transition-all cursor-pointer"
            title="Cancel"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>

          <button
            type="button"
            id="loupe-done-btn"
            data-testid="loupe-done-btn"
            onClick={finishEyedropper}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-accent text-white text-xs font-bold shadow-md hover:bg-accent/90 active:scale-95 transition-all cursor-pointer"
            title="Apply Color"
            aria-label="Apply Color"
          >
            <Check className="h-3.5 w-3.5 stroke-[3]" />
            <span>Done</span>
          </button>
        </div>
      </div>

      {/* Visual Circular Magnifier attached to finger */}
      {touchPos && (
        <>
          {/* Touch Point Target Ring on Finger */}
          <div
            id="loupe-touch-target"
            data-testid="loupe-touch-target"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-40 transition-opacity"
            style={{ left: touchPos.x, top: touchPos.y, opacity: isHolding ? 1 : 0.7 }}
          >
            <div className="h-8 w-8 rounded-full border-2 border-white/80 shadow-md ring-1 ring-black/40 flex items-center justify-center">
              <div
                className="h-2 w-2 rounded-full border border-white/90 shadow-xs"
                style={{ backgroundColor: activeColor }}
              />
            </div>
          </div>

          {/* Optical Connector Line */}
          <svg
            className="pointer-events-none absolute inset-0 w-full h-full z-40"
            style={{ opacity: isHolding ? 0.6 : 0.3 }}
          >
            <line
              x1={touchPos.x}
              y1={touchPos.y}
              x2={loupeX}
              y2={loupeY}
              stroke="white"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          </svg>

          {/* Circular Magnifier (Loupe) */}
          <div
            id="circular-color-loupe"
            data-testid="circular-color-loupe"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col items-center"
            style={{
              left: loupeX,
              top: loupeY,
              filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.5))',
            }}
          >
            {/* The 124px Circular Lens */}
            <div
              className="relative rounded-full overflow-hidden transition-colors"
              style={{
                width: LOUPE_SIZE,
                height: LOUPE_SIZE,
                borderColor: activeColor,
                borderWidth: '8px',
                borderStyle: 'solid',
                backgroundColor: '#1E1E24',
                boxShadow: '0 0 0 2px rgba(255,255,255,0.95), 0 0 0 3px rgba(0,0,0,0.3)',
              }}
            >
              {/* Magnified Artboard Mirror */}
              {artboardSnapshot && (
                <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
                  <div
                    style={{
                      position: 'absolute',
                      width: `${artboardSnapshot.rect.width}px`,
                      height: `${artboardSnapshot.rect.height}px`,
                      left: 0,
                      top: 0,
                      transformOrigin: '0 0',
                      transform: `translate(${LOUPE_RADIUS - artX * ZOOM}px, ${LOUPE_RADIUS - artY * ZOOM}px) scale(${ZOOM})`,
                      background: artboardSnapshot.bg,
                    }}
                    dangerouslySetInnerHTML={{ __html: artboardSnapshot.html }}
                  />
                </div>
              )}

              {/* Precision Reticle Crosshair */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {/* Concentric Guide Ring */}
                <div className="absolute inset-3 rounded-full border border-white/20" />

                {/* Horizontal Crosshair */}
                <div className="absolute left-0 right-0 h-px bg-white/70 shadow-xs" />

                {/* Vertical Crosshair */}
                <div className="absolute top-0 bottom-0 w-px bg-white/70 shadow-xs" />

                {/* Center Sample Target Box */}
                <div
                  id="loupe-center-target"
                  data-testid="loupe-center-target"
                  className="relative z-10 w-3.5 h-3.5 border-2 border-white shadow-md ring-1 ring-black/70 transition-colors"
                  style={{ backgroundColor: activeColor }}
                />
              </div>
            </div>

            {/* Attached Hex Code Pill */}
            <div
              id="loupe-hex-pill"
              data-testid="loupe-hex-pill"
              className="mt-2 flex items-center gap-1.5 rounded-full bg-black/90 px-3 py-1 text-[11px] font-mono font-bold text-white shadow-xl backdrop-blur-md border border-white/20 whitespace-nowrap"
            >
              <div
                className="h-2.5 w-2.5 rounded-full border border-white/40 ring-1 ring-black/30 shrink-0"
                style={{ backgroundColor: activeColor }}
              />
              <span>{activeColor}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
