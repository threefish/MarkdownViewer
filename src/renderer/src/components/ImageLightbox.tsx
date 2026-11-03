import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  RotateLeftIcon,
  RotateRightIcon,
  ZoomInIcon,
  ZoomOutIcon
} from './Icons'

const MIN_SCALE = 0.2
const MAX_SCALE = 8
const ZOOM_STEP = 1.25

interface LightboxImage {
  src: string
  alt?: string
}

interface Props {
  images: LightboxImage[]
  initialIndex: number
  onClose: () => void
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

export function ImageLightbox({ images, initialIndex, onClose }: Props): React.JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), images.length - 1)
  )
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [flipX, setFlipX] = useState(false)
  const [flipY, setFlipY] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const current = images[index] ?? images[0]
  const multiple = images.length > 1
  const canPrev = index > 0
  const canNext = index < images.length - 1

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

  const resetZoom = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const resetAll = useCallback(() => {
    setScale(1)
    setRotation(0)
    setFlipX(false)
    setFlipY(false)
    setOffset({ x: 0, y: 0 })
  }, [])

  const goPrev = useCallback(() => {
    setIndex((value) => Math.max(0, value - 1))
  }, [])

  const goNext = useCallback(() => {
    setIndex((value) => Math.min(images.length - 1, value + 1))
  }, [images.length])

  useEffect(() => {
    dragRef.current = null
    setDragging(false)
    resetAll()
  }, [index, resetAll])

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
      } else if (event.key === 'ArrowLeft' && multiple) {
        event.preventDefault()
        event.stopPropagation()
        goPrev()
      } else if (event.key === 'ArrowRight' && multiple) {
        event.preventDefault()
        event.stopPropagation()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [goNext, goPrev, multiple, onClose, resetAll, scale, zoomTo])

  const onPointerDown = (event: React.PointerEvent<HTMLImageElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
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

  const onPointerMove = (event: React.PointerEvent<HTMLImageElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    })
  }

  const endDrag = (event: React.PointerEvent<HTMLImageElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
  }

  const rotated = rotation % 180 !== 0

  return createPortal(
    <div
      ref={overlayRef}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <img
        className={`lightbox-image${dragging ? ' dragging' : ''}`}
        src={current.src}
        alt={current.alt || '图片预览'}
        draggable={false}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale}) rotate(${rotation}deg) scaleX(${
            flipX ? -1 : 1
          }) scaleY(${flipY ? -1 : 1})`,
          maxWidth: rotated ? '82vh' : '92vw',
          maxHeight: rotated ? '92vw' : '82vh'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={(event) => {
          event.preventDefault()
          if (scale !== 1) resetZoom()
          else zoomTo(2, { x: event.clientX, y: event.clientY })
        }}
      />

      <div className="lightbox-hint">
        {multiple ? (
          <>
            <span className="lightbox-count">
              {index + 1} / {images.length}
            </span>
            滚轮缩放 · 拖拽移动 · ←/→ 切换 · Esc 关闭
          </>
        ) : (
          '滚轮缩放 · 拖拽移动 · 双击切换缩放 · Esc 关闭'
        )}
      </div>

      {multiple ? (
        <>
          <button
            type="button"
            className="lightbox-nav lightbox-prev"
            aria-label="上一张"
            title="上一张 (←)"
            disabled={!canPrev}
            onClick={goPrev}
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className="lightbox-nav lightbox-next"
            aria-label="下一张"
            title="下一张 (→)"
            disabled={!canNext}
            onClick={goNext}
          >
            <ChevronRightIcon />
          </button>
        </>
      ) : null}

      <button
        type="button"
        className="lightbox-close"
        aria-label="关闭图片预览"
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
          onClick={resetZoom}
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
        <button
          type="button"
          aria-label="向左旋转"
          title="向左旋转 90°"
          onClick={() => setRotation((value) => (value + 270) % 360)}
        >
          <RotateLeftIcon />
        </button>
        <button
          type="button"
          aria-label="向右旋转"
          title="向右旋转 90°"
          onClick={() => setRotation((value) => (value + 90) % 360)}
        >
          <RotateRightIcon />
        </button>
        <span className="lightbox-sep" />
        <button
          type="button"
          aria-label="水平翻转"
          title="水平翻转"
          onClick={() => setFlipX((value) => !value)}
        >
          <FlipHorizontalIcon />
        </button>
        <button
          type="button"
          aria-label="垂直翻转"
          title="垂直翻转"
          onClick={() => setFlipY((value) => !value)}
        >
          <FlipVerticalIcon />
        </button>
        <span className="lightbox-sep" />
        <button type="button" className="lightbox-reset" aria-label="重置全部" onClick={resetAll}>
          重置
        </button>
      </div>
    </div>,
    document.body
  )
}
