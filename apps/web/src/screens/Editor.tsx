import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, Undo2, Redo2, User } from 'lucide-react'
import type { Project } from '#/types'
import { EditorProvider, useEditor } from '#/store/editor'
import Canvas from '#/components/editor/Canvas'
import Toolbar from '#/components/editor/Toolbar'
import Timeline from '#/components/editor/Timeline'
import ToolSheet, { VectorFloatingPanel, TextFloatingPanel } from '#/components/editor/Panels'
import ExportSheet from '#/components/editor/ExportSheet'
import ColorLoupe from '#/components/editor/ColorLoupe'

export default function Editor({ project, onExit }: { project: Project; onExit: () => void }) {
  return (
    <EditorProvider project={project}>
      <EditorInner onExit={onExit} />
    </EditorProvider>
  )
}

function EditorInner({ onExit }: { onExit: () => void }) {
  const [exportOpen, setExportOpen] = useState(false)
  const { playing, time, setTime, project, undo, redo, canUndo, canRedo } = useEditor()
  const raf = useRef(0)
  const last = useRef(0)
  const timeRef = useRef(time)
  timeRef.current = time

  useEffect(() => {
    if (!playing) return
    last.current = performance.now()
    const tick = (now: number) => {
      const dt = now - last.current
      last.current = now
      let nt = timeRef.current + dt
      if (nt >= project.duration) nt = 0
      timeRef.current = nt
      setTime(nt)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, project.duration])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) {
          return
        }
      }

      const isMod = e.metaKey || e.ctrlKey
      if (isMod && !e.altKey) {
        if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault()
          redo()
        } else if (!e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault()
          undo()
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault()
          redo()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg select-none">
      {/* Floating Back Button in top-left corner */}
      <button
        type="button"
        onClick={onExit}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid="editor-back-btn"
        id="editor-back-btn"
        aria-label="Back"
        title="Back"
        className="absolute top-3 left-3 z-40 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md border border-white/10 shadow-lg hover:bg-black/80 hover:text-white active:scale-90 transition-all focus:outline-none"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* Floating Action Controls in top-right corner: undo, redo, user avatar */}
      <div
        data-testid="floating-top-actions"
        id="floating-top-actions"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-3 right-3 z-40 flex items-center gap-1.5"
      >
        {/* Undo button */}
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          data-testid="undo-btn"
          id="undo-btn"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className="grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md border border-white/10 shadow-lg hover:bg-white/20 hover:text-white active:scale-90 transition-all focus:outline-none disabled:pointer-events-none disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" />
        </button>

        {/* Redo button */}
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          data-testid="redo-btn"
          id="redo-btn"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          className="grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md border border-white/10 shadow-lg hover:bg-white/20 hover:text-white active:scale-90 transition-all focus:outline-none disabled:pointer-events-none disabled:opacity-30"
        >
          <Redo2 className="h-4 w-4" />
        </button>

        {/* User Avatar */}
        <div
          data-testid="user-avatar"
          id="user-avatar"
          role="button"
          tabIndex={0}
          aria-label="User avatar"
          title="User Profile"
          className="grid h-9 w-9 place-items-center rounded-full bg-linear-to-tr from-accent to-purple-500 text-white backdrop-blur-md border border-white/20 shadow-lg ring-1 ring-white/20 font-bold text-xs select-none transition-transform active:scale-95 cursor-pointer"
        >
          <User className="h-4 w-4" />
        </div>
      </div>

      <div className="relative min-h-0 flex flex-1">
        <Canvas />
        <VectorFloatingPanel />
        <TextFloatingPanel />
      </div>
      <Toolbar onExport={() => setExportOpen(true)} />
      <Timeline />
      <ToolSheet />
      <ColorLoupe />
      {exportOpen && <ExportSheet onClose={() => setExportOpen(false)} />}
    </div>
  )
}
