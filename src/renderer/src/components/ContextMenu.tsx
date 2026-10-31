import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  label?: string
  disabled?: boolean
  danger?: boolean
  separator?: boolean
  onClick?: () => void
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  ariaLabel?: string
}

export function ContextMenu({ x, y, items, onClose, ariaLabel }: Props): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    setPos({
      x: Math.max(6, Math.min(x, window.innerWidth - rect.width - 6)),
      y: Math.max(6, Math.min(y, window.innerHeight - rect.height - 6))
    })
  }, [x, y])

  useEffect(() => {
    const close = (): void => onClose()
    const onDown = (event: MouseEvent): void => {
      if (!panelRef.current?.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('wheel', close, { capture: true, passive: true })
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('wheel', close, { capture: true })
    }
  }, [onClose])

  return createPortal(
    <div
      className="context-menu"
      role="menu"
      aria-label={ariaLabel ?? '操作'}
      ref={panelRef}
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((item, index) =>
        item.separator ? (
          <div className="menu-sep" key={`sep-${index}`} />
        ) : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            className={`menu-item-btn${item.danger ? ' danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onClick?.()
            }}
          >
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  )
}
