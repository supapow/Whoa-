import { useEffect, useRef } from 'react'

const DISMISS_PX = 110
const FLICK_PX = 40
const FLICK_VELOCITY = 0.45 // px per ms

interface BottomSheetProps {
  testid: string
  onClose: () => void
  /** classes for the sliding container (max-h, padding, scroll, …) */
  containerClass?: string
  z?: string
  children: React.ReactNode
}

/**
 * Mobile bottom sheet with swipe-to-dismiss. Drag the grabber (touch and
 * mouse), or pull down anywhere on the sheet while its content sits at the
 * top. Past the distance/velocity threshold the close animation takes over
 * and collapses the sheet; otherwise it springs back.
 */
export default function BottomSheet({ testid, onClose, containerClass = '', z = 'z-60', children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const grabberRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const closing = useRef(false)
  const drag = useRef<{
    startY: number
    startX: number
    active: boolean
    offset: number
    lastY: number
    lastT: number
    vel: number
    scroller: HTMLElement | null
    fromGrabber: boolean
  } | null>(null)

  const applyOffset = (px: number) => {
    const el = sheetRef.current
    if (el) el.style.transform = px > 0 ? `translateY(${px}px)` : ''
  }

  const snapBack = () => {
    const el = sheetRef.current
    if (!el) return
    el.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.25, 1)'
    applyOffset(0)
    window.setTimeout(() => {
      if (sheetRef.current) {
        sheetRef.current.style.transition = ''
        sheetRef.current.style.transform = ''
      }
    }, 300)
  }

  const dismiss = () => {
    if (closing.current) return
    closing.current = true
    const el = sheetRef.current
    if (el) {
      const h = el.offsetHeight || window.innerHeight * 0.4
      el.style.transition = 'transform 0.2s ease-in'
      el.style.transform = `translateY(${h + 24}px)`
    }
    window.setTimeout(() => onCloseRef.current(), 210)
  }

  useEffect(() => {
    const el = sheetRef.current
    if (!el) return

    const findScroller = (target: EventTarget | null): HTMLElement | null => {
      let node = target as HTMLElement | null
      while (node && node !== el) {
        if (node instanceof HTMLElement && node.scrollHeight > node.clientHeight + 4) return node
        node = node.parentElement
      }
      return el.scrollHeight > el.clientHeight + 4 ? el : null
    }

    const begin = (clientY: number, clientX: number, target: EventTarget | null) => {
      if (closing.current) return
      const grabber = grabberRef.current
      const fromGrabber = Boolean(
        grabber && target instanceof Node && grabber.contains(target),
      )
      drag.current = {
        startY: clientY,
        startX: clientX,
        active: false,
        offset: 0,
        lastY: clientY,
        lastT: performance.now(),
        vel: 0,
        scroller: findScroller(target),
        fromGrabber,
      }
    }

    const move = (clientY: number, clientX: number): boolean => {
      const d = drag.current
      if (!d) return false
      const dy = clientY - d.startY
      const dx = clientX - d.startX
      if (!d.active) {
        if (Math.abs(dy) < 8) return false
        // Horizontal swipes and upward pulls belong to the content.
        if (Math.abs(dx) > Math.abs(dy) || dy < 0) {
          drag.current = null
          return false
        }
        // Content that can still scroll up keeps the gesture —
        // unless it started on the grabber, which always drags.
        if (!d.fromGrabber && d.scroller && d.scroller.scrollTop > 0) {
          drag.current = null
          return false
        }
        d.active = true
        const sheet = sheetRef.current
        if (sheet) sheet.style.transition = 'none'
      }
      const now = performance.now()
      const dt = Math.max(1, now - d.lastT)
      d.vel = 0.8 * d.vel + 0.2 * ((clientY - d.lastY) / dt)
      d.lastY = clientY
      d.lastT = now
      d.offset = Math.max(0, dy)
      applyOffset(d.offset)
      return true
    }

    const end = () => {
      const d = drag.current
      drag.current = null
      if (!d || !d.active) return
      if (d.offset > DISMISS_PX || (d.offset > FLICK_PX && d.vel > FLICK_VELOCITY)) {
        dismiss()
      } else {
        snapBack()
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        drag.current = null
        return
      }
      const t = e.touches[0]
      begin(t.clientY, t.clientX, e.target)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!drag.current || e.touches.length !== 1) return
      const t = e.touches[0]
      if (move(t.clientY, t.clientX) && e.cancelable) e.preventDefault()
    }
    const onTouchEnd = () => end()

    const onMouseDown = (e: MouseEvent) => {
      // Mouse drags start on the grabber only — everywhere else keeps
      // clicks and text selection intact.
      if (e.button !== 0 || closing.current) return
      begin(e.clientY, e.clientX, e.target)
      if (drag.current) {
        drag.current.active = true
        const sheet = sheetRef.current
        if (sheet) sheet.style.transition = 'none'
      }
      const onMouseMove = (ev: MouseEvent) => {
        if (drag.current?.active) {
          const d = drag.current
          d.offset = Math.max(0, ev.clientY - d.startY)
          const now = performance.now()
          const dt = Math.max(1, now - d.lastT)
          d.vel = 0.8 * d.vel + 0.2 * ((ev.clientY - d.lastY) / dt)
          d.lastY = ev.clientY
          d.lastT = now
          applyOffset(d.offset)
        }
      }
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        end()
      }
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }

    const grabber = grabberRef.current
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    grabber?.addEventListener('mousedown', onMouseDown)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      grabber?.removeEventListener('mousedown', onMouseDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`absolute inset-0 ${z} flex flex-col justify-end`} data-testid={testid}>
      <div className="absolute inset-0 bg-black/60 animate-fade" onClick={onClose} data-testid={`${testid}-backdrop`} />
      <div
        ref={sheetRef}
        className={`animate-sheet relative rounded-t-3xl border-t border-line bg-surface text-txt shadow-2xl ${containerClass}`}
        style={{ touchAction: 'pan-x pan-y' }}
      >
        {/* Grab handle */}
        <div
          ref={grabberRef}
          data-testid={`${testid}-grabber`}
          className="cursor-grab touch-none select-none active:cursor-grabbing"
          aria-hidden
        >
          <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-white/25" />
        </div>
        {children}
      </div>
    </div>
  )
}
