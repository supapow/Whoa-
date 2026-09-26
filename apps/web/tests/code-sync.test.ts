import { describe, expect, it } from 'bun:test'
import {
  projectToReactJsx,
  parseReactJsxToProject,
  projectToHtml,
  parseHtmlToProject,
  projectToCss,
  parseCssToProject,
  validateCodeSyntax,
} from '../src/lib/codeSync'
import type { Project, Layer } from '../src/types'

const mockProject: Project = {
  id: 'proj-1',
  name: 'Test Ad',
  preset: {
    id: 'preset-1',
    label: 'Square',
    w: 1080,
    h: 1080,
    category: 'social',
    ratio: '1:1',
  },
  background: {
    type: 'color',
    value: '#000000',
  },
  layers: [
    {
      id: 'text-heading',
      name: 'Main Title',
      type: 'text',
      x: 120,
      y: 180,
      w: 840,
      h: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      start: 0,
      end: 3000,
      anim: 'none',
      text: 'Summer Mega Sale',
      color: '#FFFFFF',
      fontSize: 64,
      fontFamily: 'Manrope',
      fontWeight: 700,
      align: 'center',
    },
    {
      id: 'cta-btn',
      name: 'CTA Button',
      type: 'button',
      x: 340,
      y: 700,
      w: 400,
      h: 80,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      start: 0,
      end: 3000,
      anim: 'none',
      text: 'Shop Now',
      fill: '#007AFF',
      color: '#FFFFFF',
      fontSize: 28,
      radius: 20,
    },
    {
      id: 'card-shape',
      name: 'Card Background',
      type: 'shape',
      shape: 'rect',
      x: 100,
      y: 140,
      w: 880,
      h: 700,
      rotation: 0,
      opacity: 0.9,
      visible: true,
      locked: false,
      start: 0,
      end: 3000,
      anim: 'none',
      fill: '#1F2937',
      radius: 32,
    },
  ],
  duration: 3000,
  mode: 'animated',
  updatedAt: Date.now(),
}

describe('codeSync - React JSX round-trip', () => {
  it('generates clean React TSX from project by default', () => {
    const tsx = projectToReactJsx(mockProject, 'typescript')
    expect(tsx).toContain("import React from 'react'")
    expect(tsx).toContain('export interface AdBannerProps')
    expect(tsx).toContain('AdBannerProps): React.JSX.Element')
    expect(tsx).toContain('id="artboard"')
    expect(tsx).toContain('id="text-heading"')
    expect(tsx).toContain('id="cta-btn"')
    expect(tsx).toContain('id="card-shape"')
    expect(tsx).toContain('Summer Mega Sale')
    expect(tsx).toContain('Shop Now')
    expect(tsx).toContain('width: 1080')
  })

  it('generates clean React JSX when javascript dialect is requested', () => {
    const jsx = projectToReactJsx(mockProject, 'javascript')
    expect(jsx).toContain("import React from 'react'")
    expect(jsx).not.toContain('export interface AdBannerProps')
    expect(jsx).toContain('export default function AdBanner({ className, style } = {})')
    expect(jsx).toContain('Summer Mega Sale')
  })

  it('parses modified text and colors back into project', () => {
    const jsx = projectToReactJsx(mockProject)
    // Modify text content and color in the JSX
    const modifiedJsx = jsx
      .replace('Summer Mega Sale', 'Autumn Flash Sale')
      .replace("color: '#FFFFFF'", "color: '#FF3B30'")
      .replace('fontSize: 64', 'fontSize: 80')

    const result = parseReactJsxToProject(modifiedJsx, mockProject)
    expect(result.success).toBe(true)
    expect(result.project?.layers).toBeDefined()

    const titleLayer = result.project?.layers?.find((l) => l.id === 'text-heading')
    expect(titleLayer).toBeDefined()
    expect(titleLayer?.text).toBe('Autumn Flash Sale')
    expect(titleLayer?.color).toBe('#FF3B30')
    expect(titleLayer?.fontSize).toBe(80)
  })

  it('supports adding a new layer directly via code', () => {
    const jsx = projectToReactJsx(mockProject)
    const newElementJsx = `
      <p
        id="badge-promo"
        className="text-layer absolute"
        style={{
          left: 150,
          top: 80,
          width: 250,
          height: 50,
          color: '#FBBF24',
          fontSize: 22,
        }}
      >
        50% OFF TODAY
      </p>
    `
    const withNewLayer = jsx.replace('</div>', `${newElementJsx}\n    </div>`)
    const result = parseReactJsxToProject(withNewLayer, mockProject)
    expect(result.success).toBe(true)

    const newLayer = result.project?.layers?.find((l) => l.id === 'badge-promo')
    expect(newLayer).toBeDefined()
    expect(newLayer?.text).toBe('50% OFF TODAY')
    expect(newLayer?.x).toBe(150)
    expect(newLayer?.y).toBe(80)
    expect(newLayer?.color).toBe('#FBBF24')
    expect(newLayer?.fontSize).toBe(22)
  })

  it('supports deleting a layer by removing its element in code', () => {
    const jsx = projectToReactJsx(mockProject)
    // Remove the CTA button element
    const withoutCta = jsx.replace(/<button[\s\S]*?<\/button>/, '')
    const result = parseReactJsxToProject(withoutCta, mockProject)
    expect(result.success).toBe(true)
    const cta = result.project?.layers?.find((l) => l.id === 'cta-btn')
    expect(cta).toBeUndefined()
    expect(result.project?.layers?.length).toBe(2)
  })

  it('reports TypeScript-style syntax errors when JSX has unclosed braces', () => {
    const brokenJsx = `
      import React from 'react'
      export default function Banner() {
        return (
          <div id="artboard" style={{ width: 1080
    `
    const diagnostics = validateCodeSyntax(brokenJsx, 'react')
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics.some((d) => d.message.toString().includes('TS1005'))).toBe(true)

    const parseRes = parseReactJsxToProject(brokenJsx, mockProject)
    expect(parseRes.success).toBe(false)
  })
})

