import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, PencilIcon, ZoomInIcon, ZoomOutIcon } from './Icons'

const MIN_SCALE = 0.2
const MAX_SCALE = 8
const ZOOM_STEP = 1.25

interface Props {
  svg: string
  name: string
  onEdit?: () => void
  onClose: () => void
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

export function ScenePreview({ svg, name, onEdit, onClose }: Props): React.JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })

  useEffect(() => {
    viewRef.current = { scale, offsetX: offset.x, offsetY: offset.y }
  }, [scale, offset])

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    overlayRef.current?.focus()
    return () => previous?.focus()
  }, [])

  const zoomTo = useCallback(
    (nextScale: number, point?: { x: number; y: number }) => {
      const next = clampScale(nextScale)
      if (next === scale) return
      if (point && overlayRef.current) {
        const rect = overlayRef.current.getBoundingClientRect()
        const cx = point.x - rect.left - rect.width / 2
        const cy = point.y - rect.top - rect.height / 2
        const ratio = next / scale
        setOffset((origin) => ({
          x: origin.x + (1 - ratio) * (cx - origin.x),
          y: origin.y + (1 - ratio) * (cy - origin.y)
        }))
      } else {
        setOffset((origin) => ({
          x: origin.x * (next / scale),
          y: origin.y * (next / scale)
        }))
      }
      setScale(next)
    },
    [scale]
  )

  const resetAll = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const current = viewRef.current
      const next = clampScale(current.scale * Math.exp(-event.deltaY * 0.0015))
      if (next === current.scale) return
      const rect = el.getBoundingClientRect()
      const cx = event.clientX - rect.left - rect.width / 2
      const cy = event.clientY - rect.top - rect.height / 2
      const ratio = next / current.scale
      setOffset({
        x: current.offsetX + (1 - ratio) * (cx - current.offsetX),
        y: current.offsetY + (1 - ratio) * (cy - current.offsetY)
      })
      setScale(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      } else if (event.key === 'Enter' && onEdit) {
        const target = event.target as HTMLElement | null
        if (target?.closest?.('button')) return
        event.preventDefault()
        event.stopPropagation()
        onEdit()
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        event.stopPropagation()
        zoomTo(scale * ZOOM_STEP)
      } else if (event.key === '-') {
        event.preventDefault()
        event.stopPropagation()
        zoomTo(scale / ZOOM_STEP)
      } else if (event.key === '0') {
        event.preventDefault()
        event.stopPropagation()
        resetAll()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, onEdit, resetAll, scale, zoomTo])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y
    }
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    })
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="lightbox scene-preview"
      role="dialog"
      aria-modal="true"
      aria-label={`${onEdit ? '画板' : '图表'}预览：${name}`}
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="lightbox-hint">
        <span className="lightbox-count">{name}</span>
        {onEdit ? '滚轮缩放 · 拖拽移动 · Enter 编辑 · Esc 关闭' : '滚轮缩放 · 拖拽移动 · Esc 关闭'}
      </div>

      <div
        className={`scene-preview-stage${dragging ? ' dragging' : ''}`}
        style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={(event) => {
          event.preventDefault()
          if (scale !== 1) resetAll()
          else zoomTo(2, { x: event.clientX, y: event.clientY })
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      {onEdit ? (
        <button
          type="button"
          className="scene-preview-edit"
          title="编辑文件 (Enter)"
          onClick={onEdit}
        >
          <PencilIcon />
          <span>编辑文件</span>
        </button>
      ) : null}

      <button
        type="button"
        className="lightbox-close"
        aria-label={onEdit ? '关闭画板预览' : '关闭图表预览'}
        title="关闭 (Esc)"
        onClick={onClose}
      >
        <CloseIcon />
      </button>

      <div className="lightbox-toolbar">
        <button
          type="button"
          aria-label="缩小"
          title="缩小 (-)"
          onClick={() => zoomTo(scale / ZOOM_STEP)}
        >
          <ZoomOutIcon />
        </button>
        <button
          type="button"
          className="lightbox-scale"
          aria-label="重置缩放"
          title="重置缩放"
          onClick={resetAll}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          aria-label="放大"
          title="放大 (+)"
          onClick={() => zoomTo(scale * ZOOM_STEP)}
        >
          <ZoomInIcon />
        </button>
        <span className="lightbox-sep" />
        <button type="button" className="lightbox-reset" aria-label="重置" onClick={resetAll}>
          重置
        </button>
      </div>
    </div>,
    document.body
  )
}
