import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Extension } from '@codemirror/state'

export type CodeEditorThemeKey = 'after-dark' | 'moxer' | 'one-dark'

export interface CodeEditorThemeOption {
  key: CodeEditorThemeKey
  label: string
  bg: string
  fg: string
}

export const CODE_THEME_OPTIONS: CodeEditorThemeOption[] = [
  {
    key: 'after-dark',
    label: 'After Dark (Black)',
    bg: '#000000',
    fg: '#EEFFFF',
  },
  {
    key: 'moxer',
    label: 'Moxer (Black)',
    bg: '#000000',
    fg: '#8E95B4',
  },
  {
    key: 'one-dark',
    label: 'One Dark',
    bg: '#282c34',
    fg: '#abb2bf',
  },
]

// ============================================================================
// 1. VS Code "After Dark" Theme with Pitch Black Background (#000000)
// High contrast, vivid colors, warm gold cursor, optimized for JSX/TSX/HTML/CSS
// ============================================================================

const afterDarkColors = {
  bg: '#000000',
  fg: '#EEFFFF',
  gutterBg: '#000000',
  gutterFg: '#545D7E',
  activeLine: 'rgba(255, 255, 255, 0.05)',
  activeLineGutter: '#EEFFFF',
  selection: 'rgba(130, 170, 255, 0.28)',
  selectionMatch: 'rgba(255, 203, 107, 0.25)',
  cursor: '#FFCC00', // Signature After Dark gold cursor
  keyword: '#FF5370', // Coral/salmon for keywords, control flow, declarations
  tag: '#FF5370', // Tags (<div, <span, <button)
  attribute: '#FFCB6B', // JSX attributes, props (className, onClick)
  string: '#C3E88D', // Fresh vibrant lime green for strings
  func: '#82AAFF', // Soft bright blue for functions and methods
  variable: '#EEFFFF', // Crisp white/ice for variables
  constant: '#F78C6C', // Warm peach/orange for constants and numbers
  number: '#F78C6C',
  boolean: '#FF5370',
  property: '#79AAEB', // Object properties
  operator: '#89DDFF', // Electric cyan for operators
  punctuation: '#89DDFF', // Cyan brackets and delimiters
  comment: '#676E95', // Italic slate blue for comments
  type: '#FFCB6B', // Warm yellow for types and components
}

const afterDarkEditorTheme = EditorView.theme(
  {
    '&': {
      color: afterDarkColors.fg,
      backgroundColor: '#000000',
      fontSize: '13px',
      lineHeight: '1.8',
    },
    '.cm-scroller': {
      backgroundColor: '#000000',
      lineHeight: '1.8',
    },
    '.cm-content': {
      backgroundColor: '#000000',
      caretColor: afterDarkColors.cursor,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      paddingLeft: '14px',
      lineHeight: '1.8',
    },
    '.cm-line': {
      lineHeight: '1.8',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: afterDarkColors.cursor,
      borderLeftWidth: '2px',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: afterDarkColors.selection,
    },
    '.cm-panels': {
      backgroundColor: '#0a0a0e',
      color: afterDarkColors.fg,
    },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid rgba(255,255,255,0.1)' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid rgba(255,255,255,0.1)' },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(255, 203, 107, 0.3)',
      outline: '1px solid #FFCB6B',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(255, 83, 112, 0.35)',
    },
    '.cm-activeLine': {
      backgroundColor: afterDarkColors.activeLine,
    },
    '.cm-selectionMatch': {
      backgroundColor: afterDarkColors.selectionMatch,
    },
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: 'rgba(137, 221, 255, 0.25)',
      outline: '1px solid rgba(137, 221, 255, 0.6)',
      color: '#FFFFFF',
    },
    '.cm-gutters': {
      backgroundColor: '#000000',
      color: afterDarkColors.gutterFg,
      border: 'none',
      borderRight: 'none',
      lineHeight: '1.8',
    },
    '.cm-gutter': {
      border: 'none',
      borderRight: 'none',
      lineHeight: '1.8',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 16px 0 12px',
      minWidth: '28px',
      textAlign: 'right',
      lineHeight: '1.8',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255, 255, 255, 0.07)',
      color: afterDarkColors.activeLineGutter,
      fontWeight: '600',
      border: 'none',
      borderRight: 'none',
      lineHeight: '1.8',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'rgba(255,255,255,0.1)',
      border: 'none',
      color: '#FFCB6B',
    },
    '.cm-tooltip': {
      border: '1px solid rgba(255, 255, 255, 0.15)',
      backgroundColor: '#111218',
      color: afterDarkColors.fg,
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
    },
    '.cm-tooltip .cm-tooltip-arrow:before': {
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
    },
    '.cm-tooltip .cm-tooltip-arrow:after': {
      borderTopColor: '#111218',
      borderBottomColor: '#111218',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: 'rgba(130, 170, 255, 0.2)',
        color: '#FFFFFF',
      },
    },
  },
  { dark: true }
)

const afterDarkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: afterDarkColors.keyword, fontWeight: 'bold' },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: afterDarkColors.variable },
  { tag: [tags.propertyName], color: afterDarkColors.property },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], color: afterDarkColors.func },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: afterDarkColors.constant },
  { tag: [tags.definition(tags.name), tags.separator], color: afterDarkColors.fg },
  { tag: [tags.typeName, tags.className, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: afterDarkColors.type },
  { tag: [tags.number], color: afterDarkColors.number },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: afterDarkColors.operator },
  { tag: [tags.meta, tags.comment], color: afterDarkColors.comment, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: afterDarkColors.operator, textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: afterDarkColors.keyword },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: afterDarkColors.boolean },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: afterDarkColors.string },
  { tag: tags.invalid, color: '#FF5370', textDecoration: 'underline wavy' },
  { tag: [tags.tagName], color: afterDarkColors.tag, fontWeight: '600' },
  { tag: [tags.attributeName], color: afterDarkColors.attribute },
  { tag: [tags.attributeValue], color: afterDarkColors.string },
  { tag: [tags.angleBracket], color: afterDarkColors.operator },
])

export const afterDarkTheme: Extension = [afterDarkEditorTheme, syntaxHighlighting(afterDarkHighlightStyle)]

// ============================================================================
// 2. CodeMirror "Moxer" Theme with Pitch Black Background (#000000)
// Authentic port of Mattia Astorino's Moxer theme adjusted to pure black
// ============================================================================

const moxerColors = {
  bg: '#000000',
  fg: '#8E95B4',
  gutterBg: '#000000',
  gutterFg: '#494F69',
  cursor: '#FFCC00',
  selection: '#212431',
  activeLine: 'rgba(33, 36, 49, 0.65)',
  keyword: '#D46C6C',
  string: '#98C379',
  func: '#61AFEF',
  variable: '#D4D9F0',
  number: '#E5C07B',
  comment: '#545D7E',
  operator: '#56B6C2',
  property: '#8E95B4',
}

const moxerEditorTheme = EditorView.theme(
  {
    '&': {
      color: moxerColors.fg,
      backgroundColor: '#000000',
    },
    '.cm-scroller': {
      backgroundColor: '#000000',
    },
    '.cm-content': {
      backgroundColor: '#000000',
      caretColor: moxerColors.cursor,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: moxerColors.cursor,
      borderLeftWidth: '2px',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: moxerColors.selection,
    },
    '.cm-activeLine': {
      backgroundColor: moxerColors.activeLine,
    },
    '.cm-gutters': {
      backgroundColor: moxerColors.gutterBg,
      color: moxerColors.gutterFg,
      borderRight: '1px solid rgba(255, 255, 255, 0.06)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(33, 36, 49, 0.8)',
      color: '#D4D9F0',
    },
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: 'rgba(128, 203, 196, 0.25)',
      outline: '1px solid #80CBC4',
    },
  },
  { dark: true }
)

const moxerHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: moxerColors.keyword, fontWeight: 'bold' },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: moxerColors.variable },
  { tag: [tags.propertyName], color: moxerColors.property },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: moxerColors.func },
  { tag: [tags.number, tags.changed, tags.annotation], color: moxerColors.number },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp], color: moxerColors.operator },
  { tag: [tags.meta, tags.comment], color: moxerColors.comment, fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: moxerColors.string },
  { tag: [tags.tagName], color: moxerColors.keyword },
  { tag: [tags.attributeName], color: '#FFCB6B' },
  { tag: [tags.attributeValue], color: moxerColors.string },
])

export const moxerTheme: Extension = [moxerEditorTheme, syntaxHighlighting(moxerHighlightStyle)]

// ============================================================================
// Helper to resolve CodeMirror theme extension from key
// ============================================================================

export function getCodeEditorTheme(key: CodeEditorThemeKey): Extension {
  switch (key) {
    case 'after-dark':
      return afterDarkTheme
    case 'moxer':
      return moxerTheme
    case 'one-dark':
      return oneDark
    default:
      return afterDarkTheme
  }
}
