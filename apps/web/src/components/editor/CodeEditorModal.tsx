import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  X,
  Code2,
  Copy,
  Check,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  Layers,
} from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { oneDark } from '@codemirror/theme-one-dark'
import { useEditor } from '#/store/editor'
import { usePrefs } from '#/store/prefs'
import { tailwindAutocompleteExtension } from '#/lib/tailwindCompletions'
import {
  type CodeLanguage,
  type CodeDiagnostic,
  projectToReactJsx,
  parseReactJsxToProject,
  projectToHtml,
  parseHtmlToProject,
  projectToCss,
  parseCssToProject,
  validateCodeSyntax,
} from '#/lib/codeSync'

interface CodeEditorModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function CodeEditorModal({ isOpen, onClose }: CodeEditorModalProps) {
  const { project, replaceLayers, setArtboardDimensions, setBackground } = useEditor()
  const { codeDialect } = usePrefs()
  const [language, setLanguage] = useState<CodeLanguage>(codeDialect === 'vanilla' ? 'html' : 'react')
  const [code, setCode] = useState<string>('')
  const [diagnostics, setDiagnostics] = useState<CodeDiagnostic[]>([])
  const [copied, setCopied] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const debounceTimer = useRef<number | null>(null)
  const isInternalChange = useRef(false)

  // Initialize preferred language when modal opens
  useEffect(() => {
    if (isOpen) {
      if (codeDialect === 'vanilla') {
        setLanguage('html')
      } else {
        setLanguage('react')
      }
    }
  }, [isOpen, codeDialect])

  // Generate code representation from project whenever language changes or project updates externally
  useEffect(() => {
    if (!isOpen) return
    if (isInternalChange.current) {
      isInternalChange.current = false
      return
    }

    if (language === 'react') {
      const generated = projectToReactJsx(project, codeDialect === 'javascript' ? 'javascript' : 'typescript')
      setCode(generated)
      setDiagnostics(validateCodeSyntax(generated, 'react'))
    } else if (language === 'html') {
      const generated = projectToHtml(project)
      setCode(generated)
      setDiagnostics([])
    } else if (language === 'css') {
      const generated = projectToCss(project)
      setCode(generated)
      setDiagnostics(validateCodeSyntax(generated, 'css'))
    }
  }, [language, isOpen, project, codeDialect])

  // Language and Autocomplete extensions for CodeMirror
  const extensions = useMemo(() => {
    const langExt =
      language === 'react'
        ? javascript({ jsx: true, typescript: codeDialect === 'typescript' })
        : language === 'html'
          ? html()
          : css()

    return [langExt, tailwindAutocompleteExtension]
  }, [language, codeDialect])

  // Handle code change inside CodeMirror with debounced sync back to Canvas
  const handleCodeChange = useCallback((value: string) => {
    setCode(value)

    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current)
    }

