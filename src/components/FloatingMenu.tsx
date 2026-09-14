import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

function eventHits(e: Event, ...els: Array<HTMLElement | null | undefined>) {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : []
  return els.some((el) => !!el && (path.includes(el) || (e.target instanceof Node && el.contains(e.target))))
}

function portalHost(anchor: HTMLElement | null): HTMLElement {
  return (anchor?.closest('[role="dialog"]') as HTMLElement | null) || document.body
}

export function FloatingMenu({
  open,
  onClose,
  anchor,
  children,
  minWidth = 220
}: {
  open: boolean
  onClose: () => void
  anchor: RefObject<HTMLElement | null>
  children: ReactNode
  minWidth?: number
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: minWidth, maxH: 240 })

  useLayoutEffect(() => {
    if (!open) {
      setHost(null)
      return
    }
    setHost(portalHost(anchor.current))
  }, [open, anchor])

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const place = (e?: Event) => {
      if (!anchor.current) return
      if (e && eventHits(e, menuRef.current)) return
      const r = anchor.current.getBoundingClientRect()
      const width = Math.max(r.width, minWidth)
      let left = r.left
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
      const top = r.bottom + 4
      const maxH = Math.max(160, Math.min(380, window.innerHeight - top - 12))
      setPos((prev) =>
        prev.top === top && prev.left === left && prev.width === width && prev.maxH === maxH
          ? prev
          : { top, left, width, maxH }
      )
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchor, minWidth, host])

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!open || !el) return
    const unlock = () => {
      el.removeAttribute('inert')
      el.removeAttribute('aria-hidden')
      el.style.pointerEvents = 'auto'
    }
    unlock()
    const mo = new MutationObserver(unlock)
    mo.observe(el, { attributes: true, attributeFilter: ['inert', 'aria-hidden'] })
    return () => mo.disconnect()
  }, [open, pos, host])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (eventHits(e, anchor.current, menuRef.current)) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open, onClose, anchor])

  if (!open || !host) return null
  return createPortal(
    <div
      ref={menuRef}
      data-floating-menu="true"
      tabIndex={-1}
      className="z-[400] rounded-md border border-navy-200 bg-white p-1 shadow-xl dark:border-navy-700 dark:bg-navy-900"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxH,
        pointerEvents: 'auto'
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    host
  )
}
