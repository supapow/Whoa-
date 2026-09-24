import { useEffect } from 'react'
import { X, Sun, Moon, Laptop, User, Check, Palette, Sliders, Info, ShieldCheck, Sparkles } from 'lucide-react'
import { useTheme, type Theme } from '#/store/theme'
import { usePrefs } from '#/store/prefs'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { autoAnimateNewLayers, setAutoAnimateNewLayers } = usePrefs()

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const themeOptions: { id: Theme; label: string; desc: string; icon: typeof Sun }[] = [
    {
      id: 'light',
      label: 'Light Mode',
      desc: 'Bright, crisp appearance with clean contrast',
      icon: Sun,
    },
    {
      id: 'dark',
      label: 'Dark Mode',
      desc: 'Dimmed background for low-light environments',
      icon: Moon,
    },
    {
      id: 'system',
      label: 'System Sync',
      desc: 'Automatically matches your device settings',
      icon: Laptop,
    },
  ]

  return (
    <div
      className="absolute inset-0 z-70 flex flex-col justify-end"
      data-testid="settings-menu"
      id="settings-menu"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-heading"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fade"
        onClick={onClose}
        data-testid="settings-backdrop"
      />

      {/* Sheet Content */}
      <div className="animate-sheet relative max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface text-txt shadow-2xl no-scrollbar pb-8">
        {/* Drag handle pill */}
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-line-strong opacity-60" />

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line/40 bg-surface/95 px-5 pt-3 pb-3 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-accent/15 text-accent">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h2 id="settings-heading" className="text-base font-bold tracking-tight text-txt">
                Settings
              </h2>
              <p className="text-[11px] text-txt3">Workspace preferences & profile</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="settings-close-btn"
            id="settings-close-btn"
            aria-label="Close settings"
            className="grid h-8 w-8 place-items-center rounded-full bg-surface2 text-txt2 hover:text-txt transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-4 space-y-6">
          {/* User Profile Card */}
          <div
            data-testid="settings-profile-card"
            className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface2/60 p-3.5"
          >
            <div className="relative">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-linear-to-tr from-accent to-purple-500 text-white font-bold shadow-md">
                <User className="h-6 w-6" />
              </div>
              <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-surface bg-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-sm font-bold text-txt">Creator Studio</h3>
                <span className="inline-flex items-center gap-0.5 rounded-md bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent">
                  <ShieldCheck className="h-3 w-3" />
                  PRO
                </span>
              </div>
              <p className="text-xs text-txt3 truncate">Designer Workspace · Active</p>
            </div>
          </div>

          {/* Theme / Appearance Selection */}
          <div data-testid="settings-theme-section">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Palette className="h-4 w-4 text-accent" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-txt2">
                  Appearance
                </h3>
              </div>
              <span className="text-[11px] font-medium text-txt3 capitalize">
                Current: <strong className="text-txt font-semibold">{theme} ({resolvedTheme})</strong>
              </span>
            </div>

            {/* Quick Segmented Pill */}
            <div
              className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface2 p-1"
              data-testid="theme-selector"
              role="radiogroup"
              aria-label="Theme selection"
            >
              {(['light', 'dark', 'system'] as const).map((t) => {
                const isActive = theme === t
                const Icon = t === 'light' ? Sun : t === 'dark' ? Moon : Laptop
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setTheme(t)}
                    data-testid={`theme-${t}-btn`}
                    id={`theme-${t}-btn`}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold capitalize transition-all cursor-pointer ${
                      isActive
                        ? 'bg-accent text-white shadow-sm ring-1 ring-accent/60'
                        : 'text-txt2 hover:text-txt hover:bg-surface/50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{t}</span>
                  </button>
                )
              })}
            </div>

            {/* Detailed Theme Option Cards */}
            <div className="space-y-2">
              {themeOptions.map((opt) => {
                const isSelected = theme === opt.id
                const Icon = opt.icon
                const isLight = opt.id === 'light'
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTheme(opt.id)}
                    data-testid={`theme-card-${opt.id}`}
                    className={`flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-accent/10 shadow-xs ring-1 ring-accent/50'
                        : 'border-line bg-surface2/40 hover:bg-surface2/80 hover:border-line-strong'
                    }`}
                  >
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${
                        isSelected
                          ? isLight
                            ? 'bg-amber-500/20 text-amber-500'
                            : opt.id === 'dark'
                              ? 'bg-indigo-500/20 text-indigo-400'
                              : 'bg-accent/20 text-accent'
                          : 'bg-surface text-txt3'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-txt">{opt.label}</span>
                        {isSelected && (
                          <span className="rounded-full bg-accent px-1.5 py-0.2 text-[9px] font-bold text-white">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-txt3 leading-tight mt-0.5">{opt.desc}</p>
                    </div>

                    <div
                      className={`grid h-5 w-5 place-items-center rounded-full border transition-all ${
                        isSelected
                          ? 'border-accent bg-accent text-white'
                          : 'border-line-strong bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Animation Preferences */}
          <div data-testid="settings-animation-section">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-txt2">
                Animation
              </h3>
            </div>

            <div
              onClick={() => setAutoAnimateNewLayers(!autoAnimateNewLayers)}
              data-testid="auto-animate-toggle"
              className="flex w-full items-center gap-3.5 rounded-2xl border border-line bg-surface2/40 p-3.5 text-left transition-all hover:bg-surface2/80 cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-txt">Auto-animate new elements</span>
                <p className="text-[11px] text-txt3 leading-tight mt-0.5">
                  New text, shapes, stickers and images get an in-animation automatically
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoAnimateNewLayers}
                aria-label="Auto-animate new elements"
                onClick={(e) => {
                  e.stopPropagation()
                  setAutoAnimateNewLayers(!autoAnimateNewLayers)
                }}
                data-testid="auto-animate-switch"
                className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors ${
                  autoAnimateNewLayers ? 'bg-accent' : 'bg-surface2 border border-line-strong'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    autoAnimateNewLayers ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Quick Shortcuts & App Information */}
          <div className="rounded-2xl border border-line bg-surface2/30 p-3.5">
            <div className="flex items-center gap-1.5 mb-2 text-txt2">
              <Info className="h-3.5 w-3.5 text-accent" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Quick Shortcuts</h4>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-txt3">
              <div className="flex items-center justify-between rounded-lg bg-surface px-2 py-1.5 border border-line/60">
                <span>Undo</span>
                <kbd className="rounded bg-surface2 px-1 text-[10px] font-mono font-bold text-txt">Ctrl+Z</kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface px-2 py-1.5 border border-line/60">
                <span>Redo</span>
                <kbd className="rounded bg-surface2 px-1 text-[10px] font-mono font-bold text-txt">Ctrl+Y</kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface px-2 py-1.5 border border-line/60">
                <span>Timeline</span>
                <kbd className="rounded bg-surface2 px-1 text-[10px] font-mono font-bold text-txt">^</kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface px-2 py-1.5 border border-line/60">
                <span>Themes</span>
                <span className="font-semibold text-accent">Light / Dark</span>
              </div>
            </div>
          </div>

          {/* Footer Info */}
          <div className="text-center pt-1 pb-2">
            <p className="text-xs font-bold tracking-tight text-txt2">Woah! Banner Studio</p>
            <p className="text-[10px] text-txt3">Version 0.3.0 · Light & Dark mode support</p>
          </div>
        </div>
      </div>
    </div>
  )
}