describe('codeSync - HTML & CSS', () => {
  it('generates and parses CSS styles', () => {
    const css = projectToCss(mockProject)
    expect(css).toContain('#artboard')
    expect(css).toContain('#text-heading')
    expect(css).toContain('width: 1080px;')

    const modifiedCss = css.replace('left: 120px;', 'left: 200px;')
    const res = parseCssToProject(modifiedCss, mockProject)
    expect(res.success).toBe(true)
    const layer = res.project?.layers?.find((l) => l.id === 'text-heading')
    expect(layer?.x).toBe(200)
  })

  it('generates valid HTML representation', () => {
    const html = projectToHtml(mockProject)
    expect(html).toContain('<div id="artboard"')
    expect(html).toContain('Summer Mega Sale')
    expect(html).toContain('Shop Now')
  })

  it('updates project and propagates to TSX and CSS when coder changes fontsize in HTML', () => {
    const html = projectToHtml(mockProject)
    // Coder changes font-size: 64px (or 81px) to 30px in the HTML file
    const modifiedHtml = html.replace(/font-size:\s*64px/i, 'font-size: 30px')
    expect(modifiedHtml).toContain('font-size: 30px')

    // 1. Parse HTML back into project
    const parseResult = parseHtmlToProject(modifiedHtml, mockProject)
    expect(parseResult.success).toBe(true)
    const updatedHeading = parseResult.project?.layers?.find((l) => l.id === 'text-heading')
    expect(updatedHeading?.fontSize).toBe(30)

    // 2. Synthesize updated project state
    const updatedProject: Project = {
      ...mockProject,
      layers: parseResult.project?.layers || [],
    }

    // 3. Verify TSX (React) automatically reflects fontSize: 30
    const tsxCode = projectToReactJsx(updatedProject)
    expect(tsxCode).toContain('fontSize: 30')
    expect(tsxCode).not.toContain('fontSize: 64')

    // 4. Verify CSS automatically reflects font-size: 30px
    const cssCode = projectToCss(updatedProject)
    expect(cssCode).toContain('font-size: 30px')
    expect(cssCode).not.toContain('font-size: 64px')
  })

  it('ensures all custom animation and effect classes strictly start with whoa- or whoa_', async () => {
    const { WHOA_CLASSES, TAILWIND_CLASSES } = await import('#/lib/tailwindCompletions')
    expect(WHOA_CLASSES.length).toBeGreaterThan(15)
    for (const item of WHOA_CLASSES) {
      const startsWithWhoa = item.label.startsWith('whoa-') || item.label.startsWith('whoa_')
      expect(startsWithWhoa).toBe(true)
    }

    expect(TAILWIND_CLASSES.length).toBeGreaterThan(40)
    const hasFlex = TAILWIND_CLASSES.some((c) => c.label === 'flex')
    const hasBg = TAILWIND_CLASSES.some((c) => c.label.startsWith('bg-'))
    const hasRounded = TAILWIND_CLASSES.some((c) => c.label.startsWith('rounded-'))
    expect(hasFlex).toBe(true)
    expect(hasBg).toBe(true)
    expect(hasRounded).toBe(true)
  })

  it('syncs custom whoa-anim- and whoa-fx- classes from JSX to layer animation state', () => {
    const tsx = projectToReactJsx(mockProject)
    // Add whoa-anim-pop and whoa-fx-wave to the heading element
    const modifiedTsx = tsx.replace(
      'id="text-heading"',
      'id="text-heading" className="whoa-layer whoa-anim-pop whoa-fx-wave absolute"'
    )

    const parsed = parseReactJsxToProject(modifiedTsx, mockProject)
    expect(parsed.success).toBe(true)
    const heading = parsed.project?.layers?.find((l) => l.id === 'text-heading')
    expect(heading?.anim).toBe('pop')
    expect(heading?.textFx?.kind).toBe('wave')
  })

  it('outputs whoa-anim- classes and keyframes in generated CSS so coders can modify them', () => {
    const css = projectToCss(mockProject)
    expect(css).toContain('.whoa-anim-pulse')
    expect(css).toContain('@keyframes whoa-pulse')
    expect(css).toContain('animation: whoa-pulse')
  })

  it('detects custom animation classes in CSS and auto-creates corresponding out-animation', () => {
    const css = projectToCss(mockProject)
    // Coder defines or customizes whoa-anim-pulse-in in CSS
    const modifiedCss = `${css}
.whoa-anim-pulse-in {
  animation: whoa-pulse-in 0.8s ease-in-out forwards;
}
@keyframes whoa-pulse-in {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
`
    const parsed = parseCssToProject(modifiedCss, mockProject)
    expect(parsed.success).toBe(true)
    expect(parsed.project?.customAnimations).toBeDefined()
    const customAnims = parsed.project?.customAnimations || []

    // 1. Stored in customAnimations as in-anim with custom badge
    const customIn = customAnims.find((a) => a.id === 'pulse-custom' && a.side === 'in')
    expect(customIn).toBeDefined()
    expect(customIn?.label).toBe('Pulse In')
    expect(customIn?.isCustom).toBe(true)

    // 2. Automatically created corresponding out-anim with custom badge
    const customOut = customAnims.find((a) => a.id === 'pulse-custom-out' && a.side === 'out')
    expect(customOut).toBeDefined()
    expect(customOut?.label).toBe('Pulse Out')
    expect(customOut?.isCustom).toBe(true)
  })
})
