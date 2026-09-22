import * as opentype from 'opentype.js'
import type { Layer, VectorPoint } from '#/types'
import { uid } from '#/lib/data'
import { computeGroupBounds } from '#/lib/groups'
import { simplifyVectorPoints } from '#/lib/vector'
import { getVerifiedOpenTypeFont } from '#/lib/fonts'

/**
 * Load and parse an OpenType font file with caching and fallbacks.
 * Uses getVerifiedOpenTypeFont to ensure genuine vector curves without faux synthesized weights.
 */
export async function loadFont(fontFamily: string = 'Manrope', fontWeight: number = 700): Promise<opentype.Font> {
  return getVerifiedOpenTypeFont(fontFamily, fontWeight)
}

/**
 * Format raw number to fixed decimals avoiding scientific notation and rounding jitter.
 */
function fmt(num: number): number {
  return Math.round(num * 100) / 100
}

/**
 * High-precision SVG path string generator from OpenType commands.
 */
export function commandsToSvgPath(
  commands: opentype.PathCommand[],
  dx: number = 0,
  dy: number = 0,
  sx: number = 1,
  sy: number = 1
): string {
  if (!commands || commands.length === 0) return ''
  let d = ''

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      d += `M ${fmt((cmd.x + dx) * sx)} ${fmt((cmd.y + dy) * sy)} `
    } else if (cmd.type === 'L') {
      d += `L ${fmt((cmd.x + dx) * sx)} ${fmt((cmd.y + dy) * sy)} `
    } else if (cmd.type === 'C') {
      d += `C ${fmt((cmd.x1 + dx) * sx)} ${fmt((cmd.y1 + dy) * sy)} ${fmt((cmd.x2 + dx) * sx)} ${fmt((cmd.y2 + dy) * sy)} ${fmt((cmd.x + dx) * sx)} ${fmt((cmd.y + dy) * sy)} `
    } else if (cmd.type === 'Q') {
      d += `Q ${fmt((cmd.x1 + dx) * sx)} ${fmt((cmd.y1 + dy) * sy)} ${fmt((cmd.x + dx) * sx)} ${fmt((cmd.y + dy) * sy)} `
    } else if (cmd.type === 'Z') {
      d += 'Z '
    }
  }

  return d.trim()
}

/**
 * Converts OpenType path commands into Bannr's editable VectorPoint[] format.
 * - Preserves floating-point precision (2 decimal places) for razor-sharp letter geometry.
 * - Converts TrueType quadratic Béziers to cubic Béziers for full handle compatibility.
 * - Prevents duplicate anchor points at subpath closures.
 * - Smoothly connects closed contours with incoming and outgoing Bézier handles.
 */
