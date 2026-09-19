import { useState } from 'react'
import { ChevronLeft, Download, Undo2, Redo2 } from 'lucide-react'
import { useEditor } from '#/store/editor'

export default function TopBar({ onExit, onExport }: { onExit: () => void; onExport: () => void }) {
  const { project, rename, mode, setMode, undo, redo, canUndo, canRedo } = useEditor()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)

  return (
    <header className="flex h-13 shrink-0 items-center gap-1.5 border-b border-line bg-toolbar px-2 text-txt select-none">
      <button
        type="button"
        onClick={onExit}
        data-testid="editor-back-btn"
        id="editor-back-btn"
        aria-label="Back"
        title="Back"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-txt2 transition-colors active:bg-surface2 hover:text-txt"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* Undo / Redo controls */}
      <div className="flex shrink-0 items-center gap-0.5" data-testid="undo-redo-controls">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          data-testid="undo-btn"
          id="undo-btn"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className="grid h-8 w-8 place-items-center rounded-lg text-txt2 transition-colors active:bg-surface2 hover:text-txt disabled:pointer-events-none disabled:opacity-25"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          data-testid="redo-btn"
          id="redo-btn"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          className="grid h-8 w-8 place-items-center rounded-lg text-txt2 transition-colors active:bg-surface2 hover:text-txt disabled:pointer-events-none disabled:opacity-25"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { rename(name || 'Untitled'); setEditing(false) }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          data-testid="project-title-input"
          id="project-title-input"
          className="min-w-0 flex-1 rounded-md bg-surface2 px-2 py-1 text-xs font-semibold outline-none ring-1 ring-accent"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          data-testid="project-title"
          id="project-title"
          className="flex min-w-0 flex-1 flex-col items-start leading-tight text-left"
        >
          <span className="max-w-full truncate text-xs font-bold">{project.name}</span>
          <span className="text-[9px] text-txt3">{project.preset.label} · {project.preset.ratio}</span>
        </button>
      )}

      {/* Mode toggle */}
      <div className="flex shrink-0 items-center rounded-lg bg-surface2 p-0.5" data-testid="mode-toggle">
        {(['static', 'animated'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            data-testid={`mode-${m}`}
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize transition-colors ${
              mode === m ? 'bg-accent text-white' : 'text-txt2 hover:text-txt'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onExport}
        data-testid="export-btn"
        id="export-btn"
        className="flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-bold text-white transition-transform active:scale-95"
      >
        <Download className="h-3.5 w-3.5" />
        <span>Export</span>
      </button>
    </header>
  )
}