    debounceTimer.current = window.setTimeout(() => {
      if (language === 'react') {
        const diag = validateCodeSyntax(value, 'react')
        setDiagnostics(diag)
        const hasFatal = diag.some((d) => d.severity === 'error')

        if (!hasFatal) {
          const parsed = parseReactJsxToProject(value, project)
          if (parsed.success && parsed.project) {
            isInternalChange.current = true
            setIsSyncing(true)
            if (parsed.project.preset) {
              setArtboardDimensions(parsed.project.preset.w, parsed.project.preset.h)
            }
            if (parsed.project.background) {
              setBackground(parsed.project.background)
            }
            if (parsed.project.layers) {
              replaceLayers(parsed.project.layers)
            }
            setTimeout(() => setIsSyncing(false), 300)
          }
        }
      } else if (language === 'html') {
        const diag = validateCodeSyntax(value, 'html')
        setDiagnostics(diag)
        const hasFatal = diag.some((d) => d.severity === 'error')

        if (!hasFatal) {
          const parsed = parseHtmlToProject(value, project)
          if (parsed.success && parsed.project) {
            isInternalChange.current = true
            setIsSyncing(true)
            if (parsed.project.preset) {
              setArtboardDimensions(parsed.project.preset.w, parsed.project.preset.h)
            }
            if (parsed.project.background) {
              setBackground(parsed.project.background)
            }
            if (parsed.project.layers) {
              replaceLayers(parsed.project.layers)
            }
            setTimeout(() => setIsSyncing(false), 300)
          }
        }
      } else if (language === 'css') {
        const diag = validateCodeSyntax(value, 'css')
        setDiagnostics(diag)
        const hasFatal = diag.some((d) => d.severity === 'error')

        if (!hasFatal) {
          const parsed = parseCssToProject(value, project)
          if (parsed.success && parsed.project) {
            isInternalChange.current = true
            setIsSyncing(true)
            if (parsed.project.preset) {
              setArtboardDimensions(parsed.project.preset.w, parsed.project.preset.h)
            }
            if (parsed.project.background) {
              setBackground(parsed.project.background)
            }
            if (parsed.project.layers) {
              replaceLayers(parsed.project.layers)
            }
            setTimeout(() => setIsSyncing(false), 300)
          }
        }
      }
    }, 400)
  }, [language, project, replaceLayers, setArtboardDimensions, setBackground])

  // Copy code to clipboard
  const handleCopy = () => {
    navigator.clipboard?.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Reset code to current canvas state
  const handleReset = () => {
    if (language === 'react') {
      const fresh = projectToReactJsx(project)
      setCode(fresh)
      setDiagnostics(validateCodeSyntax(fresh, 'react'))
    } else if (language === 'html') {
      const fresh = projectToHtml(project)
      setCode(fresh)
      setDiagnostics([])
    } else {
      const fresh = projectToCss(project)
      setCode(fresh)
      setDiagnostics(validateCodeSyntax(fresh, 'css'))
    }
  }

  if (!isOpen) return null

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Code Editor"
      data-testid="code-editor-modal"
      className="fixed inset-0 z-50 flex flex-col bg-[#1e1e24] text-neutral-100 backdrop-blur-xl animate-in fade-in duration-200"
    >
      {/* Top Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#16161a] px-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/20 text-accent ring-1 ring-accent/30">
              <Code2 className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight">Code Editor</h2>
                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                  v1
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 hidden sm:block">
                Edit React JSX, HTML, or CSS to manipulate banner layers live
              </p>
            </div>
          </div>

          {/* Sync Status Badge */}
          <div className="hidden xs:flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px]">
            {errorCount > 0 ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-medium text-amber-300">
                  {errorCount} {errorCount === 1 ? 'error' : 'errors'}
                </span>
              </>
            ) : isSyncing ? (
              <>
                <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
                <span className="text-accent font-medium">Syncing...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Synced with Canvas</span>
              </>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Format / Reset */}
          <button
            type="button"
            onClick={handleReset}
            title="Reset code to canvas state"
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white active:scale-95 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          {/* Copy Code */}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy code"
            data-testid="copy-code-btn"
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white active:scale-95 cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          {/* Close Editor */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Code Editor"
            title="Close Code Editor"
            data-testid="close-code-editor-btn"
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white active:scale-90 cursor-pointer ml-1"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      {/* Language Tabs & Meta Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#1a1a1f] px-3 sm:px-4">
        {/* Language Tabs */}
        <div
          role="tablist"
          aria-label="Code language mode"
          data-testid="language-tabs"
          className="flex items-center gap-1 rounded-lg bg-neutral-900/60 p-0.5 border border-white/10"
        >
          {(
            [
              {
                id: 'react',
                label: codeDialect === 'javascript' ? 'React (JSX)' : 'React (TSX)',
                ext: codeDialect === 'javascript' ? '.jsx' : '.tsx',
              },
              { id: 'html', label: 'HTML', ext: '.html' },
              { id: 'css', label: 'CSS', ext: '.css' },
            ] as const
          ).map((tab) => {
            const isActive = language === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                data-testid={`tab-${tab.id}`}
                onClick={() => {
                  isInternalChange.current = false
                  setLanguage(tab.id)
                }}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-accent text-white shadow-sm ring-1 ring-accent/60'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <FileCode className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Ad Info Chip */}
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="hidden md:inline font-mono">
            {project.preset.w}×{project.preset.h}px
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5 text-accent" />
            <strong className="text-white font-mono">{project.layers.length}</strong> layers
          </span>
        </div>
      </div>

      {/* Diagnostics / Compiler Error Banner */}
      {diagnostics.length > 0 && (
        <div
          data-testid="code-diagnostics-banner"
          className="flex flex-col gap-1 border-b border-amber-500/20 bg-amber-950/40 px-4 py-2 text-xs text-amber-200 max-h-28 overflow-y-auto"
        >
          {diagnostics.map((d, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <span className="font-mono font-bold text-amber-300">
                  Line {d.line}:{d.column} —
                </span>{' '}
                <span>{d.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CodeMirror Editor Workspace */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-[#282c34]" data-testid="codemirror-wrapper">
        <CodeMirror
          value={code}
          height="100%"
          theme={oneDark}
          extensions={extensions}
          onChange={handleCodeChange}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            history: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            defaultKeymap: true,
            searchKeymap: true,
            historyKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
          className="h-full text-xs font-mono"
        />
      </div>

      {/* Bottom Status Bar & Developer Tip */}
      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-white/10 bg-[#16161a] px-3 sm:px-4 text-[11px] text-neutral-400">
        <div className="flex items-center gap-2 truncate">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="truncate">
            💡 Elements with <code className="text-amber-300 font-mono">id="..."</code> match canvas layer IDs. Changes sync live.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 font-mono text-[10px] text-neutral-500">
          <span>UTF-8</span>
          <span>{language === 'react' ? (codeDialect === 'javascript' ? 'React (.jsx)' : 'TypeScript (.tsx)') : language.toUpperCase()}</span>
        </div>
      </footer>
    </div>
  )
}
