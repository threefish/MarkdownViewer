import { useEffect, useLayoutEffect, useRef, useState, type JSX, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Shortcut } from '../lib/shortcuts'
import { ShortcutKeys } from './ShortcutKeys'

interface Props {
  x: number
  y: number
  title: string
  shortcuts: Shortcut[]
  anchorRef?: RefObject<HTMLElement | null>
  onClose: () => void
}

export function ShortcutHelp({ x, y, title, shortcuts, anchorRef, onClose }: Props): JSX.Element {
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
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef?.current?.contains(target)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    window.addEventListener('wheel', onClose, { capture: true, passive: true })
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('wheel', onClose, { capture: true })
    }
  }, [anchorRef, onClose])

  return createPortal(
    <div
      className="shortcut-help"
      role="dialog"
      aria-label={title}
      ref={panelRef}
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="shortcut-help-head">
        <span>{title}</span>
        <button
          type="button"
          className="shortcut-help-close"
          aria-label="关闭快捷键说明"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {shortcuts.map((shortcut) => (
        <div className="shortcut-row" key={shortcut.label}>
          <span className="shortcut-label">{shortcut.label}</span>
          <ShortcutKeys keys={shortcut.keys} />
        </div>
      ))}
    </div>,
    document.body
  )
}
