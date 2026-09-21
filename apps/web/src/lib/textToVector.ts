import * as opentype from 'opentype.js'
import type { Layer, VectorPoint } from '#/types'
import { uid } from '#/lib/data'
import { computeGroupBounds } from '#/lib/groups'

// In-memory cache for parsed fonts to ensure instant subsequent conversions
const fontCache = new Map<string, opentype.Font>()
const pendingFontLoads = new Map<string, Promise<opentype.Font>>()

/**
 * Determine the best local font file based on fontFamily and fontWeight.
 */
export function getFontFileForFamily(fontFamily: string = 'Manrope', fontWeight: number = 700): string {
  const fam = fontFamily.toLowerCase()
  const isBold = fontWeight >= 600

  if (fam.includes('serif') || fam.includes('playfair') || fam.includes('georgia')) {
    return '/fonts/serif-bold.otf'
  }
  if (fam.includes('mono') || fam.includes('courier')) {
    return '/fonts/mono-bold.otf'
  }
  if (fam.includes('ibm') && !isBold) {
    return '/fonts/sans-regular.otf'
  }
  return isBold ? '/fonts/sans-bold.otf' : '/fonts/sans-regular.otf'
}

/**
 * Load and parse an OpenType font file with caching.
 */
export async function loadFont(fontFamily: string = 'Manrope', fontWeight: number = 700): Promise<opentype.Font> {
  const fontFile = getFontFileForFamily(fontFamily, fontWeight)

  if (fontCache.has(fontFile)) {
    return fontCache.get(fontFile)!
  }

  if (pendingFontLoads.has(fontFile)) {
    return pendingFontLoads.get(fontFile)!
  }

  const loadPromise = (async () => {
    try {
      const res = await fetch(fontFile)
      if (!res.ok) {
        throw new Error(`Failed to load font from ${fontFile}: ${res.statusText}`)
      }
      const buffer = await res.arrayBuffer()
      const font = opentype.parse(buffer)
      fontCache.set(fontFile, font)
      return font
    } catch (err) {
      console.warn(`[textToVector] Failed to load ${fontFile}, attempting sans-bold fallback:`, err)
      if (fontFile !== '/fonts/sans-bold.otf') {
        const fallbackRes = await fetch('/fonts/sans-bold.otf')
        const fallbackBuf = await fallbackRes.arrayBuffer()
        const font = opentype.parse(fallbackBuf)
        fontCache.set(fontFile, font)
        return font
      }
      throw err
    } finally {
      pendingFontLoads.delete(fontFile)
    }
  })()

  pendingFontLoads.set(fontFile, loadPromise)
  return loadPromise
}

/**
 * Format raw number to fixed decimals avoiding scientific notation and rounding bugs.
 */
function fmt(num: number): number {
  return Math.round(num * 100) / 100
}

/**
 * Clean SVG path builder directly from OpenType commands without opentype.js v2 NaN bugs.
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
      // Direct quadratic Bézier command
      d += `Q ${fmt((cmd.x1 + dx) * sx)} ${fmt((cmd.y1 + dy) * sy)} ${fmt((cmd.x + dx) * sx)} ${fmt((cmd.y + dy) * sy)} `
    } else if (cmd.type === 'Z') {
      d += 'Z '
    }
  }

  return d.trim()
}

/**
 * Converts OpenType path commands into Bannr's editable VectorPoint[] format.
 * Converts quadratic Béziers to cubic Béziers for full handle compatibility.
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
        x: Math.round((cmd.x + dx) * sx),
        y: Math.round((cmd.y + dy) * sy),
        mode: 1,
        subpathStart: true,
      }
      points.push(pt)
      currPoint = pt
      startPoint = pt
    } else if (cmd.type === 'L') {
      const pt: VectorPoint = {
        x: Math.round((cmd.x + dx) * sx),
        y: Math.round((cmd.y + dy) * sy),
        mode: 1,
      }
      points.push(pt)
      currPoint = pt
    } else if (cmd.type === 'C') {
      if (currPoint) {
        currPoint.cp2 = {
          x: Math.round((cmd.x1 + dx) * sx),
          y: Math.round((cmd.y1 + dy) * sy),
        }
      }
      const pt: VectorPoint = {
        x: Math.round((cmd.x + dx) * sx),
        y: Math.round((cmd.y + dy) * sy),
        cp1: {
          x: Math.round((cmd.x2 + dx) * sx),
          y: Math.round((cmd.y2 + dy) * sy),
        },
        mode: 1,
      }
      points.push(pt)
      currPoint = pt
    } else if (cmd.type === 'Q') {
      // Mathematical conversion of Quadratic (P0, CP, P1) to Cubic (P0, CP1, CP2, P1)
      const p0 = currPoint ? { x: currPoint.x, y: currPoint.y } : { x: (cmd.x1 + dx) * sx, y: (cmd.y1 + dy) * sy }
      const cpx = (cmd.x1 + dx) * sx
      const cpy = (cmd.y1 + dy) * sy
      const p1x = (cmd.x + dx) * sx
      const p1y = (cmd.y + dy) * sy

      const cp1x = p0.x + (2 / 3) * (cpx - p0.x)
      const cp1y = p0.y + (2 / 3) * (cpy - p0.y)
      const cp2x = p1x + (2 / 3) * (cpx - p1x)
      const cp2y = p1y + (2 / 3) * (cpy - p1y)

      if (currPoint) {
        currPoint.cp2 = { x: Math.round(cp1x), y: Math.round(cp1y) }
      }
      const pt: VectorPoint = {
        x: Math.round(p1x),
        y: Math.round(p1y),
        cp1: { x: Math.round(cp2x), y: Math.round(cp2y) },
        mode: 1,
      }
      points.push(pt)
      currPoint = pt
    } else if (cmd.type === 'Z') {
      // Connect to start point if needed
      if (currPoint && startPoint && currPoint !== startPoint) {
        if (Math.hypot(currPoint.x - startPoint.x, currPoint.y - startPoint.y) <= 2) {
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

export interface ConvertedTextResult {
  mode: 'single' | 'group'
  singleLayer?: Layer
  groupLayer?: Layer
  childLayers?: Layer[]
}

/**
 * Main conversion function: converts a live Text layer into vector path layer(s).
 * - 'single': combines all characters into a single unified vector path layer.
 * - 'group': creates a group containing an individual vector path layer for every letter.
 */
