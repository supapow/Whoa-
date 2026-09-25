import { useState } from 'react'
import { Plus, Sparkles, LayoutGrid, X, ChevronRight, User } from 'lucide-react'
import type { Project, Preset } from '#/types'
import {
  PRESETS,
  PRESET_CATEGORIES,
  TEMPLATES,
  newProject,
  seedProjects,
} from '#/lib/data'
import SettingsModal from '#/components/SettingsModal'
import BottomSheet from '#/components/BottomSheet'

const bgStyle = (v: string) =>
  v.startsWith('http')
    ? { backgroundImage: `url(${v})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : v.startsWith('#')
      ? { background: v }
      : { backgroundImage: v }

export default function Home({ onOpen, onOpenAdSet }: { onOpen: (p: Project) => void; onOpenAdSet: (ps: Preset[]) => void }) {
  const [recents] = useState(() => seedProjects())
  const [picker, setPicker] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="h-full min-h-0 overscroll-contain overflow-y-auto overscroll-y-contain no-scrollbar bg-bg text-txt" data-testid="home-screen">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 pt-6 pb-4 bg-bg/85 backdrop-blur-md border-b border-line/20">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent shadow-sm">
            <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <h1 id="app-title" className="text-2xl font-black tracking-tight text-txt">Woah!</h1>
        </div>

        {/* User avatar in top right corner that opens settings menu */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          data-testid="user-avatar"
          id="user-avatar"
          aria-label="Settings and Profile"
          title="Settings & Appearance"
          className="grid h-9 w-9 place-items-center rounded-full bg-linear-to-tr from-accent to-purple-500 text-white backdrop-blur-md border border-white/20 shadow-md ring-1 ring-white/20 font-bold text-xs select-none transition-transform active:scale-95 cursor-pointer focus:outline-none"
        >
          <User className="h-4.5 w-4.5" />
        </button>
      </header>

      <main className="px-5 pb-28">
        {/* Hero CTA */}
        <button
          onClick={() => setPicker(true)}
          data-testid="new-project-btn"
          className="group relative mt-2 mb-8 flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-accent px-5 py-5 text-left transition-transform active:scale-[0.985] shadow-lg shadow-accent/20 cursor-pointer"
        >
          <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20">
            <Plus className="h-6 w-6 text-white" strokeWidth={3} />
          </div>
          <div className="relative">
            <p className="text-xl font-extrabold text-white">New Banner</p>
            <p className="text-sm text-white/80">Pick a size to start designing</p>
          </div>
          <ChevronRight className="relative ml-auto h-5 w-5 text-white/80" />
        </button>

        {/* Recent projects */}
        <SectionTitle icon={<LayoutGrid className="h-4 w-4" />} title="Recent" />
        <div className="-mx-5 mb-8 flex gap-3 overflow-x-auto no-scrollbar px-5 pb-1">
          {recents.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpen(p)}
              data-testid={`recent-${p.id}`}
              className="group w-36 shrink-0 text-left cursor-pointer"
            >
              <div
                className="relative mb-2 grid aspect-square w-full place-items-center overflow-hidden rounded-2xl border border-line shadow-xs group-hover:border-line-strong transition-colors"
                style={bgStyle(p.background.value)}
              >
                <span className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white/90">
                  {p.preset.ratio}
                </span>
              </div>
              <p className="truncate text-sm font-semibold text-txt">{p.name}</p>
              <p className="text-xs text-txt3">{p.preset.label}</p>
            </button>
          ))}
        </div>

        {/* Templates bento */}
        <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Templates" />
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map((t, i) => {
            const preset = PRESETS.find((p) => p.id === t.presetId)!
            const tall = i % 5 === 0
            return (
              <button
                key={t.id}
                onClick={() => onOpen(t.build())}
                data-testid={`template-${t.id}`}
                className={`group relative overflow-hidden rounded-2xl border border-line text-left transition-transform active:scale-[0.98] shadow-xs cursor-pointer ${
                  tall ? 'row-span-2' : ''
                }`}
                style={{ aspectRatio: tall ? '0.8' : `${preset.w}/${preset.h}`, ...bgStyle(t.thumb) }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="text-sm font-bold text-white drop-shadow">{t.name}</p>
                  <p className="text-[11px] text-white/70">{preset.label}</p>
                </div>
              </button>
            )
          })}
        </div>
      </main>

      {picker && (
        <PresetPicker
          onClose={() => setPicker(false)}
          onPick={(p) => onOpen(newProject(p))}
          onPickMany={(ps) => onOpenAdSet(ps)}
        />
      )}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-txt2">
      {icon}
      <h2 className="text-sm font-bold uppercase tracking-widest">{title}</h2>
    </div>
  )
}

function PresetPicker({ onClose, onPick, onPickMany }: { onClose: () => void; onPick: (p: Preset) => void; onPickMany: (ps: Preset[]) => void }) {
  const [cat, setCat] = useState(PRESET_CATEGORIES[0])
  const [multi, setMulti] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const list = PRESETS.filter((p) => p.category === cat)

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const createAdSet = () => {
    const ordered = selected
      .map((id) => PRESETS.find((p) => p.id === id)!)
      .filter(Boolean)
    if (ordered.length > 0) onPickMany(ordered)
  }

  return (
    <BottomSheet testid="preset-picker" z="z-50" onClose={onClose} containerClass="max-h-[82vh] pb-8">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line/40">
          <h3 className="text-xl font-bold text-txt">{multi ? 'Pick sizes (1st = master)' : 'Choose a size'}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setMulti((m) => !m); setSelected([]) }}
              data-testid="picker-multi-toggle"
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                multi ? 'bg-accent text-white' : 'bg-surface2 text-txt2 hover:text-txt'
              }`}
            >
              {multi ? 'Done' : 'Multi-size'}
            </button>
            <button onClick={onClose} data-testid="picker-close" className="grid h-8 w-8 place-items-center rounded-full bg-surface2 text-txt2 hover:text-txt transition-colors cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 pt-3 pb-4">
          {PRESET_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              data-testid={`cat-${c}`}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                cat === c ? 'bg-accent text-white shadow-xs' : 'bg-surface2 text-txt2 hover:text-txt'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid max-h-[52vh] grid-cols-3 gap-3 overflow-y-auto no-scrollbar px-5">
          {list.map((p) => {
            const order = selected.indexOf(p.id)
            const isSel = multi && order >= 0
            return (
              <button
                key={p.id}
                onClick={() => (multi ? toggleSelect(p.id) : onPick(p))}
                data-testid={`preset-${p.id}`}
                className={`relative flex flex-col items-center gap-2 rounded-2xl border p-3 transition-colors active:border-accent hover:border-line-strong cursor-pointer ${
                  isSel ? 'border-accent bg-accent/10' : 'border-line bg-surface2/60'
                }`}
              >
                {isSel && (
                  <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-accent text-[10px] font-black text-white">
                    {order + 1}
                  </span>
                )}
                <div className="grid h-16 w-full place-items-center">
                  <div
                    className="rounded-md border border-line-strong bg-toolbar shadow-2xs"
                    style={{
                      aspectRatio: `${p.w}/${p.h}`,
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: p.w >= p.h ? '100%' : 'auto',
                      height: p.h > p.w ? '100%' : 'auto',
                    }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold leading-tight text-txt">{p.label}</p>
                  <p className="text-[10px] text-txt3">{p.w}×{p.h}</p>
                </div>
              </button>
            )
          })}
        </div>
        {multi && (
          <div className="px-5 pt-4">
            <button
              onClick={createAdSet}
              disabled={selected.length === 0}
              data-testid="picker-create-adset"
              className="w-full rounded-2xl bg-accent py-3.5 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
            >
              {selected.length === 0 ? 'Select sizes to start' : `Create ad set (${selected.length})`}
            </button>
          </div>
        )}
    </BottomSheet>
  )
}
