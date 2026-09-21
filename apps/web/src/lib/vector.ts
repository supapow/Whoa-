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

  let d = ''
  let subpathStartIdx = 0

  for (let i = 0; i < points.length; i++) {
    const curr = points[i]
    if (i === 0 || curr.subpathStart) {
      if (i > 0 && closed && i - subpathStartIdx > 2) {
        const prev = points[i - 1]
        const pStart = points[subpathStartIdx]
        const hasCp1 = prev.cp2 !== undefined
        const hasCp2 = pStart.cp1 !== undefined
        if (hasCp1 || hasCp2) {
          const cp1x = hasCp1 ? sx(prev.cp2!.x) : sx(prev.x)
          const cp1y = hasCp1 ? sy(prev.cp2!.y) : sy(prev.y)
          const cp2x = hasCp2 ? sx(pStart.cp1!.x) : sx(pStart.x)
          const cp2y = hasCp2 ? sy(pStart.cp1!.y) : sy(pStart.y)
          d += ` C ${round(cp1x)} ${round(cp1y)}, ${round(cp2x)} ${round(cp2y)}, ${round(sx(pStart.x))} ${round(sy(pStart.y))} Z`
        } else {
          d += ' Z'
        }
      }
      subpathStartIdx = i
      d += (d ? ' ' : '') + `M ${round(sx(curr.x))} ${round(sy(curr.y))}`
      continue
    }

    const prev = points[i - 1]
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

  if (closed && points.length - subpathStartIdx > 2) {
    const last = points[points.length - 1]
    const pStart = points[subpathStartIdx]
    const hasCp1 = last.cp2 !== undefined
    const hasCp2 = pStart.cp1 !== undefined
    if (hasCp1 || hasCp2) {
      const cp1x = hasCp1 ? sx(last.cp2!.x) : sx(last.x)
      const cp1y = hasCp1 ? sy(last.cp2!.y) : sy(last.y)
      const cp2x = hasCp2 ? sx(pStart.cp1!.x) : sx(pStart.x)
      const cp2y = hasCp2 ? sy(pStart.cp1!.y) : sy(pStart.y)
      d += ` C ${round(cp1x)} ${round(cp1y)}, ${round(cp2x)} ${round(cp2y)}, ${round(sx(pStart.x))} ${round(sy(pStart.y))} Z`
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
    mode: p.mode,
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
    mode: pt.mode,
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

  // Keep sub-pixel geometry here. Rounding the layer origin to whole pixels makes
  // anchors drift away from the rendered path, especially while zoomed in.
  const newW = Math.max(10, round(rawW))
  const newH = Math.max(10, round(rawH))
  const newX = round(layer.x + minX)
  const newY = round(layer.y + minY)

  const shiftedPoints = pts.map((pt) => ({
    x: round(pt.x - minX),
    y: round(pt.y - minY),
    cp1: pt.cp1 ? { x: round(pt.cp1.x - minX), y: round(pt.cp1.y - minY) } : undefined,
    cp2: pt.cp2 ? { x: round(pt.cp2.x - minX), y: round(pt.cp2.y - minY) } : undefined,
    mode: pt.mode,
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

export interface VectorPreset {
  id: string
  name: string
  closed: boolean
  strokeWidth?: number
  defaultW?: number
  defaultH?: number
  category?: 'basic' | 'geometric' | 'symbol' | 'arrow' | 'organic' | 'callout'
  isBasic?: boolean
  getPoints: (w: number, h: number) => VectorPoint[]
}

/**
 * Default preset vector templates for quick-adding vector elements.
 * Includes full vector versions of all basic shapes (Square, Circle, Triangle, Star, Line)
 * followed by a rich library of decorative, symbol, arrow, and organic vector shapes.
 */
export const VECTOR_PRESETS: VectorPreset[] = [
  /* ---------------- BASIC SHAPES (Vector Versions) ---------------- */
  {
    id: 'rect',
    name: 'Square',
    closed: true,
    category: 'basic',
    isBasic: true,
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
  },
  {
    id: 'circle',
    name: 'Circle',
    closed: true,
    category: 'basic',
    isBasic: true,
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => createShapeVectorPoints('circle', w, h, 0),
  },
  {
    id: 'triangle',
    name: 'Triangle',
    closed: true,
    category: 'basic',
    isBasic: true,
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => [
      { x: w / 2, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
  },
  {
    id: 'star',
    name: 'Star',
    closed: true,
    category: 'basic',
    isBasic: true,
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => createShapeVectorPoints('star', w, h, 0),
  },
  {
    id: 'line',
    name: 'Line',
    closed: false,
    strokeWidth: 4,
    category: 'basic',
    isBasic: true,
    defaultW: 200,
    defaultH: 30,
    getPoints: (w, h) => [
      { x: 0, y: h / 2 },
      { x: w, y: h / 2 },
    ],
  },

  /* ---------------- GEOMETRIC & POLYGONS ---------------- */
  {
    id: 'hexagon',
    name: 'Hexagon',
    closed: true,
    category: 'geometric',
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => {
      const cx = w / 2
      const cy = h / 2
      const rx = w / 2
      const ry = h / 2
      const pts: VectorPoint[] = []
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3 - Math.PI / 6
        pts.push({
          x: round(cx + rx * Math.cos(angle)),
          y: round(cy + ry * Math.sin(angle)),
        })
      }
      return fitVectorPointsToBounds(pts, true, w, h)
    },
  },
  {
    id: 'diamond',
    name: 'Diamond',
    closed: true,
    category: 'geometric',
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => [
      { x: w / 2, y: 0 },
      { x: w, y: h / 2 },
      { x: w / 2, y: h },
      { x: 0, y: h / 2 },
    ],
  },
  {
    id: 'pentagon',
    name: 'Pentagon',
    closed: true,
    category: 'geometric',
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => {
      const cx = w / 2
      const cy = h / 2
      const rx = w / 2
      const ry = h / 2
      const pts: VectorPoint[] = []
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5
        pts.push({
          x: round(cx + rx * Math.cos(angle)),
          y: round(cy + ry * Math.sin(angle)),
        })
      }
      return fitVectorPointsToBounds(pts, true, w, h)
    },
  },
  {
    id: 'octagon',
    name: 'Octagon',
    closed: true,
    category: 'geometric',
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => {
      const d = 0.29289
      return [
        { x: w * d, y: 0 },
        { x: w * (1 - d), y: 0 },
        { x: w, y: h * d },
        { x: w, y: h * (1 - d) },
        { x: w * (1 - d), y: h },
        { x: w * d, y: h },
        { x: 0, y: h * (1 - d) },
        { x: 0, y: h * d },
      ]
    },
  },
  {
    id: 'cross',
    name: 'Plus Cross',
    closed: true,
    category: 'geometric',
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => {
      const x1 = w * 0.35
      const x2 = w * 0.65
      const y1 = h * 0.35
      const y2 = h * 0.65
      return [
        { x: x1, y: 0 },
        { x: x2, y: 0 },
        { x: x2, y: y1 },
        { x: w, y: y1 },
        { x: w, y: y2 },
        { x: x2, y: y2 },
        { x: x2, y: h },
        { x: x1, y: h },
        { x: x1, y: y2 },
        { x: 0, y: y2 },
        { x: 0, y: y1 },
        { x: x1, y: y1 },
      ]
    },
  },

  /* ---------------- SYMBOLS & BADGES ---------------- */
  {
    id: 'heart',
    name: 'Heart',
    closed: true,
    category: 'symbol',
    defaultW: 160,
    defaultH: 150,
    getPoints: (w, h) => {
      const cx = w / 2
      const raw: VectorPoint[] = [
        { x: cx, y: h * 0.95, cp1: { x: w * 0.15, y: h * 0.65 }, cp2: { x: w * 0.85, y: h * 0.65 } },
        { x: w * 0.95, y: h * 0.35, cp1: { x: w * 0.95, y: h * 0.55 }, cp2: { x: w * 0.95, y: h * 0.15 } },
        { x: w * 0.72, y: h * 0.05, cp1: { x: w * 0.85, y: h * 0.05 }, cp2: { x: w * 0.6, y: h * 0.05 } },
        { x: cx, y: h * 0.28, cp1: { x: w * 0.55, y: h * 0.18 }, cp2: { x: w * 0.45, y: h * 0.18 } },
        { x: w * 0.28, y: h * 0.05, cp1: { x: w * 0.4, y: h * 0.05 }, cp2: { x: w * 0.15, y: h * 0.05 } },
        { x: w * 0.05, y: h * 0.35, cp1: { x: w * 0.05, y: h * 0.15 }, cp2: { x: w * 0.05, y: h * 0.55 } },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
  {
    id: 'shield',
    name: 'Shield',
    closed: true,
    category: 'symbol',
    defaultW: 160,
    defaultH: 180,
    getPoints: (w, h) => {
      const cx = w / 2
      const raw: VectorPoint[] = [
        { x: cx, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h * 0.45, cp2: { x: w, y: h * 0.75 } },
        { x: cx, y: h, cp1: { x: w * 0.75, y: h * 0.92 }, cp2: { x: w * 0.25, y: h * 0.92 } },
        { x: 0, y: h * 0.45, cp1: { x: 0, y: h * 0.75 } },
        { x: 0, y: 0 },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
  {
    id: 'lightning',
    name: 'Lightning',
    closed: true,
    category: 'symbol',
    defaultW: 140,
    defaultH: 180,
    getPoints: (w, h) => [
      { x: w * 0.55, y: 0 },
      { x: w * 0.1, y: h * 0.55 },
      { x: w * 0.48, y: h * 0.55 },
      { x: w * 0.35, y: h },
      { x: w * 0.9, y: h * 0.42 },
      { x: w * 0.52, y: h * 0.42 },
    ],
  },
  {
    id: 'sparkle',
    name: 'Sparkle',
    closed: true,
    category: 'symbol',
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => {
      const cx = w / 2
      const cy = h / 2
      const raw: VectorPoint[] = [
        { x: cx, y: 0, cp1: { x: cx * 0.85, y: cy * 0.3 }, cp2: { x: cx + (w - cx) * 0.15, y: cy * 0.3 } },
        { x: w, y: cy, cp1: { x: cx + (w - cx) * 0.7, y: cy * 0.85 }, cp2: { x: cx + (w - cx) * 0.7, y: cy + (h - cy) * 0.15 } },
        { x: cx, y: h, cp1: { x: cx + (w - cx) * 0.15, y: cy + (h - cy) * 0.7 }, cp2: { x: cx * 0.85, y: cy + (h - cy) * 0.7 } },
        { x: 0, y: cy, cp1: { x: cx * 0.3, y: cy + (h - cy) * 0.15 }, cp2: { x: cx * 0.3, y: cy * 0.85 } },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
  {
    id: 'crescent',
    name: 'Crescent Moon',
    closed: true,
    category: 'symbol',
    defaultW: 150,
    defaultH: 160,
    getPoints: (w, h) => {
      const raw: VectorPoint[] = [
        { x: w * 0.7, y: 0, cp2: { x: w * 0.95, y: h * 0.3 } },
        { x: w * 0.9, y: h * 0.5, cp1: { x: w, y: h * 0.4 }, cp2: { x: w, y: h * 0.6 } },
        { x: w * 0.7, y: h, cp1: { x: w * 0.95, y: h * 0.7 }, cp2: { x: w * 0.25, y: h * 0.75 } },
        { x: w * 0.35, y: h * 0.5, cp1: { x: w * 0.3, y: h * 0.65 }, cp2: { x: w * 0.3, y: h * 0.35 } },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
  {
    id: 'cloud',
    name: 'Cloud',
    closed: true,
    category: 'symbol',
    defaultW: 180,
    defaultH: 120,
    getPoints: (w, h) => {
      const raw: VectorPoint[] = [
        { x: w * 0.15, y: h * 0.8 },
        { x: w * 0.85, y: h * 0.8, cp2: { x: w * 0.98, y: h * 0.65 } },
        { x: w * 0.9, y: h * 0.5, cp1: { x: w * 0.98, y: h * 0.6 }, cp2: { x: w * 0.85, y: h * 0.25 } },
        { x: w * 0.65, y: h * 0.28, cp1: { x: w * 0.8, y: h * 0.2 }, cp2: { x: w * 0.55, y: h * 0.05 } },
        { x: w * 0.35, y: h * 0.25, cp1: { x: w * 0.45, y: h * 0.05 }, cp2: { x: w * 0.2, y: h * 0.18 } },
        { x: w * 0.1, y: h * 0.5, cp1: { x: w * 0.15, y: h * 0.3 }, cp2: { x: 0, y: h * 0.65 } },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
  {
    id: 'sunburst',
    name: 'Sunburst',
    closed: true,
    category: 'symbol',
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => {
      const cx = w / 2
      const cy = h / 2
      const outerR = Math.min(w, h) / 2
      const innerR = outerR * 0.78
      const pts: VectorPoint[] = []
      for (let i = 0; i < 24; i++) {
        const r = i % 2 === 0 ? outerR : innerR
        const angle = (i * Math.PI) / 12
        pts.push({
          x: round(cx + r * Math.cos(angle)),
          y: round(cy + r * Math.sin(angle)),
        })
      }
      return fitVectorPointsToBounds(pts, true, w, h)
    },
  },
  {
    id: 'badge-ribbon',
    name: 'Badge Ribbon',
    closed: true,
    category: 'symbol',
    defaultW: 180,
    defaultH: 120,
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
  {
    id: 'tag',
    name: 'Price Tag',
    closed: true,
    category: 'symbol',
    defaultW: 180,
    defaultH: 110,
    getPoints: (w, h) => [
      { x: w * 0.25, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: w * 0.25, y: h },
      { x: 0, y: h * 0.5 },
    ],
  },

  /* ---------------- CALLOUTS & UI ---------------- */
  {
    id: 'speech-bubble',
    name: 'Speech Bubble',
    closed: true,
    category: 'callout',
    defaultW: 180,
    defaultH: 140,
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

  /* ---------------- ARROWS & DIRECTIONALS ---------------- */
  {
    id: 'arrow-right',
    name: 'Right Arrow',
    closed: true,
    category: 'arrow',
    defaultW: 180,
    defaultH: 120,
    getPoints: (w, h) => [
      { x: 0, y: h * 0.3 },
      { x: w * 0.55, y: h * 0.3 },
      { x: w * 0.55, y: 0 },
      { x: w, y: h * 0.5 },
      { x: w * 0.55, y: h },
      { x: w * 0.55, y: h * 0.7 },
      { x: 0, y: h * 0.7 },
    ],
  },
  {
    id: 'chevron',
    name: 'Chevron',
    closed: true,
    category: 'arrow',
    defaultW: 180,
    defaultH: 130,
    getPoints: (w, h) => [
      { x: 0, y: 0 },
      { x: w * 0.5, y: 0 },
      { x: w, y: h * 0.5 },
      { x: w * 0.5, y: h },
      { x: 0, y: h },
      { x: w * 0.5, y: h * 0.5 },
    ],
  },
  {
    id: 'curved-arrow',
    name: 'Curved Arrow',
    closed: false,
    strokeWidth: 4,
    category: 'arrow',
    defaultW: 180,
    defaultH: 135,
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
    id: 's-curve',
    name: 'S-Curve Stroke',
    closed: false,
    strokeWidth: 4,
    category: 'arrow',
    defaultW: 180,
    defaultH: 120,
    getPoints: (w, h) => {
      const raw: VectorPoint[] = [
        { x: 0, y: h * 0.8, cp2: { x: w * 0.3, y: 0 } },
        { x: w, y: h * 0.2, cp1: { x: w * 0.7, y: h } },
      ]
      return fitVectorPointsToBounds(raw, false, w, h)
    },
  },

  /* ---------------- ORGANIC & DECORATIVE ---------------- */
  {
    id: 'organic-blob',
    name: 'Organic Blob',
    closed: true,
    category: 'organic',
    defaultW: 180,
    defaultH: 160,
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
    category: 'organic',
    defaultW: 180,
    defaultH: 135,
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
    id: 'wave-banner',
    name: 'Wave Banner',
    closed: true,
    category: 'organic',
    defaultW: 180,
    defaultH: 120,
    getPoints: (w, h) => {
      const raw: VectorPoint[] = [
        { x: 0, y: h * 0.3, cp2: { x: w * 0.25, y: 0 } },
        { x: w * 0.5, y: h * 0.25, cp1: { x: w * 0.35, y: h * 0.4 }, cp2: { x: w * 0.65, y: 0 } },
        { x: w, y: h * 0.2, cp1: { x: w * 0.75, y: h * 0.4 } },
        { x: w, y: h * 0.9, cp2: { x: w * 0.75, y: h * 0.7 } },
        { x: w * 0.5, y: h * 0.95, cp1: { x: w * 0.65, y: h * 1.1 }, cp2: { x: w * 0.35, y: h * 0.7 } },
        { x: 0, y: h },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
  {
    id: 'teardrop',
    name: 'Teardrop',
    closed: true,
    category: 'organic',
    defaultW: 150,
    defaultH: 180,
    getPoints: (w, h) => {
      const cx = w / 2
      const raw: VectorPoint[] = [
        { x: cx, y: h, cp1: { x: w * 0.15, y: h * 0.65 }, cp2: { x: w * 0.85, y: h * 0.65 } },
        { x: w, y: h * 0.35, cp1: { x: w, y: h * 0.5 }, cp2: { x: w, y: h * 0.15 } },
        { x: cx, y: 0, cp1: { x: w * 0.8, y: 0 }, cp2: { x: w * 0.2, y: 0 } },
        { x: 0, y: h * 0.35, cp1: { x: 0, y: h * 0.15 }, cp2: { x: 0, y: h * 0.5 } },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
  {
    id: 'leaf',
    name: 'Leaf',
    closed: true,
    category: 'organic',
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => {
      const raw: VectorPoint[] = [
        { x: 0, y: h, cp2: { x: w * 0.1, y: h * 0.3 } },
        { x: w, y: 0, cp1: { x: w * 0.6, y: 0 }, cp2: { x: w * 0.9, y: h * 0.7 } },
      ]
      return fitVectorPointsToBounds(raw, true, w, h)
    },
  },
  {
    id: 'flower',
    name: 'Flower',
    closed: true,
    category: 'organic',
    defaultW: 160,
    defaultH: 160,
    getPoints: (w, h) => {
      const cx = w / 2
      const cy = h / 2
      const R = Math.min(w, h) / 2
      const rInner = R * 0.45
      const pts: VectorPoint[] = []
      const petals = 6
      for (let i = 0; i < petals; i++) {
        const a1 = (i * 2 * Math.PI) / petals
        const aMid = a1 + Math.PI / petals
        pts.push({
          x: round(cx + rInner * Math.cos(a1)),
          y: round(cy + rInner * Math.sin(a1)),
          cp2: { x: round(cx + R * 1.15 * Math.cos(aMid - 0.2)), y: round(cy + R * 1.15 * Math.sin(aMid - 0.2)) },
        })
        pts.push({
          x: round(cx + R * Math.cos(aMid)),
          y: round(cy + R * Math.sin(aMid)),
          cp1: { x: round(cx + R * 1.15 * Math.cos(aMid - 0.1)), y: round(cy + R * 1.15 * Math.sin(aMid - 0.1)) },
          cp2: { x: round(cx + R * 1.15 * Math.cos(aMid + 0.1)), y: round(cy + R * 1.15 * Math.sin(aMid + 0.1)) },
        })
      }
      return fitVectorPointsToBounds(pts, true, w, h)
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

/**
 * Determines the active Bézier mode for a vector point:
 * 1: Corner / independent handles
 * 2: Mirrored (collinear, opposite, equal length)
 * 3: Asymmetric smooth (collinear, opposite, independent lengths)
 * 4: Disconnected / free handles (cusp)
 */
export function getPointBezierMode(pt: VectorPoint): 1 | 2 | 3 | 4 {
  if (pt.mode) return pt.mode
  if (!pt.cp1 && !pt.cp2) return 1
  if (pt.cp1 && pt.cp2) {
    const v1 = { x: pt.cp1.x - pt.x, y: pt.cp1.y - pt.y }
    const v2 = { x: pt.cp2.x - pt.x, y: pt.cp2.y - pt.y }
    const l1 = Math.hypot(v1.x, v1.y)
    const l2 = Math.hypot(v2.x, v2.y)
    if (l1 > 0 && l2 > 0) {
      const dot = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2)
      // If collinear and opposite directions (dot product close to -1)
      if (dot < -0.96) {
        return Math.abs(l1 - l2) <= 3 ? 2 : 3
      }
      return 4
    }
  }
  return 1
}

/**
 * Switches a point's Bézier mode while preserving the existing handle direction
 * and length as much as possible.
 */
export function switchPointBezierMode(
  pt: VectorPoint,
  targetMode: 1 | 2 | 3 | 4,
  prevPt?: VectorPoint,
  nextPt?: VectorPoint
): VectorPoint {
  const result: VectorPoint = { ...pt, mode: targetMode }
  const hasCp1 = Boolean(pt.cp1)
  const hasCp2 = Boolean(pt.cp2)

  // Default tangent computation if no handles exist
  const getDefaultHandles = () => {
    const pX = prevPt ? prevPt.x : pt.x - 40
    const pY = prevPt ? prevPt.y : pt.y
    const nX = nextPt ? nextPt.x : pt.x + 40
    const nY = nextPt ? nextPt.y : pt.y
    const tanX = nX - pX
    const tanY = nY - pY
    const tanLen = Math.hypot(tanX, tanY) || 1
    const defLen = Math.min(80, Math.max(24, Math.round(tanLen * 0.25)))
    const ux = tanX / tanLen
    const uy = tanY / tanLen
    return {
      cp1: { x: Math.round(pt.x - ux * defLen), y: Math.round(pt.y - uy * defLen) },
      cp2: { x: Math.round(pt.x + ux * defLen), y: Math.round(pt.y + uy * defLen) },
      len: defLen,
      ux,
      uy,
    }
  }

  if (targetMode === 1) {
    // Mode 1 — Corner / independent handles
    // Preserves existing handles without altering directions or lengths
    return result
  }

  if (targetMode === 2) {
    // Mode 2 — Mirrored: collinear, exactly opposite, equal length
    if (!hasCp1 && !hasCp2) {
      const def = getDefaultHandles()
      result.cp1 = def.cp1
      result.cp2 = def.cp2
      return result
    }

    if (hasCp1 && hasCp2) {
      const v1 = { x: pt.cp1!.x - pt.x, y: pt.cp1!.y - pt.y }
      const v2 = { x: pt.cp2!.x - pt.x, y: pt.cp2!.y - pt.y }
      const l1 = Math.hypot(v1.x, v1.y)
      const l2 = Math.hypot(v2.x, v2.y)
      const avgLen = Math.round((l1 + l2) / 2) || 28
      // Tangent vector along curve (v2 - v1 points from cp1 through anchor towards cp2)
      const tX = v2.x - v1.x
      const tY = v2.y - v1.y
      const tLen = Math.hypot(tX, tY) || 1
      const ux = tX / tLen
      const uy = tY / tLen
      result.cp2 = { x: Math.round(pt.x + ux * avgLen), y: Math.round(pt.y + uy * avgLen) }
      result.cp1 = { x: Math.round(pt.x - ux * avgLen), y: Math.round(pt.y - uy * avgLen) }
    } else if (hasCp2) {
      const v2 = { x: pt.cp2!.x - pt.x, y: pt.cp2!.y - pt.y }
      result.cp1 = { x: Math.round(pt.x - v2.x), y: Math.round(pt.y - v2.y) }
      result.cp2 = { ...pt.cp2! }
    } else if (hasCp1) {
      const v1 = { x: pt.cp1!.x - pt.x, y: pt.cp1!.y - pt.y }
      result.cp2 = { x: Math.round(pt.x - v1.x), y: Math.round(pt.y - v1.y) }
      result.cp1 = { ...pt.cp1! }
    }
    return result
  }

  if (targetMode === 3) {
    // Mode 3 — Asymmetric smooth: collinear, opposite, independent lengths
    if (!hasCp1 && !hasCp2) {
      const def = getDefaultHandles()
      result.cp1 = def.cp1
      result.cp2 = def.cp2
      return result
    }

    if (hasCp1 && hasCp2) {
      const v1 = { x: pt.cp1!.x - pt.x, y: pt.cp1!.y - pt.y }
      const v2 = { x: pt.cp2!.x - pt.x, y: pt.cp2!.y - pt.y }
      const l1 = Math.hypot(v1.x, v1.y) || 25
      const l2 = Math.hypot(v2.x, v2.y) || 25
      const tX = v2.x - v1.x
      const tY = v2.y - v1.y
      const tLen = Math.hypot(tX, tY) || 1
      const ux = tX / tLen
      const uy = tY / tLen
      result.cp2 = { x: Math.round(pt.x + ux * l2), y: Math.round(pt.y + uy * l2) }
      result.cp1 = { x: Math.round(pt.x - ux * l1), y: Math.round(pt.y - uy * l1) }
    } else if (hasCp2) {
      const v2 = { x: pt.cp2!.x - pt.x, y: pt.cp2!.y - pt.y }
      const l2 = Math.hypot(v2.x, v2.y) || 25
      const l1 = Math.round(l2 * 0.7) || 20
      const ux = v2.x / l2
      const uy = v2.y / l2
      result.cp1 = { x: Math.round(pt.x - ux * l1), y: Math.round(pt.y - uy * l1) }
      result.cp2 = { ...pt.cp2! }
    } else if (hasCp1) {
      const v1 = { x: pt.cp1!.x - pt.x, y: pt.cp1!.y - pt.y }
      const l1 = Math.hypot(v1.x, v1.y) || 25
      const l2 = Math.round(l1 * 0.7) || 20
      const ux = v1.x / l1
      const uy = v1.y / l1
      result.cp2 = { x: Math.round(pt.x - ux * l2), y: Math.round(pt.y - uy * l2) }
      result.cp1 = { ...pt.cp1! }
    }
    return result
  }

  if (targetMode === 4) {
    // Mode 4 — Disconnected / free handles: independent directions and lengths
    if (!hasCp1 && !hasCp2) {
      const def = getDefaultHandles()
      result.cp1 = def.cp1
      result.cp2 = def.cp2
    }
    return result
  }

  return result
}

/**
 * Computes updated control handles when one handle is moved, respecting the point's Bézier mode:
 * - Mode 1 (Corner) or Mode 4 (Disconnected): independent, opposite handle unchanged
 * - Mode 2 (Mirrored): opposite handle is collinear, opposite direction, equal length
 * - Mode 3 (Asymmetric): opposite handle is collinear, opposite direction, existing length preserved
 */
export function updateHandleWithMode(
  pt: VectorPoint,
  cpKey: 'cp1' | 'cp2',
  newCp: { x: number; y: number }
): { cp1?: { x: number; y: number }; cp2?: { x: number; y: number } } {
  const mode = getPointBezierMode(pt)
  const isCp1 = cpKey === 'cp1'
  const otherKey = isCp1 ? 'cp2' : 'cp1'

  if (mode === 1 || mode === 4) {
    return {
      [cpKey]: newCp,
      [otherKey]: pt[otherKey],
    }
  }

  const deltaX = newCp.x - pt.x
  const deltaY = newCp.y - pt.y
  const newLen = Math.hypot(deltaX, deltaY)

  if (mode === 2) {
    // Mirrored: opposite direction and equal length
    const opp = {
      x: Math.round(pt.x - deltaX),
      y: Math.round(pt.y - deltaY),
    }
    return {
      [cpKey]: newCp,
      [otherKey]: opp,
    }
  }

  if (mode === 3) {
    // Asymmetric smooth: opposite direction, preserved opposite length
    if (newLen === 0) {
      return {
        [cpKey]: newCp,
        [otherKey]: pt[otherKey],
      }
    }
    const ux = deltaX / newLen
    const uy = deltaY / newLen
    const currentOpp = pt[otherKey]
    const oppLen = currentOpp ? Math.hypot(currentOpp.x - pt.x, currentOpp.y - pt.y) : newLen
    const opp = {
      x: Math.round(pt.x - ux * oppLen),
      y: Math.round(pt.y - uy * oppLen),
    }
    return {
      [cpKey]: newCp,
      [otherKey]: opp,
    }
  }

  return { [cpKey]: newCp, [otherKey]: pt[otherKey] }
}

export type VectorAlignTargetType = 'anchor' | 'center' | 'edge'

export interface VectorAlignMatch {
  axis: 'x' | 'y'
  targetType: VectorAlignTargetType
  coord: number
  label: string
  targetIndex?: number
  targetPoints?: { x: number; y: number }[]
  startCoord: number
  endCoord: number
}

export interface VectorAlignResult {
  x: number
  y: number
  snappedX: boolean
  snappedY: boolean
  xMatches: VectorAlignMatch[]
  yMatches: VectorAlignMatch[]
}

/**
 * Snaps an anchor point coordinate against other anchor points, layer center lines, and layer edges,
 * and returns rich visual alignment guide metadata.
 */
export function snapVectorAnchor(
  x: number,
  y: number,
  allPoints: VectorPoint[],
  currentIdx: number | number[],
  layerW: number,
  layerH: number,
  tolerance = 7
): VectorAlignResult {
  const movingIndices = Array.isArray(currentIdx) ? currentIdx : [currentIdx]

  // Gather stationary points (excluding any points currently moving)
  const stationaryPoints: { p: VectorPoint; idx: number }[] = []
  for (let i = 0; i < allPoints.length; i++) {
    if (!movingIndices.includes(i)) {
      stationaryPoints.push({ p: allPoints[i], idx: i })
    }
  }

  const centerX = round(layerW / 2)
  const centerY = round(layerH / 2)

  // Calculate extent for guide lines so they span much longer across the canvas
  const allXCoords = allPoints.map((pt) => pt.x).concat([x, 0, layerW])
  const allYCoords = allPoints.map((pt) => pt.y).concat([y, 0, layerH])
  const minX = Math.min(...allXCoords, 0) - 5000
  const maxX = Math.max(...allXCoords, layerW) + 5000
  const minY = Math.min(...allYCoords, 0) - 5000
  const maxY = Math.max(...allYCoords, layerH) + 5000

  // --------------------------------------------------------------------------
  // X Candidates (Vertical alignment lines)
  // --------------------------------------------------------------------------
  interface Candidate {
    targetType: VectorAlignTargetType
    coord: number
    delta: number
    distance: number
    label: string
    targetIndex?: number
    targetPoint?: { x: number; y: number }
  }

  const xCandidates: Candidate[] = []

  // 1. Other anchor points
  for (const item of stationaryPoints) {
    const delta = item.p.x - x
    xCandidates.push({
      targetType: 'anchor',
      coord: item.p.x,
      delta,
      distance: Math.abs(delta),
      label: 'Anchor',
      targetIndex: item.idx,
      targetPoint: { x: item.p.x, y: item.p.y },
    })
  }

  // 2. Shape vertical center line
  const dCenterX = centerX - x
  xCandidates.push({
    targetType: 'center',
    coord: centerX,
    delta: dCenterX,
    distance: Math.abs(dCenterX),
    label: 'Center',
  })

  // 3. Shape edges: Left & Right
  const dLeft = 0 - x
  xCandidates.push({
    targetType: 'edge',
    coord: 0,
    delta: dLeft,
    distance: Math.abs(dLeft),
    label: 'Left Edge',
  })

  const dRight = layerW - x
  xCandidates.push({
    targetType: 'edge',
    coord: layerW,
    delta: dRight,
    distance: Math.abs(dRight),
    label: 'Right Edge',
  })

  // --------------------------------------------------------------------------
  // Y Candidates (Horizontal alignment lines)
  // --------------------------------------------------------------------------
  const yCandidates: Candidate[] = []

  // 1. Other anchor points
  for (const item of stationaryPoints) {
    const delta = item.p.y - y
    yCandidates.push({
      targetType: 'anchor',
      coord: item.p.y,
      delta,
      distance: Math.abs(delta),
      label: 'Anchor',
      targetIndex: item.idx,
      targetPoint: { x: item.p.x, y: item.p.y },
    })
  }

  // 2. Shape horizontal center line
  const dCenterY = centerY - y
  yCandidates.push({
    targetType: 'center',
    coord: centerY,
    delta: dCenterY,
    distance: Math.abs(dCenterY),
    label: 'Center',
  })

  // 3. Shape edges: Top & Bottom
  const dTop = 0 - y
  yCandidates.push({
    targetType: 'edge',
    coord: 0,
    delta: dTop,
    distance: Math.abs(dTop),
    label: 'Top Edge',
  })

  const dBottom = layerH - y
  yCandidates.push({
    targetType: 'edge',
    coord: layerH,
    delta: dBottom,
    distance: Math.abs(dBottom),
    label: 'Bottom Edge',
  })

  // --------------------------------------------------------------------------
  // Resolve X Match
  // --------------------------------------------------------------------------
  const validX = xCandidates.filter((c) => c.distance <= tolerance).sort((a, b) => a.distance - b.distance)
  let resX = x
  let snappedX = false
  let xMatches: VectorAlignMatch[] = []

  if (validX.length > 0) {
    const bestX = validX[0]
    resX = bestX.coord
    snappedX = true

    // Gather co-located matches within 0.5px
    const coMatched = validX.filter((c) => Math.abs(c.coord - bestX.coord) < 0.5)
    const hasCenter = coMatched.some((c) => c.targetType === 'center')
    const hasEdge = coMatched.some((c) => c.targetType === 'edge')
    const hasAnchor = coMatched.some((c) => c.targetType === 'anchor')

    let targetType: VectorAlignTargetType = bestX.targetType
    let label = bestX.label

    if (hasCenter && hasAnchor) {
      label = 'Center & Anchor'
      targetType = 'center'
    } else if (hasEdge && hasAnchor) {
      const edgeCand = coMatched.find((c) => c.targetType === 'edge')
      label = `${edgeCand?.label || 'Edge'} & Anchor`
      targetType = 'edge'
    } else if (hasCenter) {
      label = 'Vertical Center'
      targetType = 'center'
    } else if (hasEdge) {
      const edgeCand = coMatched.find((c) => c.targetType === 'edge')
      label = edgeCand?.label || 'Edge'
      targetType = 'edge'
    }

    const tPoints: { x: number; y: number }[] = []
    for (const c of coMatched) {
      if (c.targetPoint) {
        if (!tPoints.some((tp) => Math.abs(tp.x - c.targetPoint!.x) < 0.5 && Math.abs(tp.y - c.targetPoint!.y) < 0.5)) {
          tPoints.push(c.targetPoint)
        }
      }
    }

    xMatches = [
      {
        axis: 'x',
        targetType,
        coord: bestX.coord,
        label,
        targetIndex: bestX.targetIndex,
        targetPoints: tPoints,
        startCoord: minY,
        endCoord: maxY,
      },
    ]
  }

  // --------------------------------------------------------------------------
  // Resolve Y Match
  // --------------------------------------------------------------------------
  const validY = yCandidates.filter((c) => c.distance <= tolerance).sort((a, b) => a.distance - b.distance)
  let resY = y
  let snappedY = false
  let yMatches: VectorAlignMatch[] = []

  if (validY.length > 0) {
    const bestY = validY[0]
    resY = bestY.coord
    snappedY = true

    const coMatched = validY.filter((c) => Math.abs(c.coord - bestY.coord) < 0.5)
    const hasCenter = coMatched.some((c) => c.targetType === 'center')
    const hasEdge = coMatched.some((c) => c.targetType === 'edge')
    const hasAnchor = coMatched.some((c) => c.targetType === 'anchor')

    let targetType: VectorAlignTargetType = bestY.targetType
    let label = bestY.label

    if (hasCenter && hasAnchor) {
      label = 'Center & Anchor'
      targetType = 'center'
    } else if (hasEdge && hasAnchor) {
      const edgeCand = coMatched.find((c) => c.targetType === 'edge')
      label = `${edgeCand?.label || 'Edge'} & Anchor`
      targetType = 'edge'
    } else if (hasCenter) {
      label = 'Horizontal Center'
      targetType = 'center'
    } else if (hasEdge) {
      const edgeCand = coMatched.find((c) => c.targetType === 'edge')
      label = edgeCand?.label || 'Edge'
      targetType = 'edge'
    }

    const tPoints: { x: number; y: number }[] = []
    for (const c of coMatched) {
      if (c.targetPoint) {
        if (!tPoints.some((tp) => Math.abs(tp.x - c.targetPoint!.x) < 0.5 && Math.abs(tp.y - c.targetPoint!.y) < 0.5)) {
          tPoints.push(c.targetPoint)
        }
      }
    }

    yMatches = [
      {
        axis: 'y',
        targetType,
        coord: bestY.coord,
        label,
        targetIndex: bestY.targetIndex,
        targetPoints: tPoints,
        startCoord: minX,
        endCoord: maxX,
      },
    ]
  }

  // Include the snapped position of the moving anchor point in targetPoints for indicator pips
  if (xMatches.length > 0) {
    xMatches[0].targetPoints = [
      { x: resX, y: resY },
      ...(xMatches[0].targetPoints || []).filter(
        (tp) => Math.abs(tp.x - resX) > 0.5 || Math.abs(tp.y - resY) > 0.5
      ),
    ]
  }
  if (yMatches.length > 0) {
    yMatches[0].targetPoints = [
      { x: resX, y: resY },
      ...(yMatches[0].targetPoints || []).filter(
        (tp) => Math.abs(tp.x - resX) > 0.5 || Math.abs(tp.y - resY) > 0.5
      ),
    ]
  }

  return {
    x: resX,
    y: resY,
    snappedX,
    snappedY,
    xMatches,
    yMatches,
  }
}

/**
 * Snaps a handle point to horizontal, vertical, or 45-degree angle relative to anchor point.
 */
export function snapVectorHandle(
  hx: number,
  hy: number,
  anchorX: number,
  anchorY: number,
  tolerance = 6
): { x: number; y: number } {
  const dx = hx - anchorX
  const dy = hy - anchorY

  // Horizontal snap
  if (Math.abs(dy) <= tolerance) {
    return { x: hx, y: anchorY }
  }
  // Vertical snap
  if (Math.abs(dx) <= tolerance) {
    return { x: anchorX, y: hy }
  }
  // 45-degree diagonal snap
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  if (Math.abs(absDx - absDy) <= tolerance) {
    const avg = (absDx + absDy) / 2
    return {
      x: Math.round(anchorX + Math.sign(dx) * avg),
      y: Math.round(anchorY + Math.sign(dy) * avg),
    }
  }

  return { x: hx, y: hy }
}

/**
 * Deep clones a VectorPoint.
 */
export function cloneVectorPoint(pt: VectorPoint): VectorPoint {
  return {
    x: pt.x,
    y: pt.y,
    cp1: pt.cp1 ? { x: pt.cp1.x, y: pt.cp1.y } : undefined,
    cp2: pt.cp2 ? { x: pt.cp2.x, y: pt.cp2.y } : undefined,
    mode: pt.mode,
  }
}

/**
 * Deep clones an array of VectorPoints.
 */
export function cloneVectorPoints(pts: VectorPoint[]): VectorPoint[] {
  return pts.map(cloneVectorPoint)
}

/**
 * Subdivides a point list using de Casteljau Bézier curve midpoint splitting
 * until it matches targetCount, preserving the exact shape contour and curve geometry.
 */
export function subdividePointsToCount(points: VectorPoint[], targetCount: number, closed: boolean = true): VectorPoint[] {
  if (points.length >= targetCount || points.length === 0) {
    return cloneVectorPoints(points)
  }

  const result = cloneVectorPoints(points)

  while (result.length < targetCount) {
    let maxDist = -1
    let splitIdx = 0

    const numSegments = closed ? result.length : Math.max(1, result.length - 1)
    for (let i = 0; i < numSegments; i++) {
      const nextIdx = (i + 1) % result.length
      const p1 = result[i]
      const p2 = result[nextIdx]
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      if (d > maxDist) {
        maxDist = d
        splitIdx = i
      }
    }

    const curr = result[splitIdx]
    const nextIdx = (splitIdx + 1) % result.length
    const next = result[nextIdx]

    // Calculate new midpoint
    let newX = round((curr.x + next.x) / 2)
    let newY = round((curr.y + next.y) / 2)
    let newCp1: { x: number; y: number } | undefined = undefined
    let newCp2: { x: number; y: number } | undefined = undefined

    // If there is curved Bézier geometry between curr and next, perform de Casteljau split at t=0.5
    if (curr.cp2 || next.cp1) {
      const p0 = { x: curr.x, y: curr.y }
      const p1 = curr.cp2 || { x: curr.x, y: curr.y }
      const p2 = next.cp1 || { x: next.x, y: next.y }
      const p3 = { x: next.x, y: next.y }

      const q0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
      const q1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      const q2 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 }

      const r0 = { x: (q0.x + q1.x) / 2, y: (q0.y + q1.y) / 2 }
      const r1 = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 }

      const s = { x: (r0.x + r1.x) / 2, y: (r0.y + r1.y) / 2 }

      curr.cp2 = { x: round(q0.x), y: round(q0.y) }
      newX = round(s.x)
      newY = round(s.y)
      newCp1 = { x: round(r0.x), y: round(r0.y) }
      newCp2 = { x: round(r1.x), y: round(r1.y) }
      next.cp1 = { x: round(q2.x), y: round(q2.y) }
    }

    const newPt: VectorPoint = {
      x: newX,
      y: newY,
      cp1: newCp1,
      cp2: newCp2,
      mode: 1,
    }

    result.splice(splitIdx + 1, 0, newPt)
  }

  return result
}

/**
 * Interpolates smoothly between two arrays of vector points at progress p (0..1).
 * Handles anchor points, incoming/outgoing control handles, Bézier modes,
 * and morphs shapes even with different anchor point counts via adaptive subdivision.
 */
export function interpolateVectorPoints(
  pts0: VectorPoint[],
  pts1: VectorPoint[],
  p: number,
  closed: boolean = true
): VectorPoint[] {
  if (!pts0 || pts0.length === 0) return pts1 ? cloneVectorPoints(pts1) : []
  if (!pts1 || pts1.length === 0) return pts0 ? cloneVectorPoints(pts0) : []

  if (p <= 0) return cloneVectorPoints(pts0)
  if (p >= 1) return cloneVectorPoints(pts1)

  let aPoints = pts0
  let bPoints = pts1

  if (aPoints.length !== bPoints.length) {
    const targetLen = Math.max(aPoints.length, bPoints.length)
    if (aPoints.length < targetLen) {
      aPoints = subdividePointsToCount(aPoints, targetLen, closed)
    }
    if (bPoints.length < targetLen) {
      bPoints = subdividePointsToCount(bPoints, targetLen, closed)
    }
  }

  const count = aPoints.length
  const result: VectorPoint[] = new Array(count)

  for (let i = 0; i < count; i++) {
    const a = aPoints[i]
    const b = bPoints[i]

    const x = round(a.x + (b.x - a.x) * p)
    const y = round(a.y + (b.y - a.y) * p)

    let cp1: { x: number; y: number } | undefined = undefined
    if (a.cp1 || b.cp1) {
      const startCp1 = a.cp1 || { x: a.x, y: a.y }
      const endCp1 = b.cp1 || { x: b.x, y: b.y }
      cp1 = {
        x: round(startCp1.x + (endCp1.x - startCp1.x) * p),
        y: round(startCp1.y + (endCp1.y - startCp1.y) * p),
      }
    }

    let cp2: { x: number; y: number } | undefined = undefined
    if (a.cp2 || b.cp2) {
      const startCp2 = a.cp2 || { x: a.x, y: a.y }
      const endCp2 = b.cp2 || { x: b.x, y: b.y }
      cp2 = {
        x: round(startCp2.x + (endCp2.x - startCp2.x) * p),
        y: round(startCp2.y + (endCp2.y - startCp2.y) * p),
      }
    }

    result[i] = {
      x,
      y,
      cp1,
      cp2,
      mode: p < 0.5 ? a.mode : b.mode,
    }
  }

  return result
}

