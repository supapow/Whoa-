import { useState, useCallback, useEffect } from 'react'
import type { Preset, Project } from '#/types'
import { adSetFromProject, createAdSet } from '#/lib/adset'
import type { AdSet } from '#/types'
import { ThemeProvider } from '#/store/theme'
import { PrefsProvider } from '#/store/prefs'
import Home from '#/screens/Home'
import Editor from '#/screens/Editor'

export default function App() {
  return (
    <PrefsProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </PrefsProvider>
  )
}

function AppInner() {
  const [adSet, setAdSet] = useState<AdSet | null>(null)

  const open = useCallback((p: Project) => setAdSet(adSetFromProject(p)), [])
  const openAdSet = useCallback((presets: Preset[]) => {
    if (presets.length === 0) return
    setAdSet(createAdSet(presets))
  }, [])
  const close = useCallback(() => setAdSet(null), [])

  // Prevent the whole app/page from zooming (trackpad ctrl-wheel + Safari gestures).
  useEffect(() => {
    const wheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault() }
    const gesture = (e: Event) => e.preventDefault()
    document.addEventListener('wheel', wheel, { passive: false })
    document.addEventListener('gesturestart', gesture)
    document.addEventListener('gesturechange', gesture)
    return () => {
      document.removeEventListener('wheel', wheel)
      document.removeEventListener('gesturestart', gesture)
      document.removeEventListener('gesturechange', gesture)
    }
  }, [])

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] w-full items-stretch justify-center overflow-hidden bg-[var(--color-outer-bg,#000000)] sm:py-4 transition-colors duration-200">
      {/* Mobile device frame — mobile-first, centered on larger screens */}
      <div className="relative h-[100dvh] min-h-0 w-full max-w-[440px] overflow-hidden bg-bg text-txt shadow-2xl sm:h-[900px] sm:max-h-full sm:rounded-[2.2rem] sm:ring-1 sm:ring-line transition-colors duration-200">
        {adSet ? (
          <Editor key={adSet.id} adSet={adSet} onExit={close} />
        ) : (
          <Home onOpen={open} onOpenAdSet={openAdSet} />
        )}
      </div>
    </div>
  )
}
