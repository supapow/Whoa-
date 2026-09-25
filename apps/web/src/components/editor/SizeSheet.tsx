import { useState } from 'react'
import { X, Check, RefreshCw, Trash2, Plus } from 'lucide-react'
import { PRESETS } from '#/lib/data'
import { useEditor } from '#/store/editor'

/**
 * Variant switcher + add-format sheet (creative scaling v1).
 * Lists ad-set variants (tap to switch) and remaining presets (tap to add).
 */
export default function SizeSheet({ onClose }: { onClose: () => void }) {
  const {
    adSet, activeVariantId, project, isMaster,
    switchVariant, addVariant, removeVariant, reapplyVariant,
  } = useEditor()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  if (!adSet) return null

  const existing = new Set(adSet.variants.map((v) => v.preset.id))
  const remaining = PRESETS.filter((p) => !existing.has(p.id))

  return (
    <div className="absolute inset-0 z-70 flex flex-col justify-end" data-testid="size-sheet">
      <div className="absolute inset-0 bg-black/60 animate-fade" onClick={onClose} />
      <div className="animate-sheet relative max-h-[82vh] rounded-t-3xl border-t border-line bg-surface text-txt pb-8 shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line/40">
          <h3 className="text-xl font-bold text-txt">Ad sizes</h3>
          <button onClick={onClose} data-testid="size-close" className="grid h-8 w-8 place-items-center rounded-full bg-surface2 text-txt2 hover:text-txt transition-colors cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto no-scrollbar px-5 pt-3">
          {adSet.variants.map((v) => {
            const active = v.id === activeVariantId
            const master = adSet.variants[0]?.id === v.id
            const detached = v.layers.filter((l) => l.layoutDetached || l.contentDetached).length
            const pendingDelete = confirmDelete === v.id
            return (
              <div
                key={v.id}
                data-testid={`variant-${v.preset.id}`}
                className={`mb-2 flex items-center gap-3 rounded-2xl border p-3 ${
                  active ? 'border-accent bg-accent/10' : 'border-line bg-surface2/60'
                }`}
              >
                <button
                  onClick={() => { if (!active) { switchVariant(v.id); onClose() } }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-toolbar border border-line-strong text-[9px] font-bold text-txt2">
                    {v.preset.w}×{v.preset.h}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-txt">{v.preset.label}</span>
                      {master && (
                        <span className="shrink-0 rounded-full bg-accent px-1.5 py-px text-[9px] font-black uppercase text-white">
                          Master
                        </span>
                      )}
                      {active && <Check className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={3} />}
                    </span>
                    <span className="block text-[11px] text-txt3">
                      {v.layers.length} layers{detached > 0 ? ` · ${detached} adjusted` : ''}
                    </span>
                  </span>
                </button>
                {!master && !pendingDelete && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => reapplyVariant(v.id)}
                      data-testid={`reapply-${v.preset.id}`}
                      aria-label="Re-apply master layout"
                      title="Re-apply master layout"
                      className="grid h-8 w-8 place-items-center rounded-full bg-surface2 text-txt2 hover:text-txt transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(v.id)}
                      data-testid={`delete-variant-${v.preset.id}`}
                      aria-label="Remove size"
                      title="Remove size"
                      className="grid h-8 w-8 place-items-center rounded-full bg-surface2 text-txt2 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {pendingDelete && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => {
                        removeVariant(v.id)
                        setConfirmDelete(null)
                        if (v.id === activeVariantId) onClose()
                      }}
                      data-testid={`confirm-delete-variant-${v.preset.id}`}
                      className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded-full bg-surface2 px-3 py-1.5 text-xs font-bold text-txt2 cursor-pointer"
                    >
                      Keep
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          <h4 className="mb-2 mt-4 flex items-center gap-1.5 text-sm font-bold uppercase tracking-widest text-txt2">
            <Plus className="h-4 w-4" /> Add format
          </h4>
          {remaining.length === 0 && (
            <p className="pb-2 text-sm text-txt3">All sizes are already in this ad set.</p>
          )}
          <div className="grid grid-cols-3 gap-2 pb-2">
            {remaining.map((p) => (
              <button
                key={p.id}
                onClick={() => { addVariant(p); onClose() }}
                data-testid={`add-size-${p.id}`}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-line-strong bg-surface2/40 p-2.5 transition-colors active:border-accent hover:border-accent cursor-pointer"
              >
                <span className="grid h-10 w-full place-items-center">
                  <span
                    className="rounded border border-line-strong bg-toolbar"
                    style={{
                      aspectRatio: `${p.w}/${p.h}`,
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: p.w >= p.h ? '70%' : 'auto',
                      height: p.h > p.w ? '100%' : 'auto',
                    }}
                  />
                </span>
                <span className="text-center">
                  <span className="block text-[11px] font-semibold leading-tight text-txt">{p.label}</span>
                  <span className="block text-[9px] text-txt3">{p.w}×{p.h}</span>
                </span>
              </button>
            ))}
          </div>
          {!isMaster && (
            <p className="pt-1 text-xs text-txt3">
              Editing {project.preset.label} — layout tweaks stay on this size only.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
