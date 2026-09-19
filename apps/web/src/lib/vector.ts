import type { VectorPoint, ShapeKind, Layer } from '#/types'

/**
 * Builds an SVG path string from a sequence of VectorPoints.
 * Coordinates in VectorPoint can either be 0..1 normalized (relative to bbox w, h)
 * or absolute px within the layer's bounding box.
 */
export function buildSvgPath(
  points: VectorPoint[],
  closed: boolean = true,
  w: number = 100,
  h: number = 100,
  normalized: boolean = false
): string {
  if (!points || points.length === 0) return ''

  const sx = (x: number) => (normalized ? x * w : x)
  const sy = (y: number) => (normalized ? y * h : y)

  const p0 = points[0]
  let d = `M ${round(sx(p0.x))} ${round(sy(p0.y))}`

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]

    const hasCp1 = prev.cp2 !== undefined
    const hasCp2 = curr.cp1 !== undefined

    if (hasCp1 || hasCp2) {
      const cp1x = hasCp1 ? sx(prev.cp2!.x) : sx(prev.x)
      const cp1y = hasCp1 ? sy(prev.cp2!.y) : sy(prev.y)
      const cp2x = hasCp2 ? sx(curr.cp1!.x) : sx(curr.x)
      const cp2y = hasCp2 ? sy(curr.cp1!.y) : sy(curr.y)
      d += ` C ${round(cp1x)} ${round(cp1y)}, ${round(cp2x)} ${round(cp2y)}, ${round(sx(curr.x))} ${round(sy(curr.y))}`
    } else {
      d += ` L ${round(sx(curr.x))} ${round(sy(curr.y))}`
    }
  }

  if (closed && points.length > 2) {
    const last = points[points.length - 1]
    const hasCp1 = last.cp2 !== undefined
    const hasCp2 = p0.cp1 !== undefined
    if (hasCp1 || hasCp2) {
      const cp1x = hasCp1 ? sx(last.cp2!.x) : sx(last.x)
      const cp1y = hasCp1 ? sy(last.cp2!.y) : sy(last.y)
      const cp2x = hasCp2 ? sx(p0.cp1!.x) : sx(p0.x)
      const cp2y = hasCp2 ? sy(p0.cp1!.y) : sy(p0.y)
      d += ` C ${round(cp1x)} ${round(cp1y)}, ${round(cp2x)} ${round(cp2y)}, ${round(sx(p0.x))} ${round(sy(p0.y))} Z`
    } else {
      d += ' Z'
    }
  }

  return d
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Scales an array of VectorPoints by sx and sy.
 */
export function scaleVectorPoints(points: VectorPoint[], sx: number, sy: number): VectorPoint[] {
  if (!points) return []
  return points.map((p) => ({
    x: round(p.x * sx),
    y: round(p.y * sy),
    cp1: p.cp1 ? { x: round(p.cp1.x * sx), y: round(p.cp1.y * sy) } : undefined,
    cp2: p.cp2 ? { x: round(p.cp2.x * sx), y: round(p.cp2.y * sy) } : undefined,
  }))
}

/**
 * Evaluates a cubic Bézier curve at parameter t in [0, 1].
 */
function evalBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

/**
 * Computes the 1D extrema (min and max) for a cubic Bézier segment from p0 to p3 with control points p1, p2.
 */
function getBezierExtrema1D(p0: number, p1: number, p2: number, p3: number): { min: number; max: number } {
  let min = Math.min(p0, p3)
  let max = Math.max(p0, p3)

  const a = p3 - 3 * p2 + 3 * p1 - p0
  const b = 2 * (p2 - 2 * p1 + p0)
  const c = p1 - p0

  if (Math.abs(a) < 1e-7) {
    if (Math.abs(b) > 1e-7) {
      const t = -c / b
      if (t > 0 && t < 1) {
        const val = evalBezier(p0, p1, p2, p3, t)
        min = Math.min(min, val)
        max = Math.max(max, val)
      }
    }
  } else {
    const disc = b * b - 4 * a * c
    if (disc >= 0) {
      const s = Math.sqrt(disc)
      const t1 = (-b + s) / (2 * a)
      const t2 = (-b - s) / (2 * a)
      if (t1 > 0 && t1 < 1) {
        const val1 = evalBezier(p0, p1, p2, p3, t1)
        min = Math.min(min, val1)
        max = Math.max(max, val1)
      }
      if (t2 > 0 && t2 < 1) {
        const val2 = evalBezier(p0, p1, p2, p3, t2)
        min = Math.min(min, val2)
        max = Math.max(max, val2)
      }
    }
  }
  return { min, max }
}

