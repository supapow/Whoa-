import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Pipette, Check, X } from 'lucide-react'
import { useEditor } from '#/store/editor'
import type { Background, Layer, Preset } from '#/types'
import { parseImagePosition } from '#/lib/imagePosition'

interface ImageCanvasEntry {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}

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

function samplePixelFromEntry(entry: ImageCanvasEntry, px: number, py: number): string | null {
  const x = Math.max(0, Math.min(entry.width - 1, Math.floor(px)))
  const y = Math.max(0, Math.min(entry.height - 1, Math.floor(py)))
  try {
    const d = entry.ctx.getImageData(x, y, 1, 1).data
    if (d[3] > 8) {
      return ('#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')).toUpperCase()
    }
  } catch {
    // If reading failed (e.g. tainted)
  }
  return null
}

function getPixelCoordForImageLayer(
  layer: Layer,
  unrotX: number,
  unrotY: number,
  entry: ImageCanvasEntry
): { px: number; py: number } | null {
  if (layer.crop) {
    if (unrotX < 0 || unrotX > layer.w || unrotY < 0 || unrotY > layer.h) return null
    const relX = unrotX - layer.crop.x
    const relY = unrotY - layer.crop.y
    if (relX < 0 || relX > layer.crop.w || relY < 0 || relY > layer.crop.h) return null
    const px = (relX / layer.crop.w) * entry.width
    const py = (relY / layer.crop.h) * entry.height
    return { px, py }
  }

  if (unrotX < 0 || unrotX > layer.w || unrotY < 0 || unrotY > layer.h) return null
  const fit = layer.imageFit || 'cover'
  const pos = parseImagePosition(layer.imagePosition)

  const nw = entry.width
  const nh = entry.height
  const boxW = layer.w
  const boxH = layer.h

  const scale = fit === 'contain'
    ? Math.min(boxW / nw, boxH / nh)
    : Math.max(boxW / nw, boxH / nh)

  const renderedW = nw * scale
  const renderedH = nh * scale
  const overflowX = Math.max(0, renderedW - boxW)
  const overflowY = Math.max(0, renderedH - boxH)

  const imgLeft = -(overflowX * (pos.x / 100))
  const imgTop = -(overflowY * (pos.y / 100))

  const onImgX = unrotX - imgLeft
  const onImgY = unrotY - imgTop
  const px = onImgX / scale
  const py = onImgY / scale

  if (px < 0 || px >= nw || py < 0 || py >= nh) return null
  return { px, py }
}

function getPixelCoordForBackgroundImage(
  artX: number,
  artY: number,
  presetW: number,
  presetH: number,
  entry: ImageCanvasEntry
): { px: number; py: number } | null {
  if (artX < 0 || artX > presetW || artY < 0 || artY > presetH) return null
  const nw = entry.width
  const nh = entry.height
  const scale = Math.max(presetW / nw, presetH / nh)
  const renderedW = nw * scale
  const renderedH = nh * scale
  const overflowX = Math.max(0, renderedW - presetW)
  const overflowY = Math.max(0, renderedH - presetH)
  const imgLeft = -(overflowX * 0.5)
  const imgTop = -(overflowY * 0.5)
  const onImgX = artX - imgLeft
  const onImgY = artY - imgTop
  const px = onImgX / scale
  const py = onImgY / scale
  if (px < 0 || px >= nw || py < 0 || py >= nh) return null
  return { px, py }
}

function loadAndCacheImage(
  src: string,
  cache: Map<string, ImageCanvasEntry>
) {
  if (!src || cache.has(src)) return

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(img, 0, 0)
        const entry: ImageCanvasEntry = { canvas, ctx, width: img.naturalWidth, height: img.naturalHeight }
        cache.set(src, entry)
      }
    } catch (e) {
      console.warn('Failed to cache image for color loupe', e)
    }
  }
  img.onerror = () => {
    // Fallback: try blob fetch for CORS compatibility
    fetch(src)
      .then((res) => res.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob)
        const blobImg = new Image()
        blobImg.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = blobImg.naturalWidth
            canvas.height = blobImg.naturalHeight
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (ctx) {
              ctx.drawImage(blobImg, 0, 0)
              cache.set(src, { canvas, ctx, width: blobImg.naturalWidth, height: blobImg.naturalHeight })
            }
          } finally {
            URL.revokeObjectURL(blobUrl)
          }
        }
        blobImg.src = blobUrl
      })
      .catch(() => {})
  }
  img.src = src
}

