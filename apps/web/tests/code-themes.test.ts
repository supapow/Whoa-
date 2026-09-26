import { describe, it, expect } from 'bun:test'
import { CODE_THEME_OPTIONS, getCodeEditorTheme, afterDarkTheme } from '#/lib/codeThemes'

describe('Code Editor Themes', () => {
  it('provides After Dark (Black) as the primary theme', () => {
    const defaultTheme = CODE_THEME_OPTIONS[0]
    expect(defaultTheme.key).toBe('after-dark')
    expect(defaultTheme.bg).toBe('#000000')
    expect(defaultTheme.label).toContain('After Dark')
  })

  it('exports afterDarkTheme directly as an extension', () => {
    expect(afterDarkTheme).toBeDefined()
    expect(Array.isArray(afterDarkTheme)).toBe(true)
  })

  it('resolves valid CodeMirror extensions for all theme keys', () => {
    const afterDark = getCodeEditorTheme('after-dark')
    const moxer = getCodeEditorTheme('moxer')
    const oneDark = getCodeEditorTheme('one-dark')

    expect(afterDark).toBeDefined()
    expect(moxer).toBeDefined()
    expect(oneDark).toBeDefined()
  })
})