export function commandsToVectorPoints(
  commands: opentype.PathCommand[],
  dx: number = 0,
  dy: number = 0,
  sx: number = 1,
  sy: number = 1
): VectorPoint[] {
  if (!commands || commands.length === 0) return []
  const points: VectorPoint[] = []
  let currPoint: VectorPoint | null = null
  let startPoint: VectorPoint | null = null

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      const pt: VectorPoint = {
        x: fmt((cmd.x + dx) * sx),
        y: fmt((cmd.y + dy) * sy),
        mode: 1,
        subpathStart: true,
      }
      points.push(pt)
      currPoint = pt
      startPoint = pt
    } else if (cmd.type === 'L') {
      const px = fmt((cmd.x + dx) * sx)
      const py = fmt((cmd.y + dy) * sy)

      // Skip 0-distance duplicate line segments emitted by font decoders
      if (currPoint && Math.abs(px - currPoint.x) < 0.25 && Math.abs(py - currPoint.y) < 0.25) {
        continue
      }

      // If this line segment closes back to the start point, do not duplicate the anchor
      if (startPoint && Math.hypot(px - startPoint.x, py - startPoint.y) < 0.35) {
        continue
      }

      const pt: VectorPoint = {
        x: px,
        y: py,
        mode: 1,
      }
      points.push(pt)
      currPoint = pt
    } else if (cmd.type === 'C') {
      const px = fmt((cmd.x + dx) * sx)
      const py = fmt((cmd.y + dy) * sy)
      const cp1x = fmt((cmd.x1 + dx) * sx)
      const cp1y = fmt((cmd.y1 + dy) * sy)
      const cp2x = fmt((cmd.x2 + dx) * sx)
      const cp2y = fmt((cmd.y2 + dy) * sy)

      const isClosing = startPoint && Math.hypot(px - startPoint.x, py - startPoint.y) < 0.35
      if (isClosing) {
        if (currPoint) currPoint.cp2 = { x: cp1x, y: cp1y }
        if (startPoint) startPoint.cp1 = { x: cp2x, y: cp2y }
        continue
      }

      if (currPoint) {
        currPoint.cp2 = { x: cp1x, y: cp1y }
      }
      const pt: VectorPoint = {
        x: px,
        y: py,
        cp1: { x: cp2x, y: cp2y },
        mode: 1,
      }
      points.push(pt)
      currPoint = pt
    } else if (cmd.type === 'Q') {
      // Quadratic to Cubic Bézier conversion
      const p0 = currPoint
        ? { x: currPoint.x, y: currPoint.y }
        : { x: fmt((cmd.x1 + dx) * sx), y: fmt((cmd.y1 + dy) * sy) }
      const cpx = (cmd.x1 + dx) * sx
      const cpy = (cmd.y1 + dy) * sy
      const p1x = (cmd.x + dx) * sx
      const p1y = (cmd.y + dy) * sy

      const cp1x = fmt(p0.x + (2 / 3) * (cpx - p0.x))
      const cp1y = fmt(p0.y + (2 / 3) * (cpy - p0.y))
      const cp2x = fmt(p1x + (2 / 3) * (cpx - p1x))
      const cp2y = fmt(p1y + (2 / 3) * (cpy - p1y))
      const px = fmt(p1x)
      const py = fmt(p1y)

      const isClosing = startPoint && Math.hypot(px - startPoint.x, py - startPoint.y) < 0.35
      if (isClosing) {
        if (currPoint) currPoint.cp2 = { x: cp1x, y: cp1y }
        if (startPoint) startPoint.cp1 = { x: cp2x, y: cp2y }
        continue
      }

      if (currPoint) {
        currPoint.cp2 = { x: cp1x, y: cp1y }
      }
      const pt: VectorPoint = {
        x: px,
        y: py,
        cp1: { x: cp2x, y: cp2y },
        mode: 1,
      }
      points.push(pt)
      currPoint = pt
    } else if (cmd.type === 'Z') {
      if (currPoint && startPoint && currPoint !== startPoint) {
        if (Math.hypot(currPoint.x - startPoint.x, currPoint.y - startPoint.y) < 0.35) {
          if (currPoint.cp1 && !startPoint.cp1) {
            startPoint.cp1 = currPoint.cp1
          }
          points.pop()
        }
      }
    }
  }

  return points
}

export interface ConvertOptions {
  preserveLigatures?: boolean
  simplifyPaths?: boolean
}

export interface ConvertedTextResult {
  mode: 'single' | 'group'
  singleLayer?: Layer
  groupLayer?: Layer
  childLayers?: Layer[]
}

/**
 * Converts a live Text layer into vector path layer(s).
 * - 'single': combines all characters into a single unified vector path layer with accurate ligatures and curves.
 * - 'group': creates a group containing an individual vector path layer for every letter/ligature glyph.
 */