export async function convertTextLayerToVectors(
  textLayer: Layer,
  mode: 'single' | 'group' = 'single'
): Promise<ConvertedTextResult> {
  const text = textLayer.text?.trim() || 'Text'
  const fontSize = Math.max(12, textLayer.fontSize || 54)
  const fontFamily = textLayer.fontFamily || 'Manrope'
  const fontWeight = textLayer.fontWeight || 700
  const font = await loadFont(fontFamily, fontWeight)

  const lines = text.split('\n')
  const lineHeight = fontSize * 1.2
  const baselineOffset = fontSize * 0.85

  // First pass: measure each line's width to support text alignment (left / center / right)
  const lineMetrics = lines.map((line) => {
    if (!line) return { lineWidth: 0, glyphPaths: [] }
    const glyphPaths = font.getPaths(line, 0, 0, fontSize)
    let minX = Infinity
    let maxX = -Infinity
    for (const gp of glyphPaths) {
      if (gp.commands.length > 0) {
        const bb = gp.getBoundingBox()
        minX = Math.min(minX, bb.x1)
        maxX = Math.max(maxX, bb.x2)
      }
    }
    const lineWidth = isFinite(minX) && isFinite(maxX) ? maxX - minX : font.getAdvanceWidth(line, fontSize)
    return { lineWidth: Math.max(1, lineWidth), glyphPaths }
  })

  const maxLineWidth = Math.max(...lineMetrics.map((m) => m.lineWidth), 1)

  // Position glyphs according to line, alignment, and baseline
  type PositionedGlyph = {
    char: string
    commands: opentype.PathCommand[]
    bbox: { x1: number; y1: number; x2: number; y2: number }
    originX: number
    originY: number
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
    const glyphPaths = font.getPaths(line, lineStartX, lineY, fontSize)

    line.split('').forEach((char, charIdx) => {
      const gp = glyphPaths[charIdx]
      if (!gp || char === ' ' || gp.commands.length === 0) return

      const bb = gp.getBoundingBox()
      globalMinX = Math.min(globalMinX, bb.x1)
      globalMinY = Math.min(globalMinY, bb.y1)
      globalMaxX = Math.max(globalMaxX, bb.x2)
      globalMaxY = Math.max(globalMaxY, bb.y2)

      allGlyphs.push({
        char,
        commands: gp.commands,
        bbox: bb,
        originX: lineStartX,
        originY: lineY,
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
    const localPoints = commandsToVectorPoints(allCommands, -globalMinX, -globalMinY)

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
      fillRule: 'evenodd',
      closed: true,
      pathData: localSvgPath,
      points: localPoints,
    }

    return { mode: 'single', singleLayer }
  }

  // Mode B: Create a Group containing an individual vector path layer for every letter
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
    const glyphPoints = commandsToVectorPoints(g.commands, -g.bbox.x1, -g.bbox.y1)

    const childLayer: Layer = {
      id: uid(),
      type: 'path',
      name: `Letter ${g.char}`,
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
      fillRule: 'evenodd',
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
