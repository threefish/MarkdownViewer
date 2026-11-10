import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { localFileUrl } from '../lib/pathResolve'
import {
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

interface Props {
  path: string
  reloadKey: string
}

interface ViewState {
  scale: number
  rotation: number
  flipX: boolean
  flipY: boolean
  offset: { x: number; y: number }
}

// 切换标签页会卸载 ImageView，浏览状态按路径暂存，关闭标签页时再清除。
const viewStateCache = new Map<string, ViewState>()

export function clearImageViewState(path: string): void {
  viewStateCache.delete(path)
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

export function ImageView({ path, reloadKey }: Props): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const [stage, setStage] = useState({ width: 0, height: 0 })
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [error, setError] = useState(false)
  const initialView = viewStateCache.get(path)
  const [scale, setScale] = useState(initialView?.scale ?? 1)
  const [rotation, setRotation] = useState(initialView?.rotation ?? 0)
  const [flipX, setFlipX] = useState(initialView?.flipX ?? false)
  const [flipY, setFlipY] = useState(initialView?.flipY ?? false)
  const [offset, setOffset] = useState(initialView?.offset ?? { x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })

  useEffect(() => {
    viewRef.current = { scale, offsetX: offset.x, offsetY: offset.y }
  }, [scale, offset])

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = (): void => setStage({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const saved = viewStateCache.get(path)
    setScale(saved?.scale ?? 1)
    setRotation(saved?.rotation ?? 0)
    setFlipX(saved?.flipX ?? false)
    setFlipY(saved?.flipY ?? false)
    setOffset(saved?.offset ?? { x: 0, y: 0 })
    setNatural(null)
    setError(false)
  }, [path])

  useEffect(() => {
    viewStateCache.set(path, { scale, rotation, flipX, flipY, offset })
  }, [path, scale, rotation, flipX, flipY, offset])

  useEffect(() => {
    setError(false)
  }, [reloadKey])

  const rotated = rotation % 180 !== 0

  const zoomTo = useCallback(
    (nextScale: number, point?: { x: number; y: number }) => {
      const next = clampScale(nextScale)
      if (next === scale) return
      const stageEl = stageRef.current
      if (point && stageEl) {
        const rect = stageEl.getBoundingClientRect()
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

  useEffect(() => {
    const el = rootRef.current
    const stageEl = stageRef.current
    if (!el || !stageEl) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const current = viewRef.current
      const next = clampScale(current.scale * Math.exp(-event.deltaY * 0.0015))
      if (next === current.scale) return
      const rect = stageEl.getBoundingClientRect()
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

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomTo(scale * ZOOM_STEP)
    } else if (event.key === '-') {
      event.preventDefault()
      zoomTo(scale / ZOOM_STEP)
    } else if (event.key === '0') {
      event.preventDefault()
      resetAll()
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLImageElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    rootRef.current?.focus({ preventScroll: true })
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

  const fit =
    natural && stage.width > 0 && stage.height > 0
      ? Math.min(
          1,
          stage.width / (rotated ? natural.height : natural.width),
          stage.height / (rotated ? natural.width : natural.height)
        )
      : 1
  const displayWidth = natural ? natural.width * fit * scale : 0
  const displayHeight = natural ? natural.height * fit * scale : 0
  const src = `${localFileUrl(path)}?v=${encodeURIComponent(reloadKey)}`

  return (
    <div
      ref={rootRef}
      className="image-view"
      tabIndex={0}
      aria-label={`图片查看：${path}`}
      onKeyDown={onKeyDown}
      onPointerDown={() => rootRef.current?.focus({ preventScroll: true })}
    >
      <div className="image-stage" ref={stageRef}>
        <img
          className={`image-canvas${dragging ? ' dragging' : ''}`}
          src={src}
          alt={path}
          draggable={false}
          style={{
            width: displayWidth || undefined,
            height: displayHeight || undefined,
            opacity: natural ? 1 : 0,
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${rotation}deg) scaleX(${
              flipX ? -1 : 1
            }) scaleY(${flipY ? -1 : 1})`
          }}
          onLoad={(event) => {
            const img = event.currentTarget
            setNatural({
              width: img.naturalWidth || stageRef.current?.clientWidth || 1,
              height: img.naturalHeight || stageRef.current?.clientHeight || 1
            })
            setError(false)
          }}
          onError={() => {
            setNatural(null)
            setError(true)
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
        {!natural && !error ? <div className="image-loading">正在加载图片…</div> : null}
        {error ? <div className="image-error">无法显示该图片</div> : null}
      </div>

      <div className="image-hint">滚轮缩放 · 拖拽移动 · 双击切换缩放 · 0 重置</div>

      <div className="image-toolbar" role="toolbar" aria-label="图片操作">
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
          className="image-scale"
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
        <span className="image-sep" />
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
        <span className="image-sep" />
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
        <span className="image-sep" />
        <button
          type="button"
          className="image-reset"
          aria-label="重置全部"
          title="重置全部 (0)"
          onClick={resetAll}
        >
          重置
        </button>
      </div>
    </div>
  )
}