function getOrCacheImageEntry(
  src: string,
  cache: Map<string, ImageCanvasEntry>
): ImageCanvasEntry | null {
  if (!src) return null
  if (cache.has(src)) return cache.get(src)!

  // Check DOM <img> element first for instant synchronous decode
  const domImg = Array.from(document.querySelectorAll('img')).find(
    (el) => el.src === src || el.currentSrc === src
  ) as HTMLImageElement | undefined

  if (domImg && domImg.complete && domImg.naturalWidth > 0) {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = domImg.naturalWidth
      canvas.height = domImg.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(domImg, 0, 0)
        ctx.getImageData(0, 0, 1, 1) // Test read
        const entry: ImageCanvasEntry = { canvas, ctx, width: domImg.naturalWidth, height: domImg.naturalHeight }
        cache.set(src, entry)
        if (domImg.currentSrc) cache.set(domImg.currentSrc, entry)
        return entry
      }
    } catch {
      // Tainted, fallback to async load
    }
  }

  loadAndCacheImage(src, cache)
  return null
}

function sampleColorAtPoint(
  clientX: number,
  clientY: number,
  artboardEl: HTMLElement | null,
  preset: Preset,
  layers: Layer[],
  background: Background,
  imageCache: Map<string, ImageCanvasEntry>
): string {
  // 1. Check elements from point (SVG shapes, DOM layers, direct text, image layers)
  const elements = document.elementsFromPoint(clientX, clientY)
  for (const el of elements) {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue
    if (el.closest('#color-loupe-overlay') || el.closest('#circular-color-loupe')) continue

    // Layer element
    const layerContainer = el.closest('[data-layer-id]')
    if (layerContainer) {
      const layerId = layerContainer.getAttribute('data-layer-id')
      const layer = layers.find((l) => l.id === layerId)

      // Direct image layer sampling
      if (layer && layer.type === 'image' && layer.src) {
        const entry = getOrCacheImageEntry(layer.src, imageCache)
        if (entry && artboardEl) {
          const artboardRect = artboardEl.getBoundingClientRect()
          const effScale = artboardRect.width / preset.w
          const artX = (clientX - artboardRect.left) / effScale
          const artY = (clientY - artboardRect.top) / effScale

          const cx = layer.x + layer.w / 2
          const cy = layer.y + layer.h / 2
          const rad = -((layer.rotation || 0) * Math.PI) / 180
          const dx = artX - cx
          const dy = artY - cy
          const unrotX = dx * Math.cos(rad) - dy * Math.sin(rad) + layer.w / 2
          const unrotY = dx * Math.sin(rad) + dy * Math.cos(rad) + layer.h / 2

          const coord = getPixelCoordForImageLayer(layer, unrotX, unrotY, entry)
          if (coord) {
            const pixelHex = samplePixelFromEntry(entry, coord.px, coord.py)
            if (pixelHex) return pixelHex
          }
        }
      }

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

    // Direct <img> check on any hit element
    if (el instanceof HTMLImageElement || el.querySelector('img')) {
      const imgEl = (el instanceof HTMLImageElement ? el : el.querySelector('img')) as HTMLImageElement
      const src = imgEl.currentSrc || imgEl.src
      if (src) {
        const entry = getOrCacheImageEntry(src, imageCache)
        if (entry) {
          const rect = imgEl.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            const fracX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
            const fracY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
            const color = samplePixelFromEntry(entry, fracX * entry.width, fracY * entry.height)
            if (color) return color
          }
        }
      }
    }

    // Direct background check on element
    const cs = window.getComputedStyle(el)
    const bg = parseToHex(cs.backgroundColor)
    if (bg) return bg
  }

  // 2. Geometry check across layers from top to bottom (in case layers have pointer-events-none or transparent wrappers)
  if (artboardEl) {
    const artboardRect = artboardEl.getBoundingClientRect()
    const effScale = artboardRect.width / preset.w
    const artX = (clientX - artboardRect.left) / effScale
    const artY = (clientY - artboardRect.top) / effScale

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i]
      if (layer.visible === false || layer.type === 'group') continue

      const cx = layer.x + layer.w / 2
      const cy = layer.y + layer.h / 2
      const rad = -((layer.rotation || 0) * Math.PI) / 180
      const dx = artX - cx
      const dy = artY - cy
      const unrotX = dx * Math.cos(rad) - dy * Math.sin(rad) + layer.w / 2
      const unrotY = dx * Math.sin(rad) + dy * Math.cos(rad) + layer.h / 2

      if (unrotX >= 0 && unrotX <= layer.w && unrotY >= 0 && unrotY <= layer.h) {
        if (layer.type === 'image' && layer.src) {
          const entry = getOrCacheImageEntry(layer.src, imageCache)
          if (entry) {
            const coord = getPixelCoordForImageLayer(layer, unrotX, unrotY, entry)
            if (coord) {
              const pixelHex = samplePixelFromEntry(entry, coord.px, coord.py)
              if (pixelHex) return pixelHex
            }
          }
        } else if (layer.type === 'shape') {
          if (layer.shape === 'circle') {
            const rx = layer.w / 2
            const ry = layer.h / 2
            const normDist = Math.pow((unrotX - rx) / rx, 2) + Math.pow((unrotY - ry) / ry, 2)
            if (normDist <= 1) {
              const color = parseToHex(layer.fill || layer.color)
              if (color) return color
            }
          } else {
            const color = parseToHex(layer.fill || layer.color)
            if (color) return color
          }
        } else if (layer.type === 'text') {
          const color = parseToHex(layer.color || layer.fill)
          if (color) return color
        } else if (layer.type === 'path') {
          const color = parseToHex(layer.fill !== 'transparent' ? layer.fill : layer.stroke)
          if (color) return color
        }
      }
    }

    // 3. Artboard background check
    if (background.type === 'image' && background.value) {
      const entry = getOrCacheImageEntry(background.value, imageCache)
      if (entry) {
        const coord = getPixelCoordForBackgroundImage(artX, artY, preset.w, preset.h, entry)
        if (coord) {
          const pixelHex = samplePixelFromEntry(entry, coord.px, coord.py)
          if (pixelHex) return pixelHex
        }
      }
    } else if (background.type === 'color') {
      const hex = parseToHex(background.value)
      if (hex) return hex
    } else if (background.type === 'gradient') {
      const px = Math.max(0, Math.min(1, (clientX - artboardRect.left) / artboardRect.width))
      const py = Math.max(0, Math.min(1, (clientY - artboardRect.top) / artboardRect.height))
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

const LOUPE_SIZE = 124
const LOUPE_CANVAS_SIZE = 248
const LOUPE_RADIUS = LOUPE_SIZE / 2
const ZOOM = 3.2

function renderLoupeLens(
  canvas: HTMLCanvasElement | null,
  touchPos: { x: number; y: number } | null,
  preset: Preset,
  layers: Layer[],
  background: Background,
  imageCache: Map<string, ImageCanvasEntry>
) {
  if (!canvas || !touchPos) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const artboardEl = document.querySelector('[data-testid="artboard"]') as HTMLElement | null
  if (!artboardEl) return

  const artboardRect = artboardEl.getBoundingClientRect()
  const effScale = artboardRect.width / preset.w
  const artX = (touchPos.x - artboardRect.left) / effScale
  const artY = (touchPos.y - artboardRect.top) / effScale

  ctx.save()
  // Clear lens canvas
  ctx.clearRect(0, 0, LOUPE_CANVAS_SIZE, LOUPE_CANVAS_SIZE)

  // Default neutral backdrop
  ctx.fillStyle = '#18181b'
  ctx.fillRect(0, 0, LOUPE_CANVAS_SIZE, LOUPE_CANVAS_SIZE)

  // Set transform:
  // Center of canvas is (LOUPE_CANVAS_SIZE / 2, LOUPE_CANVAS_SIZE / 2)
  // Artboard coordinate (artX, artY) maps directly to center
  const zoomScale = ZOOM * 2 * effScale
  const centerX = LOUPE_CANVAS_SIZE / 2
  const centerY = LOUPE_CANVAS_SIZE / 2

  ctx.translate(centerX, centerY)
  ctx.scale(zoomScale, zoomScale)
  ctx.translate(-artX, -artY)

  // 1. Draw artboard background
  if (background.type === 'color') {
    ctx.fillStyle = background.value || '#000000'
    ctx.fillRect(0, 0, preset.w, preset.h)
  } else if (background.type === 'image' && background.value) {
    const bgDomImg = Array.from(document.querySelectorAll('img')).find(
      (el) => el.src === background.value || el.currentSrc === background.value
    ) as HTMLImageElement | undefined
    const bgSource = (bgDomImg && bgDomImg.complete && bgDomImg.naturalWidth > 0)
      ? bgDomImg
      : imageCache.get(background.value)?.canvas

    if (bgSource) {
      const nw = (bgSource as any).naturalWidth || (bgSource as any).width
      const nh = (bgSource as any).naturalHeight || (bgSource as any).height
      const scale = Math.max(preset.w / nw, preset.h / nh)
      const rw = nw * scale
      const rh = nh * scale
      const ox = (rw - preset.w) * 0.5
      const oy = (rh - preset.h) * 0.5
      ctx.drawImage(bgSource, -ox, -oy, rw, rh)
    } else {
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, preset.w, preset.h)
    }
  } else if (background.type === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, preset.w, preset.h)
    const gradColors = background.value.match(/#[0-9a-fA-F]{6}|rgba?\([^)]+\)/g)
    if (gradColors && gradColors.length >= 2) {
      grad.addColorStop(0, gradColors[0])
      grad.addColorStop(1, gradColors[gradColors.length - 1])
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, preset.w, preset.h)
    } else {
      ctx.fillStyle = '#111827'
      ctx.fillRect(0, 0, preset.w, preset.h)
    }
  }

  // 2. Draw all visible layers
  for (const layer of layers) {
    if (layer.visible === false || layer.type === 'group') continue

    ctx.save()

    if (layer.opacity !== undefined && layer.opacity < 1) {
      ctx.globalAlpha = layer.opacity
    }

    const cx = layer.x + layer.w / 2
    const cy = layer.y + layer.h / 2
    ctx.translate(cx, cy)
    if (layer.rotation) {
      ctx.rotate((layer.rotation * Math.PI) / 180)
    }
    ctx.translate(-layer.w / 2, -layer.h / 2)

    if (layer.type === 'image' && layer.src) {
      const domImg = Array.from(document.querySelectorAll('img')).find(
        (el) => el.src === layer.src || el.currentSrc === layer.src
      ) as HTMLImageElement | undefined

      const imgSource = (domImg && domImg.complete && domImg.naturalWidth > 0)
        ? domImg
        : imageCache.get(layer.src)?.canvas

      if (imgSource) {
        ctx.beginPath()
        if (layer.radius) {
          ctx.roundRect(0, 0, layer.w, layer.h, layer.radius)
        } else {
          ctx.rect(0, 0, layer.w, layer.h)
        }
        ctx.clip()

        if (layer.crop) {
          ctx.drawImage(imgSource, layer.crop.x, layer.crop.y, layer.crop.w, layer.crop.h)
        } else {
          const nw = (imgSource as any).naturalWidth || (imgSource as any).width
          const nh = (imgSource as any).naturalHeight || (imgSource as any).height
          const fit = layer.imageFit || 'cover'
          const pos = parseImagePosition(layer.imagePosition)
          const scale = fit === 'contain'
            ? Math.min(layer.w / nw, layer.h / nh)
            : Math.max(layer.w / nw, layer.h / nh)
          const renderedW = nw * scale
          const renderedH = nh * scale
          const overflowX = Math.max(0, renderedW - layer.w)
          const overflowY = Math.max(0, renderedH - layer.h)
          const imgLeft = -(overflowX * (pos.x / 100))
          const imgTop = -(overflowY * (pos.y / 100))
          ctx.drawImage(imgSource, imgLeft, imgTop, renderedW, renderedH)
        }
      }
    } else if (layer.type === 'shape') {
      const fillColor = layer.fill || layer.color || '#3b82f6'
      ctx.fillStyle = fillColor

      if (layer.shape === 'circle') {
        ctx.beginPath()
        ctx.ellipse(layer.w / 2, layer.h / 2, layer.w / 2, layer.h / 2, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.roundRect(0, 0, layer.w, layer.h, layer.radius || 0)
        ctx.fill()
      }

      if (layer.stroke && layer.strokeWidth) {
        ctx.strokeStyle = layer.stroke
        ctx.lineWidth = layer.strokeWidth
        ctx.stroke()
      }
    } else if (layer.type === 'text') {
      if (layer.fill) {
        ctx.fillStyle = layer.fill
        if (layer.radius) {
          ctx.beginPath()
          ctx.roundRect(0, 0, layer.w, layer.h, layer.radius)
          ctx.fill()
        } else {
          ctx.fillRect(0, 0, layer.w, layer.h)
        }
      }
      ctx.fillStyle = layer.color || '#FFFFFF'
      ctx.font = `${layer.fontWeight || 600} ${layer.fontSize || 40}px ${layer.fontFamily || 'Inter, sans-serif'}`
      ctx.textBaseline = 'top'
      ctx.fillText(layer.text || '', 0, 0)
    } else if (layer.type === 'path') {
      const d = layer.pathData
      if (d) {
        const path = new Path2D(d)
        if (layer.fill && layer.fill !== 'transparent') {
          ctx.fillStyle = layer.fill
          ctx.fill(path)
        }
        if (layer.stroke && layer.strokeWidth) {
          ctx.strokeStyle = layer.stroke
          ctx.lineWidth = layer.strokeWidth
          ctx.stroke(path)
        }
      }
    }

    ctx.restore()
  }

  ctx.restore()
}

