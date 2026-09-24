import React, { createContext, useContext, useState } from 'react'

interface PrefsContextType {
  /** When on, new elements get an automatic in-animation (per-type default). Off by default. */
  autoAnimateNewLayers: boolean
  setAutoAnimateNewLayers: (v: boolean) => void
}

const PrefsContext = createContext<PrefsContextType | null>(null)

const STORAGE_KEY = 'woah-auto-animate'

function readStored(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [autoAnimateNewLayers, setState] = useState<boolean>(readStored)

  const setAutoAnimateNewLayers = (v: boolean) => {
    setState(v)
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    } catch {
      // ignore
    }
  }

  return (
    <PrefsContext.Provider value={{ autoAnimateNewLayers, setAutoAnimateNewLayers }}>
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