export interface VectorBoundingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

/**
 * Computes the exact geometric bounding box of a vector shape defined by VectorPoints.
 */
export function getVectorBoundingBox(points: VectorPoint[], closed: boolean = true): VectorBoundingBox {
  if (!points || points.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 }
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  const includePoint = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  // Include all anchor points
  for (const pt of points) {
    includePoint(pt.x, pt.y)
  }

  // Check Bézier curve segments for extrema
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    if (prev.cp2 !== undefined || curr.cp1 !== undefined) {
      const p0x = prev.x
      const p1x = prev.cp2 !== undefined ? prev.cp2.x : prev.x
      const p2x = curr.cp1 !== undefined ? curr.cp1.x : curr.x
      const p3x = curr.x

      const p0y = prev.y
      const p1y = prev.cp2 !== undefined ? prev.cp2.y : prev.y
      const p2y = curr.cp1 !== undefined ? curr.cp1.y : curr.y
      const p3y = curr.y

      const extX = getBezierExtrema1D(p0x, p1x, p2x, p3x)
      const extY = getBezierExtrema1D(p0y, p1y, p2y, p3y)
      minX = Math.min(minX, extX.min)
      maxX = Math.max(maxX, extX.max)
      minY = Math.min(minY, extY.min)
      maxY = Math.max(maxY, extY.max)
    }
  }

  // Closing segment if closed
  if (closed && points.length > 2) {
    const last = points[points.length - 1]
    const first = points[0]
    if (last.cp2 !== undefined || first.cp1 !== undefined) {
      const p0x = last.x
      const p1x = last.cp2 !== undefined ? last.cp2.x : last.x
      const p2x = first.cp1 !== undefined ? first.cp1.x : first.x
      const p3x = first.x

      const p0y = last.y
      const p1y = last.cp2 !== undefined ? last.cp2.y : last.y
      const p2y = first.cp1 !== undefined ? first.cp1.y : first.y
      const p3y = first.y

      const extX = getBezierExtrema1D(p0x, p1x, p2x, p3x)
      const extY = getBezierExtrema1D(p0y, p1y, p2y, p3y)
      minX = Math.min(minX, extX.min)
      maxX = Math.max(maxX, extX.max)
      minY = Math.min(minY, extY.min)
      maxY = Math.max(maxY, extY.max)
    }
  }

  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)

  return { minX, minY, maxX, maxY, width, height }
}

/**
 * Fits and normalizes vector points so their bounding box matches [0, 0, targetW, targetH] exactly.
 */
export function fitVectorPointsToBounds(
  points: VectorPoint[],
  closed: boolean,
  targetW: number,
  targetH: number
): VectorPoint[] {
  if (!points || points.length === 0) return []
  const bbox = getVectorBoundingBox(points, closed)
  const scaleX = bbox.width > 0 ? targetW / bbox.width : 1
  const scaleY = bbox.height > 0 ? targetH / bbox.height : 1

  return points.map((pt) => ({
    x: round((pt.x - bbox.minX) * scaleX),
    y: round((pt.y - bbox.minY) * scaleY),
    cp1: pt.cp1
      ? {
          x: round((pt.cp1.x - bbox.minX) * scaleX),
          y: round((pt.cp1.y - bbox.minY) * scaleY),
        }
      : undefined,
    cp2: pt.cp2
      ? {
          x: round((pt.cp2.x - bbox.minX) * scaleX),
          y: round((pt.cp2.y - bbox.minY) * scaleY),
        }
      : undefined,
  }))
}