export default function ColorLoupe() {
  const { eyedropper, updateEyedropperColor, cancelEyedropper, finishEyedropper, project } = useEditor()
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null)
  const [isHolding, setIsHolding] = useState(false)

  const activeColor = eyedropper?.currentColor || '#007AFF'
  const isHoldingRef = useRef(false)
  isHoldingRef.current = isHolding

  const imageCacheRef = useRef<Map<string, ImageCanvasEntry>>(new Map())
  const lensCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Pre-cache all project images when eyedropper opens or layers change
  useEffect(() => {
    if (!eyedropper) return

    for (const l of project.layers) {
      if (l.type === 'image' && l.src) {
        getOrCacheImageEntry(l.src, imageCacheRef.current)
      }
    }

    if (project.background.type === 'image' && project.background.value) {
      getOrCacheImageEntry(project.background.value, imageCacheRef.current)
    }

    document.querySelectorAll('img').forEach((img) => {
      if (img.src) {
        getOrCacheImageEntry(img.src, imageCacheRef.current)
      }
    })
  }, [eyedropper, project.layers, project.background])

  // Re-render lens when touchPos or project layers change
  useEffect(() => {
    if (lensCanvasRef.current && touchPos) {
      renderLoupeLens(
        lensCanvasRef.current,
        touchPos,
        project.preset,
        project.layers,
        project.background,
        imageCacheRef.current
      )
    }
  }, [touchPos, project.preset, project.layers, project.background])

  const handlePointer = useCallback(
    (clientX: number, clientY: number) => {
      const pos = { x: clientX, y: clientY }
      setTouchPos(pos)
      const artboardEl = document.querySelector('[data-testid="artboard"]') as HTMLElement | null
      const sampled = sampleColorAtPoint(
        clientX,
        clientY,
        artboardEl,
        project.preset,
        project.layers,
        project.background,
        imageCacheRef.current
      )
      if (sampled) {
        updateEyedropperColor(sampled)
      }
      if (lensCanvasRef.current) {
        renderLoupeLens(
          lensCanvasRef.current,
          pos,
          project.preset,
          project.layers,
          project.background,
          imageCacheRef.current
        )
      }
    },
    [project.preset, project.layers, project.background, updateEyedropperColor]
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
              {/* Magnified Artboard Canvas */}
              <canvas
                id="loupe-lens-canvas"
                data-testid="loupe-lens-canvas"
                ref={(node) => {
                  lensCanvasRef.current = node
                  if (node && touchPos) {
                    renderLoupeLens(
                      node,
                      touchPos,
                      project.preset,
                      project.layers,
                      project.background,
                      imageCacheRef.current
                    )
                  }
                }}
                width={LOUPE_CANVAS_SIZE}
                height={LOUPE_CANVAS_SIZE}
                className="w-full h-full block"
                style={{ imageRendering: 'pixelated' }}
              />

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
