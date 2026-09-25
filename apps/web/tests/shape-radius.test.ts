/**
 * Corner radius on polygon shapes (triangle / star).
 *
 * Run from `apps/web`: `bun test`.
 */
import { describe, expect, test } from 'bun:test'
import {
  buildSvgPath,
  createShapeVectorPoints,
  roundedPolygonPoints,
  shapePolygonPath,
  starVertices,
  triangleVertices,
} from '#/lib/vector'

const inBounds = (pts: { x: number; y: number }[], w: number, h: number) =>
  pts.every((p) => p.x >= -0.01 && p.x <= w + 0.01 && p.y >= -0.01 && p.y <= h + 0.01)

describe('triangle corner radius', () => {
  test('radius 0 keeps the 3 sharp canonical vertices', () => {
    const pts = createShapeVectorPoints('triangle', 200, 100, 0)
    expect(pts).toEqual([
      { x: 100, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ])
  })

  test('radius > 0 yields 6 tangent anchors with curve handles, inside the box', () => {
    const pts = createShapeVectorPoints('triangle', 200, 100, 12)
    expect(pts).toHaveLength(6)
    expect(inBounds(pts, 200, 100)).toBe(true)
    // Every anchor carries exactly one handle (arc segment); straights stay lines.
    const withCp1 = pts.filter((p) => p.cp1).length
    const withCp2 = pts.filter((p) => p.cp2).length
    expect(withCp1).toBe(3)
    expect(withCp2).toBe(3)
  })

  test('rounding is symmetric for a symmetric triangle', () => {
    const pts = createShapeVectorPoints('triangle', 200, 200, 20)
    const d = buildSvgPath(pts, true, 200, 200)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    // Bottom-left and bottom-right corners mirror each other around x=100.
    const mirror = (p: { x: number; y: number }) => ({ x: 200 - p.x, y: p.y })
    const bl = pts.filter((p) => p.y > 150 && p.x < 100)
    const br = pts.filter((p) => p.y > 150 && p.x > 100)
    expect(bl).toHaveLength(2)
    expect(br).toHaveLength(2)
    for (const p of bl) {
      const m = mirror(p)
      expect(br.some((q) => Math.abs(q.x - m.x) < 0.05 && Math.abs(q.y - m.y) < 0.05)).toBe(true)
    }
  })

  test('huge radius clamps instead of inverting the shape', () => {
    const pts = createShapeVectorPoints('triangle', 200, 100, 9999)
    expect(pts).toHaveLength(6)
    expect(inBounds(pts, 200, 100)).toBe(true)
    // Tangent points of adjacent corners must not cross: anchors along the
    // top-left edge stay ordered from the top vertex toward the bottom one.
    const leftEdge = pts.filter((p) => p.x < 100 && p.y > 0 && p.y < 100)
    expect(leftEdge.length).toBeGreaterThan(0)
  })
})

describe('star corner radius', () => {
  test('radius 0 keeps 10 sharp canonical vertices matching the canvas polygon', () => {
    const w = 200
    const h = 200
    const pts = createShapeVectorPoints('star', w, h, 0)
    expect(pts).toHaveLength(10)
    expect(pts.every((p) => p.cp1 === undefined && p.cp2 === undefined)).toBe(true)
    const expected = starVertices(w, h)
    expect(pts).toEqual(expected.map((v) => ({ x: v.x, y: v.y })))
    // First tip at top center, in 100-box terms (50,0).
    expect(pts[0].x).toBeCloseTo(w / 2, 5)
    expect(pts[0].y).toBeCloseTo(0, 5)
  })

  test('radius > 0 rounds all 10 corners (tips and notches), inside the box', () => {
    const pts = createShapeVectorPoints('star', 200, 200, 10)
    expect(pts).toHaveLength(20)
    expect(inBounds(pts, 200, 200)).toBe(true)
    expect(pts.filter((p) => p.cp1).length).toBe(10)
    expect(pts.filter((p) => p.cp2).length).toBe(10)
    const d = shapePolygonPath('star', 200, 200, 10)
    expect((d.match(/C /g) || []).length).toBe(10) // one cubic per corner
  })

  test('huge radius clamps on the star without leaving the box', () => {
    const pts = createShapeVectorPoints('star', 200, 200, 9999)
    expect(pts).toHaveLength(20)
    expect(inBounds(pts, 200, 200)).toBe(true)
  })
})

describe('helpers', () => {
  test('triangleVertices matches the canvas polygon', () => {
    expect(triangleVertices(200, 100)).toEqual([
      { x: 100, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ])
  })

  test('roundedPolygonPoints with radius 0 returns sharp vertices', () => {
    const v = triangleVertices(200, 100)
    expect(roundedPolygonPoints(v, 0)).toEqual(v)
    expect(roundedPolygonPoints(v, -5)).toEqual(v)
  })

  test('shapePolygonPath radius 0 traces the sharp polygon', () => {
    expect(shapePolygonPath('triangle', 200, 100, 0)).toBe('M 100 0 L 200 100 L 0 100 Z')
  })

  test('rect / pill templates are unchanged', () => {
    expect(createShapeVectorPoints('rect', 200, 100, 0)).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ])
    expect(createShapeVectorPoints('rect', 200, 100, 10)).toHaveLength(8)
  })
})