/**
 * Snaps a path layer's element bounds tightly to the exact edges of the shape.
 * Adjusts layer.x, layer.y, layer.w, layer.h and shifts internal points so the shape
 * remains at the exact same screen position without any empty margins.
 */
export function tightenVectorLayer(layer: Layer): {
  x: number
  y: number
  w: number
  h: number
  points: VectorPoint[]
} {
  const pts = layer.points
  if (!pts || pts.length === 0) {
    return { x: layer.x, y: layer.y, w: layer.w, h: layer.h, points: pts || [] }
  }

  const bbox = getVectorBoundingBox(pts, layer.closed !== false)
  const minX = bbox.minX
  const minY = bbox.minY
  const rawW = bbox.maxX - bbox.minX
  const rawH = bbox.maxY - bbox.minY

  // If already at (0, 0) with matching w and h within subpixel tolerance, keep as is
  if (Math.abs(minX) < 0.25 && Math.abs(minY) < 0.25 && Math.abs(rawW - layer.w) < 0.5 && Math.abs(rawH - layer.h) < 0.5) {
    return { x: layer.x, y: layer.y, w: layer.w, h: layer.h, points: pts }
  }

  const newW = Math.max(10, Math.round(rawW))
  const newH = Math.max(10, Math.round(rawH))
  const newX = Math.round(layer.x + minX)
  const newY = Math.round(layer.y + minY)

  const shiftedPoints = pts.map((pt) => ({
    x: round(pt.x - minX),
    y: round(pt.y - minY),
    cp1: pt.cp1 ? { x: round(pt.cp1.x - minX), y: round(pt.cp1.y - minY) } : undefined,
    cp2: pt.cp2 ? { x: round(pt.cp2.x - minX), y: round(pt.cp2.y - minY) } : undefined,
  }))

  return {
    x: newX,
    y: newY,
    w: newW,
    h: newH,
    points: shiftedPoints,
  }
}

/**
 * Standard shape templates in absolute px within [w, h].
 */