export async function convertTextLayerToVectors(
  textLayer: Layer,
  mode: 'single' | 'group' = 'single',
  options: ConvertOptions = {}
): Promise<ConvertedTextResult> {
  const text = textLayer.text || 'Text'
  const fontSize = Math.max(12, textLayer.fontSize || 54)
  const fontFamily = textLayer.fontFamily || 'Manrope'
  const fontWeight = textLayer.fontWeight || 700
  const font = await loadFont(fontFamily, fontWeight)

  // Configure OpenType features: enable ligatures by default (matching browser text rendering)
  const useLigatures = options.preserveLigatures !== false
  const renderOptions = {
    features: {
      liga: useLigatures,
      calt: useLigatures,
      rclt: useLigatures,
    },
  }

  const lines = text.split('\n')
  const lineHeight = fontSize * 1.2
  const baselineOffset = fontSize * 0.85

  // First pass: measure line widths accurately using font.forEachGlyph to honor kerning and ligatures
  const lineMetrics = lines.map((line) => {
    if (!line) return { lineWidth: 0 }
    let minX = Infinity
    let maxX = -Infinity
    font.forEachGlyph(line, 0, 0, fontSize, renderOptions, (glyph, gx, gy, gSize) => {
      if (glyph.name === 'space' || !glyph.unicode && !glyph.name) return
      const p = glyph.getPath(gx, gy, gSize, renderOptions)
      if (p.commands.length > 0) {
        const bb = p.getBoundingBox()
        minX = Math.min(minX, bb.x1)
        maxX = Math.max(maxX, bb.x2)
      }
    })
    const lineWidth = isFinite(minX) && isFinite(maxX) ? maxX - minX : font.getAdvanceWidth(line, fontSize)
    return { lineWidth: Math.max(1, lineWidth) }
  })

  const maxLineWidth = Math.max(...lineMetrics.map((m) => m.lineWidth), 1)

  // Position glyphs according to line, alignment, and baseline
  type PositionedGlyph = {
    label: string
    commands: opentype.PathCommand[]
    bbox: { x1: number; y1: number; x2: number; y2: number }
  }

  const allGlyphs: PositionedGlyph[] = []
  let globalMinX = Infinity
  let globalMinY = Infinity
  let globalMaxX = -Infinity
  let globalMaxY = -Infinity

  lines.forEach((line, lineIdx) => {
    if (!line) return
    const { lineWidth } = lineMetrics[lineIdx]
    let lineStartX = 0
    if (textLayer.align === 'center') {
      lineStartX = (maxLineWidth - lineWidth) / 2
    } else if (textLayer.align === 'right') {
      lineStartX = maxLineWidth - lineWidth
    }

    const lineY = lineIdx * lineHeight + baselineOffset

    font.forEachGlyph(line, lineStartX, lineY, fontSize, renderOptions, (glyph, gx, gy, gSize) => {
      if (glyph.name === 'space') return
      const p = glyph.getPath(gx, gy, gSize, renderOptions)
      if (p.commands.length === 0) return

      const bb = p.getBoundingBox()
      globalMinX = Math.min(globalMinX, bb.x1)
      globalMinY = Math.min(globalMinY, bb.y1)
      globalMaxX = Math.max(globalMaxX, bb.x2)
      globalMaxY = Math.max(globalMaxY, bb.y2)

      // Derive human-readable label
      let label = glyph.name || 'Char'
      if (label.includes('.liga') || label.includes('_')) {
        const cleanName = label.replace('.liga', '').replace(/_/g, '')
        label = `Ligature ${cleanName}`
      } else if (glyph.unicode) {
        label = `Letter ${String.fromCodePoint(glyph.unicode)}`
      } else {
        label = `Letter ${label}`
      }

      allGlyphs.push({
        label,
        commands: p.commands,
        bbox: bb,
      })
    })
  })

  // Handle case where text has no visible glyphs
  if (allGlyphs.length === 0 || !isFinite(globalMinX)) {
    globalMinX = 0
    globalMinY = 0
    globalMaxX = 100
    globalMaxY = 100
  }

  const totalWidth = Math.max(20, Math.round(globalMaxX - globalMinX))
  const totalHeight = Math.max(20, Math.round(globalMaxY - globalMinY))

  // Calculate target position on artboard: align vector bounds with text layer
  let targetX = textLayer.x
  if (textLayer.align === 'center') {
    targetX = Math.round(textLayer.x + (textLayer.w - totalWidth) / 2)
  } else if (textLayer.align === 'right') {
    targetX = Math.round(textLayer.x + textLayer.w - totalWidth)
  }
  const targetY = Math.round(textLayer.y + Math.max(0, (textLayer.h - totalHeight) / 2))

  if (mode === 'single') {
    // Mode A: Combine all glyphs into a single unified vector path layer
    const allCommands: opentype.PathCommand[] = []
    for (const g of allGlyphs) {
      allCommands.push(...g.commands)
    }

    // Offset commands so they sit at (0, 0) inside the layer's local coordinate system
    const localSvgPath = commandsToSvgPath(allCommands, -globalMinX, -globalMinY)
    const rawPoints = commandsToVectorPoints(allCommands, -globalMinX, -globalMinY)
    const localPoints = options.simplifyPaths !== false ? simplifyVectorPoints(rawPoints, 0.75) : rawPoints

    const singleLayer: Layer = {
      id: uid(),
      type: 'path',
      name: `${textLayer.name || 'Text'} (Vector)`,
      x: targetX,
      y: targetY,
      w: totalWidth,
      h: totalHeight,
      rotation: textLayer.rotation ?? 0,
      opacity: textLayer.opacity ?? 1,
      visible: textLayer.visible !== false,
      alwaysVisible: textLayer.alwaysVisible,
      locked: textLayer.locked ?? false,
      start: textLayer.start ?? 0,
      end: textLayer.end ?? 5000,
      anim: textLayer.anim ?? 'none',
      inAnim: textLayer.inAnim,
      outAnim: textLayer.outAnim,
      inRotateStart: textLayer.inRotateStart,
      inRotateEnd: textLayer.inRotateEnd,
      inRotateMs: textLayer.inRotateMs,
      outRotateStart: textLayer.outRotateStart,
      outRotateEnd: textLayer.outRotateEnd,
      outRotateMs: textLayer.outRotateMs,
      groupId: textLayer.groupId,
      blur: textLayer.blur,
      blurType: textLayer.blurType,
      fill: textLayer.color || '#FFFFFF',
      stroke: undefined,
      strokeWidth: 0,
      fillRule: 'nonzero',
      closed: true,
      pathData: localSvgPath,
      points: localPoints,
    }

    return { mode: 'single', singleLayer }
  }

  // Mode B: Create a Group containing an individual vector path layer for every letter/ligature
  const parentGroupId = uid()
  const childLayers: Layer[] = []

  for (let i = 0; i < allGlyphs.length; i++) {
    const g = allGlyphs[i]
    const gw = Math.max(4, Math.round(g.bbox.x2 - g.bbox.x1))
    const gh = Math.max(4, Math.round(g.bbox.y2 - g.bbox.y1))
    const gx = Math.round(targetX + (g.bbox.x1 - globalMinX))
    const gy = Math.round(targetY + (g.bbox.y1 - globalMinY))

    // Local path inside this glyph's bounding box
    const glyphPath = commandsToSvgPath(g.commands, -g.bbox.x1, -g.bbox.y1)
    const rawGlyphPoints = commandsToVectorPoints(g.commands, -g.bbox.x1, -g.bbox.y1)
    const glyphPoints = options.simplifyPaths !== false ? simplifyVectorPoints(rawGlyphPoints, 0.75) : rawGlyphPoints

    const childLayer: Layer = {
      id: uid(),
      type: 'path',
      name: g.label,
      x: gx,
      y: gy,
      w: gw,
      h: gh,
      rotation: 0,
      opacity: textLayer.opacity ?? 1,
      visible: true,
      alwaysVisible: textLayer.alwaysVisible,
      locked: false,
      start: textLayer.start ?? 0,
      end: textLayer.end ?? 5000,
      anim: textLayer.anim ?? 'none',
      groupId: parentGroupId,
      fill: textLayer.color || '#FFFFFF',
      fillRule: 'nonzero',
      closed: true,
      pathData: glyphPath,
      points: glyphPoints,
    }

    childLayers.push(childLayer)
  }

  const groupBounds = computeGroupBounds(parentGroupId, childLayers)

  const groupLayer: Layer = {
    id: parentGroupId,
    type: 'group',
    name: `${textLayer.name || 'Text'} (Letters)`,
    x: groupBounds.x,
    y: groupBounds.y,
    w: groupBounds.w,
    h: groupBounds.h,
    rotation: textLayer.rotation ?? 0,
    opacity: textLayer.opacity ?? 1,
    visible: textLayer.visible !== false,
    alwaysVisible: textLayer.alwaysVisible,
    locked: textLayer.locked ?? false,
    start: textLayer.start ?? 0,
    end: textLayer.end ?? 5000,
    anim: textLayer.anim ?? 'none',
    groupId: textLayer.groupId,
    collapsed: false,
  }

  return {
    mode: 'group',
    groupLayer,
    childLayers,
  }
}
