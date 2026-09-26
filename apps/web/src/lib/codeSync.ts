import type { Project, Layer, LayerType, ShapeKind, Background } from '#/types'
import { textFxFromPreset } from '#/lib/textFx'

export type CodeLanguage = 'react' | 'html' | 'css'

export interface CodeDiagnostic {
  line: number
  column: number
  message: number | string
  severity: 'error' | 'warning'
}

export interface CodeParseResult {
  success: boolean
  project?: Partial<Project> & { layers?: Layer[] }
  diagnostics: CodeDiagnostic[]
}

/**
 * Generate clean, modern React code for a Whoa! project (TypeScript .tsx by default or JavaScript .jsx).
 */
export function projectToReactJsx(
  project: Project,
  dialect: 'typescript' | 'javascript' = 'typescript'
): string {
  const { preset, background, layers, name, mode, duration } = project
  const bgVal = background.type === 'color'
    ? background.value
    : background.type === 'gradient'
      ? background.value
      : `url('${background.value}') center/cover no-repeat`

  const lines: string[] = []
  lines.push("import React from 'react'")
  lines.push('')

  if (dialect === 'typescript') {
    lines.push('export interface AdBannerProps {')
    lines.push('  className?: string')
    lines.push('  style?: React.CSSProperties')
    lines.push('}')
    lines.push('')
  }

  lines.push('/**')
  lines.push(` * Ad Banner: ${name || 'Untitled'}`)
  lines.push(` * Dimensions: ${preset.w}x${preset.h} (${preset.ratio || 'custom'})`)
  lines.push(` * Mode: ${mode} (${(duration / 1000).toFixed(1)}s)`)
  lines.push(' */')

  if (dialect === 'typescript') {
    lines.push('export default function AdBanner({ className, style }: AdBannerProps): React.JSX.Element {')
  } else {
    lines.push('export default function AdBanner({ className, style } = {}) {')
  }

  lines.push('  return (')
  lines.push('    <div')
  lines.push('      id="artboard"')
  lines.push('      className={`whoa-artboard ad-banner relative overflow-hidden select-none ${className || \'\'}`}')
  lines.push('      style={{')
  lines.push(`        width: ${preset.w},`)
  lines.push(`        height: ${preset.h},`)
  lines.push(`        background: '${bgVal}',`)
  lines.push('        position: \'relative\',')
  lines.push('        ...style,')
  lines.push('      }}')
  lines.push('    >')

  // Generate each layer
  for (const layer of layers) {
    if (layer.visible === false) continue
    const comment = `      {/* ${layer.name || layer.id} (${layer.type}) */}`
    lines.push(comment)

    const tag = getLayerJsxTag(layer)
    const classNames = getLayerClassNames(layer)
    const styleObj = getLayerStyleAttributes(layer)

    if (layer.type === 'text') {
      lines.push(`      <${tag}`)
      lines.push(`        id="${layer.id}"`)
      lines.push(`        className="${classNames}"`)
      lines.push('        style={{')
      for (const [k, v] of Object.entries(styleObj)) {
        lines.push(`          ${k}: ${formatStyleValue(v)},`)
      }
      lines.push('        }}')
      lines.push('      >')
      lines.push(`        ${escapeJsxText(layer.text || '')}`)
      lines.push(`      </${tag}>`)
    } else if (layer.type === 'button') {
      lines.push(`      <button`)
      lines.push(`        id="${layer.id}"`)
      lines.push(`        className="${classNames}"`)
      lines.push('        style={{')
      for (const [k, v] of Object.entries(styleObj)) {
        lines.push(`          ${k}: ${formatStyleValue(v)},`)
      }
      lines.push('        }}')
      lines.push('      >')
      lines.push(`        ${escapeJsxText(layer.text || 'Button')}`)
      lines.push(`      </button>`)
    } else if (layer.type === 'image') {
      lines.push(`      <img`)
      lines.push(`        id="${layer.id}"`)
      lines.push(`        className="${classNames}"`)
      lines.push(`        src="${layer.src || ''}"`)
      lines.push(`        alt="${layer.name || 'Ad image'}"`)
      lines.push('        style={{')
      for (const [k, v] of Object.entries(styleObj)) {
        lines.push(`          ${k}: ${formatStyleValue(v)},`)
      }
      lines.push('        }}')
      lines.push('      />')
    } else if (layer.type === 'shape') {
      lines.push(`      <div`)
      lines.push(`        id="${layer.id}"`)
      lines.push(`        className="${classNames}"`)
      lines.push(`        data-shape="${layer.shape || 'rect'}"`)
      lines.push('        style={{')
      for (const [k, v] of Object.entries(styleObj)) {
        lines.push(`          ${k}: ${formatStyleValue(v)},`)
      }
      lines.push('        }}')
      lines.push('      />')
    } else {
      lines.push(`      <div`)
      lines.push(`        id="${layer.id}"`)
      lines.push(`        className="${classNames}"`)
      lines.push('        style={{')
      for (const [k, v] of Object.entries(styleObj)) {
        lines.push(`          ${k}: ${formatStyleValue(v)},`)
      }
      lines.push('        }}')
      lines.push('      />')
    }
  }

  lines.push('    </div>')
  lines.push('  )')
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

/**
 * Generate standard HTML code for the project.
 */
export function projectToHtml(project: Project): string {
  const { preset, background, layers } = project
  const bgVal = background.type === 'color'
    ? background.value
    : background.type === 'gradient'
      ? background.value
      : `url('${background.value}') center/cover no-repeat`

  const lines: string[] = []
  lines.push(`<!-- Ad Banner: ${project.name || 'Untitled'} (${preset.w}x${preset.h}) -->`)
  lines.push(`<div id="artboard" class="ad-banner" style="position: relative; width: ${preset.w}px; height: ${preset.h}px; background: ${bgVal}; overflow: hidden;">`)

  for (const layer of layers) {
    if (layer.visible === false) continue
    const styles = getLayerCssDeclarations(layer)
    const styleAttr = Object.entries(styles).map(([k, v]) => `${k}: ${v};`).join(' ')
    const classes = getLayerClassNames(layer)

    if (layer.type === 'text') {
      const tag = layer.fontSize && layer.fontSize >= 48 ? 'h1' : layer.fontSize && layer.fontSize >= 32 ? 'h2' : 'p'
      lines.push(`  <${tag} id="${layer.id}" class="${classes}" style="${styleAttr}">`)
      lines.push(`    ${escapeHtml(layer.text || '')}`)
      lines.push(`  </${tag}>`)
    } else if (layer.type === 'button') {
      lines.push(`  <button id="${layer.id}" class="${classes}" style="${styleAttr}">`)
      lines.push(`    ${escapeHtml(layer.text || 'Button')}`)
      lines.push(`  </button>`)
    } else if (layer.type === 'image') {
      lines.push(`  <img id="${layer.id}" class="${classes}" src="${layer.src || ''}" alt="${layer.name || 'Image'}" style="${styleAttr}" />`)
    } else {
      lines.push(`  <div id="${layer.id}" class="${classes}" data-shape="${layer.shape || 'rect'}" style="${styleAttr}"></div>`)
    }
  }

  lines.push('</div>')
  return lines.join('\n')
}

/**
 * Generate scoped CSS code for the project.
 */
export function projectToCss(project: Project): string {
  const { preset, background, layers } = project
  const lines: string[] = []

  lines.push('/* Artboard Styles */')
  lines.push('#artboard {')
  lines.push('  position: relative;')
  lines.push(`  width: ${preset.w}px;`)
  lines.push(`  height: ${preset.h}px;`)
  const bgVal = background.type === 'color' ? background.value : background.value
  lines.push(`  background: ${bgVal};`)
  lines.push('  overflow: hidden;')
  lines.push('}')
  lines.push('')

  for (const layer of layers) {
    if (layer.visible === false) continue
    lines.push(`/* Layer: ${layer.name || layer.id} (${layer.type}) */`)
    lines.push(`#${layer.id} {`)
    const styles = getLayerCssDeclarations(layer)
    for (const [k, v] of Object.entries(styles)) {
      lines.push(`  ${k}: ${v};`)
    }
    lines.push('}')
    lines.push('')
  }

  return lines.join('\n')
}

/* Helper functions for Code generation */

function getLayerJsxTag(layer: Layer): string {
  if (layer.type === 'text') {
    if (layer.fontSize && layer.fontSize >= 48) return 'h1'
    if (layer.fontSize && layer.fontSize >= 32) return 'h2'
    return 'p'
  }
  if (layer.type === 'button') return 'button'
  if (layer.type === 'image') return 'img'
  return 'div'
}

function getLayerClassNames(layer: Layer): string {
  const parts: string[] = ['whoa-layer', `whoa-layer-${layer.type}`, `${layer.type}-layer`, 'absolute']
  if (layer.anim && layer.anim !== 'none') {
    parts.push(`whoa-anim-${layer.anim}`)
  } else if (layer.inAnim && layer.inAnim !== 'none') {
    parts.push(`whoa-in-${layer.inAnim}`)
  }
  if (layer.outAnim && layer.outAnim !== 'none') {
    parts.push(`whoa-out-${layer.outAnim}`)
  }
  if (layer.textFx?.kind) {
    parts.push(`whoa-fx-${layer.textFx.kind}`)
  }
  if (layer.isComponent) parts.push('whoa-component component')
  if (layer.type === 'button') parts.push('cursor-pointer font-bold')
  if (layer.type === 'image') parts.push('object-cover')
  return parts.join(' ')
}

function getLayerStyleAttributes(layer: Layer): Record<string, string | number> {
  const styles: Record<string, string | number> = {
    left: Math.round(layer.x),
    top: Math.round(layer.y),
    width: Math.round(layer.w),
    height: Math.round(layer.h),
  }

  if (layer.type === 'text' || layer.type === 'button') {
    if (layer.color) styles.color = layer.color
    if (layer.fontSize) styles.fontSize = Math.round(layer.fontSize)
    if (layer.fontFamily) styles.fontFamily = layer.fontFamily
    if (layer.fontWeight) styles.fontWeight = layer.fontWeight
    if (layer.align) styles.textAlign = layer.align
  }

  if (layer.type === 'shape' || layer.type === 'button') {
    if (layer.fill) styles.backgroundColor = layer.fill
    if (layer.radius !== undefined && layer.radius > 0) styles.borderRadius = Math.round(layer.radius)
  }

  if (layer.type === 'shape' && layer.shape === 'circle') {
    styles.borderRadius = '50%'
  }

  if (layer.opacity !== undefined && layer.opacity < 1) {
    styles.opacity = Number(layer.opacity.toFixed(2))
  }

  if (layer.rotation) {
    styles.transform = `rotate(${Math.round(layer.rotation)}deg)`
  }

  if (layer.blur) {
    styles.filter = `blur(${Math.round(layer.blur)}px)`
  }

  return styles
}

function getLayerCssDeclarations(layer: Layer): Record<string, string> {
  const css: Record<string, string> = {
    position: 'absolute',
    left: `${Math.round(layer.x)}px`,
    top: `${Math.round(layer.y)}px`,
    width: `${Math.round(layer.w)}px`,
    height: `${Math.round(layer.h)}px`,
  }

  if (layer.type === 'text' || layer.type === 'button') {
    if (layer.color) css.color = layer.color
    if (layer.fontSize) css['font-size'] = `${Math.round(layer.fontSize)}px`
    if (layer.fontFamily) css['font-family'] = `'${layer.fontFamily}', sans-serif`
    if (layer.fontWeight) css['font-weight'] = String(layer.fontWeight)
    if (layer.align) css['text-align'] = layer.align
  }

  if (layer.type === 'shape' || layer.type === 'button') {
    if (layer.fill) css['background-color'] = layer.fill
    if (layer.radius !== undefined && layer.radius > 0) css['border-radius'] = `${Math.round(layer.radius)}px`
  }

  if (layer.type === 'shape' && layer.shape === 'circle') {
    css['border-radius'] = '50%'
  }

  if (layer.opacity !== undefined && layer.opacity < 1) {
    css.opacity = String(Number(layer.opacity.toFixed(2)))
  }

  if (layer.rotation) {
    css.transform = `rotate(${Math.round(layer.rotation)}deg)`
  }

  if (layer.blur) {
    css.filter = `blur(${Math.round(layer.blur)}px)`
  }

  return css
}

function formatStyleValue(v: string | number): string {
  if (typeof v === 'number') return String(v)
  return `'${v}'`
}

function escapeJsxText(text: string): string {
  return text.replace(/{/g, "{'{'}").replace(/}/g, "{'}'}")
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Validates code for common syntax and balance errors with TypeScript-style messaging.
 */
export function validateCodeSyntax(code: string, language: CodeLanguage): CodeDiagnostic[] {
  const diagnostics: CodeDiagnostic[] = []
  if (!code.trim()) {
    diagnostics.push({ line: 1, column: 1, message: 'Source file cannot be empty', severity: 'error' })
    return diagnostics
  }

  const lines = code.split('\n')

  if (language === 'react') {
    // Check balanced curly braces
    let braceDepth = 0
    let parenDepth = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (let c = 0; c < line.length; c++) {
        const ch = line[c]
        if (ch === '{') braceDepth++
        else if (ch === '}') {
          braceDepth--
          if (braceDepth < 0) {
            diagnostics.push({
              line: i + 1,
              column: c + 1,
              message: 'TS1005: Unexpected closing brace "}". Check for extra or misplaced braces.',
              severity: 'error',
            })
            return diagnostics
          }
        } else if (ch === '(') parenDepth++
        else if (ch === ')') {
          parenDepth--
          if (parenDepth < 0) {
            diagnostics.push({
              line: i + 1,
              column: c + 1,
              message: 'TS1005: Unexpected closing parenthesis ")".',
              severity: 'error',
            })
            return diagnostics
          }
        }
      }
    }
    if (braceDepth > 0) {
      diagnostics.push({
        line: lines.length,
        column: 1,
        message: `TS1005: Expected closing brace "}". Missing ${braceDepth} closing brace(s).`,
        severity: 'error',
      })
    }
    if (parenDepth > 0) {
      diagnostics.push({
        line: lines.length,
        column: 1,
        message: `TS1005: Expected closing parenthesis ")". Missing ${parenDepth} closing parenthesis.`,
        severity: 'error',
      })
    }

    // Check for artboard root
    if (!code.includes('id="artboard"') && !code.includes("id='artboard'")) {
      diagnostics.push({
        line: 1,
        column: 1,
        message: 'TS2304: Missing root <div id="artboard"> container element representing the ad canvas.',
        severity: 'warning',
      })
    }
  } else if (language === 'css') {
    let braceCount = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (let c = 0; c < line.length; c++) {
        const ch = line[c]
        if (ch === '{') braceCount++
        else if (ch === '}') {
          braceCount--
          if (braceCount < 0) {
            diagnostics.push({
              line: i + 1,
              column: c + 1,
              message: 'CSS parse error: Unexpected closing brace "}".',
              severity: 'error',
            })
            return diagnostics
          }
        }
      }
    }
    if (braceCount > 0) {
      diagnostics.push({
        line: lines.length,
        column: 1,
        message: 'CSS parse error: Unclosed CSS declaration block. Missing "}".',
        severity: 'error',
      })
    }
  }

  return diagnostics
}