export function createShapeVectorPoints(shape: ShapeKind, w: number, h: number, radius: number = 0): VectorPoint[] {
  switch (shape) {
    case 'circle': {
      // 4-point Bézier approximation of an ellipse/circle
      // kappa = 4 * (sqrt(2) - 1) / 3 ≈ 0.5522847498
      const k = 0.5522847498
      const rx = w / 2
      const ry = h / 2
      const cx = rx
      const cy = ry
      const dx = rx * k
      const dy = ry * k

      return [
        { x: cx, y: 0, cp1: { x: cx - dx, y: 0 }, cp2: { x: cx + dx, y: 0 } },
        { x: w, y: cy, cp1: { x: w, y: cy - dy }, cp2: { x: w, y: cy + dy } },
        { x: cx, y: h, cp1: { x: cx + dx, y: h }, cp2: { x: cx - dx, y: h } },
        { x: 0, y: cy, cp1: { x: 0, y: cy + dy }, cp2: { x: 0, y: cy - dy } },
      ]
    }
    case 'triangle': {
      return [
        { x: w / 2, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ]
    }
    case 'star': {
      // 5-point star
      const pts: VectorPoint[] = []
      const outerR = Math.min(w, h) / 2
      const innerR = outerR * 0.42
      const cx = w / 2
      const cy = h / 2
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR
        const angle = -Math.PI / 2 + (i * Math.PI) / 5
        pts.push({
          x: round(cx + r * Math.cos(angle)),
          y: round(cy + r * Math.sin(angle)),
        })
      }
      return pts
    }
    case 'line': {
      return [
        { x: 0, y: h / 2 },
        { x: w, y: h / 2 },
      ]
    }
    case 'rect':
    default: {
      const maxR = Math.min(w, h) / 2
      const r = Math.min(radius, maxR)
      if (r <= 0) {
        return [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ]
      }

      // Check if it's a full circle/ellipse (e.g. w === h && r >= maxR)
      if (Math.abs(w - h) < 1 && Math.abs(r - maxR) < 0.5) {
        const k = 0.5522847498
        const rx = w / 2
        const ry = h / 2
        const cx = rx
        const cy = ry
        const dx = rx * k
        const dy = ry * k
        return [
          { x: cx, y: 0, cp1: { x: cx - dx, y: 0 }, cp2: { x: cx + dx, y: 0 } },
          { x: w, y: cy, cp1: { x: w, y: cy - dy }, cp2: { x: w, y: cy + dy } },
          { x: cx, y: h, cp1: { x: cx + dx, y: h }, cp2: { x: cx - dx, y: h } },
          { x: 0, y: cy, cp1: { x: 0, y: cy + dy }, cp2: { x: 0, y: cy - dy } },
        ]
      }

      const k = 0.5522847498 * r

      // Check if it's a horizontal pill shape: radius is half the height
      const isHorizontalPill = Math.abs(r - h / 2) < 0.5 && w > h
      if (isHorizontalPill) {
        return [
          // 1. Top-Left anchor (start of top flat edge, receives top-left semi-circle arc)
          { x: r, y: 0, cp1: { x: r - k, y: 0 } },
          // 2. Top-Right anchor (end of top flat edge, starts top-right semi-circle arc)
          { x: w - r, y: 0, cp2: { x: w - r + k, y: 0 } },
          // 3. Right Apex anchor (apex of right semi-circle)
          { x: w, y: r, cp1: { x: w, y: r - k }, cp2: { x: w, y: r + k } },
          // 4. Bottom-Right anchor (start of bottom flat edge, receives bottom-right semi-circle arc)
          { x: w - r, y: h, cp1: { x: w - r + k, y: h } },
          // 5. Bottom-Left anchor (end of bottom flat edge, starts bottom-left semi-circle arc)
          { x: r, y: h, cp2: { x: r - k, y: h } },
          // 6. Left Apex anchor (apex of left semi-circle, loops back to Top-Left)
          { x: 0, y: r, cp1: { x: 0, y: r + k }, cp2: { x: 0, y: r - k } },
        ]
      }

      // Check if it's a vertical pill shape: radius is half the width
      const isVerticalPill = Math.abs(r - w / 2) < 0.5 && h > w
      if (isVerticalPill) {
        return [
          // 1. Top Apex anchor (apex of top semi-circle)
          { x: r, y: 0, cp1: { x: r - k, y: 0 }, cp2: { x: r + k, y: 0 } },
          // 2. Right-Top anchor (start of right flat edge)
          { x: w, y: r, cp1: { x: w, y: r - k } },
          // 3. Right-Bottom anchor (end of right flat edge)
          { x: w, y: h - r, cp2: { x: w, y: h - r + k } },
          // 4. Bottom Apex anchor (apex of bottom semi-circle)
          { x: r, y: h, cp1: { x: r + k, y: h }, cp2: { x: r - k, y: h } },
          // 5. Left-Bottom anchor (start of left flat edge)
          { x: 0, y: h - r, cp1: { x: 0, y: h - r + k } },
          // 6. Left-Top anchor (end of left flat edge, loops back to Top Apex)
          { x: 0, y: r, cp2: { x: 0, y: r - k } },
        ]
      }

      // Standard rounded rect with Bézier corners on all 4 corners
      return [
        // Top edge: starts at (r, 0) with cp1 for the top-left curve
        { x: r, y: 0, cp1: { x: r - k, y: 0 } },
        { x: w - r, y: 0, cp2: { x: w - r + k, y: 0 } },
        // Right edge
        { x: w, y: r, cp1: { x: w, y: r - k } },
        { x: w, y: h - r, cp2: { x: w, y: h - r + k } },
        // Bottom edge
        { x: w - r, y: h, cp1: { x: w - r + k, y: h } },
        { x: r, y: h, cp2: { x: r - k, y: h } },
        // Left edge
        { x: 0, y: h - r, cp1: { x: 0, y: h - r + k } },
        { x: 0, y: r, cp2: { x: 0, y: r - k } },
      ]
    }
  }
}

/**
 * Default preset vector templates for quick-adding vector elements.
 */
