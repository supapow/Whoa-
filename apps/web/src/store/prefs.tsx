import React, { createContext, useContext, useState } from 'react'

export type CodeDialect = 'typescript' | 'javascript' | 'vanilla'

interface PrefsContextType {
  /** When on, new elements get an automatic in-animation (per-type default). Off by default. */
  autoAnimateNewLayers: boolean
  setAutoAnimateNewLayers: (v: boolean) => void
  /** When on, displays element IDs and class tags on canvas for code referencing. */
  showElementIdsAndClasses: boolean
  setShowElementIdsAndClasses: (v: boolean) => void
  /** Tracks whether the user has accessed code mode yet (for auto-activating IDs on first visit). */
  hasOpenedCodeEditor: boolean
  setHasOpenedCodeEditor: (v: boolean) => void
  /** Preferred code dialect / format: typescript (.tsx) default, javascript (.jsx), or vanilla (.html/.js) */
  codeDialect: CodeDialect
  setCodeDialect: (dialect: CodeDialect) => void
}

const PrefsContext = createContext<PrefsContextType | null>(null)

const STORAGE_KEY = 'woah-auto-animate'
const STORAGE_KEY_SHOW_IDS = 'woah-show-element-ids-classes'
const STORAGE_KEY_CODE_VISITED = 'woah-has-opened-code-editor'
const STORAGE_KEY_CODE_DIALECT = 'woah-code-dialect'

function readStored(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function readStoredShowIds(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY_SHOW_IDS) === '1'
  } catch {
    return false
  }
}

function readStoredCodeVisited(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY_CODE_VISITED) === '1'
  } catch {
    return false
  }
}

function readStoredCodeDialect(): CodeDialect {
  if (typeof window === 'undefined') return 'typescript'
  try {
    const val = localStorage.getItem(STORAGE_KEY_CODE_DIALECT)
    if (val === 'javascript' || val === 'vanilla' || val === 'typescript') {
      return val
    }
    return 'typescript'
  } catch {
    return 'typescript'
  }
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [autoAnimateNewLayers, setState] = useState<boolean>(readStored)
  const [showElementIdsAndClasses, setShowIdsState] = useState<boolean>(readStoredShowIds)
  const [hasOpenedCodeEditor, setCodeVisitedState] = useState<boolean>(readStoredCodeVisited)
  const [codeDialect, setCodeDialectState] = useState<CodeDialect>(readStoredCodeDialect)

  const setAutoAnimateNewLayers = (v: boolean) => {
    setState(v)
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    } catch {
      // ignore
    }
  }

  const setShowElementIdsAndClasses = (v: boolean) => {
    setShowIdsState(v)
    try {
      localStorage.setItem(STORAGE_KEY_SHOW_IDS, v ? '1' : '0')
    } catch {
      // ignore
    }
  }

  const setHasOpenedCodeEditor = (v: boolean) => {
    setCodeVisitedState(v)
    try {
      localStorage.setItem(STORAGE_KEY_CODE_VISITED, v ? '1' : '0')
    } catch {
      // ignore
    }
  }

  const setCodeDialect = (dialect: CodeDialect) => {
    setCodeDialectState(dialect)
    try {
      localStorage.setItem(STORAGE_KEY_CODE_DIALECT, dialect)
    } catch {
      // ignore
    }
  }

  return (
    <PrefsContext.Provider
      value={{
        autoAnimateNewLayers,
        setAutoAnimateNewLayers,
        showElementIdsAndClasses,
        setShowElementIdsAndClasses,
        hasOpenedCodeEditor,
        setHasOpenedCodeEditor,
        codeDialect,
        setCodeDialect,
      }}
    >
      {children}
    </PrefsContext.Provider>
  )
}

export function usePrefs() {
  const ctx = useContext(PrefsContext)
  if (!ctx) {
    throw new Error('usePrefs must be used within PrefsProvider')
  }
  return ctx
}