/**
 * Robust regex-assisted AST parser to convert React JSX back into updated Project and Layer objects.
 */
export function parseReactJsxToProject(
  jsxCode: string,
  currentProject: Project
): CodeParseResult {
  const diagnostics = validateCodeSyntax(jsxCode, 'react')
  const fatalErrors = diagnostics.filter((d) => d.severity === 'error')
  if (fatalErrors.length > 0) {
    return { success: false, diagnostics }
  }

  try {
    const existingLayersById = new Map<string, Layer>(currentProject.layers.map((l) => [l.id, l]))
    const newLayers: Layer[] = []

    // 1. Extract artboard attributes if present
    let artboardW = currentProject.preset.w
    let artboardH = currentProject.preset.h
    let artboardBg = currentProject.background.value

    const artboardMatch = jsxCode.match(/<div[^>]*id=["']artboard["'][^>]*style=\{\{([\s\S]*?)\}\}[^>]*>/i)
    if (artboardMatch) {
      const styleContent = artboardMatch[1]
      const wMatch = styleContent.match(/width:\s*([0-9]+)/)
      const hMatch = styleContent.match(/height:\s*([0-9]+)/)
      const bgMatch = styleContent.match(/background:\s*['"]([^'"]+)['"]/)
      if (wMatch) artboardW = parseInt(wMatch[1], 10)
      if (hMatch) artboardH = parseInt(hMatch[1], 10)
      if (bgMatch) artboardBg = bgMatch[1]
    }

    // 2. Parse elements inside the artboard
    // Match start tags with attributes and detect self-closing vs container
    const startTagRegex = /<([a-zA-Z0-9]+)\s+([\s\S]*?)(\/?>)/g
    let match: RegExpExecArray | null

    while ((match = startTagRegex.exec(jsxCode)) !== null) {
      const tagName = match[1].toLowerCase()
      const attrsStr = match[2]
      const isSelfClosing = match[3] === '/>' || tagName === 'img'

      // Skip artboard container itself
      if (attrsStr.includes('id="artboard"') || attrsStr.includes("id='artboard'")) {
        continue
      }

      // Extract ID
      const idMatch = attrsStr.match(/id=["']([^"']+)["']/)
      if (!idMatch) continue
      const id = idMatch[1].trim()

      let innerContent = ''
      if (!isSelfClosing) {
        const closeTag = `</${tagName}>`
        const closeIdx = jsxCode.indexOf(closeTag, match.index + match[0].length)
        if (closeIdx !== -1) {
          innerContent = jsxCode.slice(match.index + match[0].length, closeIdx)
        }
      }

      // Extract styles
      const styleBlockMatch = attrsStr.match(/style=\{\{([\s\S]*?)\}\}/)
      const styleMap: Record<string, string> = {}
      if (styleBlockMatch) {
        const pairs = styleBlockMatch[1].split(',')
        for (const pair of pairs) {
          const colonIdx = pair.indexOf(':')
          if (colonIdx > -1) {
            const key = pair.slice(0, colonIdx).trim()
            const rawVal = pair.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '')
            if (key) styleMap[key] = rawVal
          }
        }
      }

      // Check for shape attribute
      const shapeMatch = attrsStr.match(/data-shape=["']([^"']+)["']/)
      const shapeKind: ShapeKind = (shapeMatch ? shapeMatch[1] : 'rectangle') as ShapeKind

      // Check for image src
      const srcMatch = attrsStr.match(/src=["']([^"']+)["']/)
      const src = srcMatch ? srcMatch[1] : undefined

      // Determine layer type
      let type: LayerType = 'shape'
      if (tagName === 'h1' || tagName === 'h2' || tagName === 'p' || attrsStr.includes('text-layer')) {
        type = 'text'
      } else if (tagName === 'button' || attrsStr.includes('button-layer')) {
        type = 'button'
      } else if (tagName === 'img' || attrsStr.includes('image-layer') || src) {
        type = 'image'
      }

      // Clean inner text
      const cleanText = innerContent
        .replace(/\{'\{'\}|\{'\}'\}/g, (m) => (m === "{'{'}" ? '{' : '}'))
        .trim()

      // Extract numerical coords
      const x = styleMap.left !== undefined ? parseFloat(styleMap.left) : 100
      const y = styleMap.top !== undefined ? parseFloat(styleMap.top) : 100
      const w = styleMap.width !== undefined ? parseFloat(styleMap.width) : (type === 'text' ? 400 : 200)
      const h = styleMap.height !== undefined ? parseFloat(styleMap.height) : (type === 'text' ? 80 : 200)
      const color = styleMap.color
      const fill = styleMap.backgroundColor
      const fontSize = styleMap.fontSize !== undefined ? parseFloat(styleMap.fontSize) : undefined
      const fontFamily = styleMap.fontFamily
      const fontWeight = styleMap.fontWeight !== undefined ? parseInt(styleMap.fontWeight, 10) : undefined
      const borderRadius = styleMap.borderRadius !== undefined ? parseFloat(styleMap.borderRadius) : undefined
      const opacity = styleMap.opacity !== undefined ? parseFloat(styleMap.opacity) : 1
      const align = (styleMap.textAlign || 'left') as 'left' | 'center' | 'right'

      let rotation = 0
      if (styleMap.transform) {
        const rotMatch = styleMap.transform.match(/rotate\(([-0-9.]+)deg\)/)
        if (rotMatch) rotation = parseFloat(rotMatch[1])
      }

      // Parse animation and effect classes from className or class
      const classMatch = attrsStr.match(/className=["'`]([^"'`]+)["'`]/) || attrsStr.match(/class=["']([^"']+)["']/)
      const classStr = classMatch ? classMatch[1] : ''
      const animMatch = classStr.match(/whoa[-_]anim[-_](fade|rise|pop|slide|blur|rotate|pulse|none)/)
      const inAnimMatch = classStr.match(/whoa[-_]in[-_](fade|rise|pop|slide|blur|rotate|pulse|none)/)
      const outAnimMatch = classStr.match(/whoa[-_]out[-_](fade|rise|pop|slide|blur|rotate|pulse|none)/)
      const fxMatch = classStr.match(/whoa[-_]fx[-_](stagger-up|pop-in|blur-in|drop-in|wave)/)

      const existing = existingLayersById.get(id)
      if (existing) {
        // Update existing layer properties
        const updated: Layer = {
          ...existing,
          x: isNaN(x) ? existing.x : x,
          y: isNaN(y) ? existing.y : y,
          w: isNaN(w) ? existing.w : w,
          h: isNaN(h) ? existing.h : h,
          rotation: isNaN(rotation) ? existing.rotation : rotation,
          opacity: isNaN(opacity) ? existing.opacity : opacity,
          type,
        }
        if (animMatch) updated.anim = animMatch[1] as Layer['anim']
        if (inAnimMatch) updated.inAnim = inAnimMatch[1] as Layer['inAnim']
        if (outAnimMatch) updated.outAnim = outAnimMatch[1] as Layer['outAnim']
        if (fxMatch) {
          const fx = textFxFromPreset(fxMatch[1])
          if (fx) updated.textFx = fx
        }
        if (type === 'text' || type === 'button') {
          if (cleanText) updated.text = cleanText
          if (color) updated.color = color
          if (fontSize && !isNaN(fontSize)) updated.fontSize = fontSize
          if (fontFamily) updated.fontFamily = fontFamily
          if (fontWeight && !isNaN(fontWeight)) updated.fontWeight = fontWeight
          updated.align = align
        }
        if (type === 'shape' || type === 'button') {
          if (fill) updated.fill = fill
          if (borderRadius !== undefined && !isNaN(borderRadius)) updated.radius = borderRadius
          if (shapeKind) updated.shape = shapeKind
        }
        if (type === 'image' && src) {
          updated.src = src
        }
        newLayers.push(updated)
      } else {
        // Create brand new layer from code addition!
        const created: Layer = {
          id,
          type,
          name: id,
          x: isNaN(x) ? 100 : x,
          y: isNaN(y) ? 100 : y,
          w: isNaN(w) ? (type === 'text' ? 400 : 200) : w,
          h: isNaN(h) ? (type === 'text' ? 80 : 200) : h,
          rotation: isNaN(rotation) ? 0 : rotation,
          opacity: isNaN(opacity) ? 1 : opacity,
          visible: true,
          locked: false,
          start: 0,
          end: currentProject.duration,
          anim: (animMatch ? (animMatch[1] as Layer['anim']) : 'none'),
          inAnim: inAnimMatch ? (inAnimMatch[1] as Layer['inAnim']) : undefined,
          outAnim: outAnimMatch ? (outAnimMatch[1] as Layer['outAnim']) : undefined,
          textFx: fxMatch ? textFxFromPreset(fxMatch[1]) : undefined,
          text: type === 'text' ? (cleanText || 'New Text') : type === 'button' ? (cleanText || 'Click') : undefined,
          color: color || '#FFFFFF',
          fill: fill || (type === 'button' ? '#007AFF' : '#3B82F6'),
          fontSize: fontSize || (type === 'button' ? 24 : 36),
          fontFamily: fontFamily || 'Manrope',
          fontWeight: fontWeight || 700,
          radius: borderRadius || (type === 'button' ? 12 : 0),
          shape: shapeKind || 'rectangle',
          src: src || (type === 'image' ? 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800' : undefined),
          align,
        }
        newLayers.push(created)
      }
    }

    const updatedBg: Background = {
      ...currentProject.background,
      value: artboardBg,
    }

    return {
      success: true,
      project: {
        preset: {
          ...currentProject.preset,
          w: artboardW,
          h: artboardH,
        },
        background: updatedBg,
        layers: newLayers,
      },
      diagnostics,
    }
  } catch (err: unknown) {
    return {
      success: false,
      diagnostics: [
        {
          line: 1,
          column: 1,
          message: `Parser exception: ${err instanceof Error ? err.message : String(err)}`,
          severity: 'error',
        },
      ],
    }
  }
}

/**
 * Parse CSS changes back into layer properties.
 */
export function parseCssToProject(cssCode: string, currentProject: Project): CodeParseResult {
  const diagnostics = validateCodeSyntax(cssCode, 'css')
  const fatalErrors = diagnostics.filter((d) => d.severity === 'error')
  if (fatalErrors.length > 0) {
    return { success: false, diagnostics }
  }

  try {
    const existingLayersById = new Map<string, Layer>(currentProject.layers.map((l) => [l.id, l]))
    const newLayers: Layer[] = [...currentProject.layers]

    // Rule pattern: #selector { ... }
    const ruleRegex = /#([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g
    let match: RegExpExecArray | null

    let artboardW = currentProject.preset.w
    let artboardH = currentProject.preset.h
    let artboardBg = currentProject.background.value

    while ((match = ruleRegex.exec(cssCode)) !== null) {
      const id = match[1]
      const declBlock = match[2]
      const decls: Record<string, string> = {}

      for (const statement of declBlock.split(';')) {
        const colonIdx = statement.indexOf(':')
        if (colonIdx > -1) {
          const prop = statement.slice(0, colonIdx).trim().toLowerCase()
          const val = statement.slice(colonIdx + 1).trim()
          if (prop && val) decls[prop] = val
        }
      }

      if (id === 'artboard') {
        if (decls.width) artboardW = parseInt(decls.width, 10)
        if (decls.height) artboardH = parseInt(decls.height, 10)
        if (decls.background) artboardBg = decls.background
        continue
      }

      const layer = existingLayersById.get(id)
      if (layer) {
        const idx = newLayers.findIndex((l) => l.id === id)
        if (idx !== -1) {
          const updated = { ...newLayers[idx] }
          if (decls.left) updated.x = parseFloat(decls.left)
          if (decls.top) updated.y = parseFloat(decls.top)
          if (decls.width) updated.w = parseFloat(decls.width)
          if (decls.height) updated.h = parseFloat(decls.height)
          if (decls.color) updated.color = decls.color
          if (decls['background-color']) updated.fill = decls['background-color']
          if (decls['font-size']) updated.fontSize = parseFloat(decls['font-size'])
          if (decls['font-weight']) updated.fontWeight = parseInt(decls['font-weight'], 10)
          if (decls['border-radius']) updated.radius = parseFloat(decls['border-radius'])
          if (decls.opacity) updated.opacity = parseFloat(decls.opacity)
          if (decls.transform) {
            const rotMatch = decls.transform.match(/rotate\(([-0-9.]+)deg\)/)
            if (rotMatch) updated.rotation = parseFloat(rotMatch[1])
          }
          newLayers[idx] = updated
        }
      }
    }

    return {
      success: true,
      project: {
        preset: {
          ...currentProject.preset,
          w: artboardW,
          h: artboardH,
        },
        background: {
          ...currentProject.background,
          value: artboardBg,
        },
        layers: newLayers,
      },
      diagnostics,
    }
  } catch (err: unknown) {
    return {
      success: false,
      diagnostics: [
        {
          line: 1,
          column: 1,
          message: `CSS Parser error: ${err instanceof Error ? err.message : String(err)}`,
          severity: 'error',
        },
      ],
    }
  }
}

/**
 * Parse HTML changes back into layer properties.
 */
export function parseHtmlToProject(htmlCode: string, currentProject: Project): CodeParseResult {
  const diagnostics = validateCodeSyntax(htmlCode, 'html')
  const fatalErrors = diagnostics.filter((d) => d.severity === 'error')
  if (fatalErrors.length > 0) {
    return { success: false, diagnostics }
  }

  try {
    const existingLayersById = new Map<string, Layer>(currentProject.layers.map((l) => [l.id, l]))
    const newLayers: Layer[] = []

    let artboardW = currentProject.preset.w
    let artboardH = currentProject.preset.h
    let artboardBg = currentProject.background.value

    // 1. Artboard container style
    const artboardMatch = htmlCode.match(/<div[^>]*id=["']artboard["'][^>]*style=["']([^"']*)["'][^>]*>/i)
    if (artboardMatch) {
      const styleContent = artboardMatch[1]
      const wMatch = styleContent.match(/width:\s*([0-9.]+)px?/i)
      const hMatch = styleContent.match(/height:\s*([0-9.]+)px?/i)
      const bgMatch = styleContent.match(/background:\s*([^;]+)/i)
      if (wMatch) artboardW = parseInt(wMatch[1], 10)
      if (hMatch) artboardH = parseInt(hMatch[1], 10)
      if (bgMatch) artboardBg = bgMatch[1].trim()
    }

    // 2. Child elements
    const tagRegex = /<([a-zA-Z0-9]+)\s+([\s\S]*?)(\/?>)/g
    let match: RegExpExecArray | null

    while ((match = tagRegex.exec(htmlCode)) !== null) {
      const tagName = match[1].toLowerCase()
      const attrsStr = match[2]
      const isSelfClosing = match[3] === '/>' || tagName === 'img'

      if (attrsStr.includes('id="artboard"') || attrsStr.includes("id='artboard'")) {
        continue
      }

      const idMatch = attrsStr.match(/id=["']([^"']+)["']/)
      if (!idMatch) continue
      const id = idMatch[1].trim()

      let innerContent = ''
      if (!isSelfClosing) {
        const closeTag = `</${tagName}>`
        const closeIdx = htmlCode.indexOf(closeTag, match.index + match[0].length)
        if (closeIdx !== -1) {
          innerContent = htmlCode.slice(match.index + match[0].length, closeIdx)
        }
      }

      // Parse style attribute
      const styleMatch = attrsStr.match(/style=["']([^"']*)["']/)
      const styleMap: Record<string, string> = {}
      if (styleMatch) {
        for (const statement of styleMatch[1].split(';')) {
          const colonIdx = statement.indexOf(':')
          if (colonIdx > -1) {
            const key = statement.slice(0, colonIdx).trim().toLowerCase()
            const val = statement.slice(colonIdx + 1).trim()
            if (key && val) styleMap[key] = val
          }
        }
      }

      // Check shape kind and image src
      const shapeMatch = attrsStr.match(/data-shape=["']([^"']+)["']/)
      const shapeKind: ShapeKind = (shapeMatch ? shapeMatch[1] : 'rectangle') as ShapeKind
      const srcMatch = attrsStr.match(/src=["']([^"']+)["']/)
      const src = srcMatch ? srcMatch[1] : undefined

      // Determine layer type
      let type: LayerType = 'shape'
      if (tagName === 'h1' || tagName === 'h2' || tagName === 'p' || attrsStr.includes('text-layer')) {
        type = 'text'
      } else if (tagName === 'button' || attrsStr.includes('button-layer')) {
        type = 'button'
      } else if (tagName === 'img' || attrsStr.includes('image-layer') || src) {
        type = 'image'
      }

      const cleanText = innerContent.replace(/<[^>]*>/g, '').trim()

      const x = styleMap.left !== undefined ? parseFloat(styleMap.left) : 100
      const y = styleMap.top !== undefined ? parseFloat(styleMap.top) : 100
      const w = styleMap.width !== undefined ? parseFloat(styleMap.width) : (type === 'text' ? 400 : 200)
      const h = styleMap.height !== undefined ? parseFloat(styleMap.height) : (type === 'text' ? 80 : 200)
      const color = styleMap.color
      const fill = styleMap['background-color'] || styleMap.background
      const fontSize = styleMap['font-size'] !== undefined ? parseFloat(styleMap['font-size']) : undefined
      const fontFamily = styleMap['font-family'] ? styleMap['font-family'].replace(/['",]|sans-serif/g, '').trim() : undefined
      const fontWeight = styleMap['font-weight'] !== undefined ? parseInt(styleMap['font-weight'], 10) : undefined
      const borderRadius = styleMap['border-radius'] !== undefined ? parseFloat(styleMap['border-radius']) : undefined
      const opacity = styleMap.opacity !== undefined ? parseFloat(styleMap.opacity) : 1
      const align = (styleMap['text-align'] || 'left') as 'left' | 'center' | 'right'

      let rotation = 0
      if (styleMap.transform) {
        const rotMatch = styleMap.transform.match(/rotate\(([-0-9.]+)deg\)/)
        if (rotMatch) rotation = parseFloat(rotMatch[1])
      }

      // Parse animation and effect classes from class or className
      const classMatch = attrsStr.match(/class=["']([^"']+)["']/) || attrsStr.match(/className=["']([^"']+)["']/)
      const classStr = classMatch ? classMatch[1] : ''
      const animMatch = classStr.match(/whoa[-_]anim[-_](fade|rise|pop|slide|blur|rotate|pulse|none)/)
      const inAnimMatch = classStr.match(/whoa[-_]in[-_](fade|rise|pop|slide|blur|rotate|pulse|none)/)
      const outAnimMatch = classStr.match(/whoa[-_]out[-_](fade|rise|pop|slide|blur|rotate|pulse|none)/)
      const fxMatch = classStr.match(/whoa[-_]fx[-_](stagger-up|pop-in|blur-in|drop-in|wave)/)

      const existing = existingLayersById.get(id)
      if (existing) {
        const updated: Layer = {
          ...existing,
          x: isNaN(x) ? existing.x : x,
          y: isNaN(y) ? existing.y : y,
          w: isNaN(w) ? existing.w : w,
          h: isNaN(h) ? existing.h : h,
          rotation: isNaN(rotation) ? existing.rotation : rotation,
          opacity: isNaN(opacity) ? existing.opacity : opacity,
          type,
        }
        if (animMatch) updated.anim = animMatch[1] as Layer['anim']
        if (inAnimMatch) updated.inAnim = inAnimMatch[1] as Layer['inAnim']
        if (outAnimMatch) updated.outAnim = outAnimMatch[1] as Layer['outAnim']
        if (fxMatch) {
          const fx = textFxFromPreset(fxMatch[1])
          if (fx) updated.textFx = fx
        }
        if (type === 'text' || type === 'button') {
          if (cleanText) updated.text = cleanText
          if (color) updated.color = color
          if (fontSize && !isNaN(fontSize)) updated.fontSize = fontSize
          if (fontFamily) updated.fontFamily = fontFamily
          if (fontWeight && !isNaN(fontWeight)) updated.fontWeight = fontWeight
          updated.align = align
        }
        if (type === 'shape' || type === 'button') {
          if (fill) updated.fill = fill
          if (borderRadius !== undefined && !isNaN(borderRadius)) updated.radius = borderRadius
          if (shapeKind) updated.shape = shapeKind
        }
        if (type === 'image' && src) {
          updated.src = src
        }
        newLayers.push(updated)
      } else {
        const created: Layer = {
          id,
          type,
          name: id,
          x: isNaN(x) ? 100 : x,
          y: isNaN(y) ? 100 : y,
          w: isNaN(w) ? (type === 'text' ? 400 : 200) : w,
          h: isNaN(h) ? (type === 'text' ? 80 : 200) : h,
          rotation: isNaN(rotation) ? 0 : rotation,
          opacity: isNaN(opacity) ? 1 : opacity,
          visible: true,
          locked: false,
          start: 0,
          end: currentProject.duration,
          anim: (animMatch ? (animMatch[1] as Layer['anim']) : 'none'),
          inAnim: inAnimMatch ? (inAnimMatch[1] as Layer['inAnim']) : undefined,
          outAnim: outAnimMatch ? (outAnimMatch[1] as Layer['outAnim']) : undefined,
          textFx: fxMatch ? textFxFromPreset(fxMatch[1]) : undefined,
          text: type === 'text' ? (cleanText || 'New Text') : type === 'button' ? (cleanText || 'Click') : undefined,
          color: color || '#FFFFFF',
          fill: fill || (type === 'button' ? '#007AFF' : '#3B82F6'),
          fontSize: fontSize || (type === 'button' ? 24 : 36),
          fontFamily: fontFamily || 'Manrope',
          fontWeight: fontWeight || 700,
          radius: borderRadius || (type === 'button' ? 12 : 0),
          shape: shapeKind || 'rectangle',
          src: src || (type === 'image' ? 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800' : undefined),
          align,
        }
        newLayers.push(created)
      }
    }

    return {
      success: true,
      project: {
        preset: {
          ...currentProject.preset,
          w: artboardW,
          h: artboardH,
        },
        background: {
          ...currentProject.background,
          value: artboardBg,
        },
        layers: newLayers,
      },
      diagnostics,
    }
  } catch (err: unknown) {
    return {
      success: false,
      diagnostics: [
        {
          line: 1,
          column: 1,
          message: `HTML Parser error: ${err instanceof Error ? err.message : String(err)}`,
          severity: 'error',
        },
      ],
    }
  }
}