export const VECTOR_PRESETS: {
  id: string
  name: string
  closed: boolean
  strokeWidth?: number
  getPoints: (w: number, h: number) => VectorPoint[]
}[] = [
  {
    id: 'organic-blob',
    name: 'Organic Blob',
    closed: true,
    getPoints: (w, h) => {
      const cx = w / 2
      const cy = h / 2
      const raw: VectorPoint[] = [
        { x: cx, y: h * 0.08, cp1: { x: cx - w * 0.28, y: h * 0.08 }, cp2: { x: cx + w * 0.35, y: h * 0.12 } },
        { x: w * 0.92, y: cy, cp1: { x: w * 0.92, y: cy - h * 0.25 }, cp2: { x: w * 0.85, y: cy + h * 0.32 } },
        { x: cx, y: h * 0.92, cp1: { x: cx + w * 0.25, y: h * 0.92 }, cp2: { x: cx - w * 0.32, y: h * 0.85 } },
        { x: w * 0.08, y: cy, cp1: { x: w * 0.08, y: cy + h * 0.22 }, cp2: { x: w * 0.12, y: cy - h * 0.3 } },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
  {
    id: 'smooth-wave',
    name: 'Smooth Wave',
    closed: true,
    getPoints: (w, h) => {
      const raw: VectorPoint[] = [
        { x: 0, y: h * 0.4, cp2: { x: w * 0.25, y: h * 0.1 } },
        { x: w * 0.5, y: h * 0.5, cp1: { x: w * 0.35, y: h * 0.75 }, cp2: { x: w * 0.65, y: h * 0.25 } },
        { x: w, y: h * 0.4, cp1: { x: w * 0.75, y: h * 0.85 } },
        { x: w, y: h },
        { x: 0, y: h },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
  {
    id: 'speech-bubble',
    name: 'Speech Bubble',
    closed: true,
    getPoints: (w, h) => {
      const bodyH = h * 0.75
      const r = Math.min(16, bodyH * 0.25)
      const raw: VectorPoint[] = [
        { x: r, y: 0 },
        { x: w - r, y: 0 },
        { x: w, y: r },
        { x: w, y: bodyH - r },
        { x: w - r, y: bodyH },
        { x: w * 0.45, y: bodyH },
        { x: w * 0.25, y: h },
        { x: w * 0.3, y: bodyH },
        { x: r, y: bodyH },
        { x: 0, y: bodyH - r },
        { x: 0, y: r },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
  {
    id: 'curved-arrow',
    name: 'Curved Arrow',
    closed: false,
    strokeWidth: 4,
    getPoints: (w, h) => {
      const raw: VectorPoint[] = [
        { x: w * 0.1, y: h * 0.85, cp2: { x: w * 0.2, y: h * 0.2 } },
        { x: w * 0.7, y: h * 0.2, cp1: { x: w * 0.45, y: h * 0.15 } },
        { x: w * 0.9, y: h * 0.4 },
      ]
      return fitVectorPointsToBounds(raw, false, w, h)
    },
  },
  {
    id: 'badge-ribbon',
    name: 'Badge Ribbon',
    closed: true,
    getPoints: (w, h) => {
      const raw: VectorPoint[] = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w * 0.85, y: h * 0.5 },
        { x: w, y: h },
        { x: 0, y: h },
        { x: w * 0.15, y: h * 0.5 },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
]

/**
 * Converts any standard shape layer into a vector path layer with editable anchor points.
 */
export function convertShapeToVector(shapeLayer: Layer): Partial<Layer> {
  const isClosed = shapeLayer.shape !== 'line'
  const rawPts = createShapeVectorPoints(
    shapeLayer.shape || 'rect',
    shapeLayer.w,
    shapeLayer.h,
    shapeLayer.radius || 0
  )
  const pts = fitVectorPointsToBounds(rawPts, isClosed, shapeLayer.w, shapeLayer.h)
  return {
    type: 'path',
    points: pts,
    closed: isClosed,
    fill: shapeLayer.shape === 'line' ? 'transparent' : (shapeLayer.fill || '#007AFF'),
    stroke: shapeLayer.shape === 'line' ? (shapeLayer.fill || '#007AFF') : undefined,
    strokeWidth: shapeLayer.shape === 'line' ? Math.max(3, shapeLayer.h * 0.12) : 0,
    fillRule: 'nonzero',
  }
}
