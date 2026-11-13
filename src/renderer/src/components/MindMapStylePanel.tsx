import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type JSX,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronIcon } from './Icons'

export interface MindMapStyleValues {
  fontSize: number
  fontFamily: string
  color: string
  fillColor: string
  borderColor: string
  borderWidth: number
  borderRadius: number
  fontWeight: string
  fontStyle: string
  textDecoration: string
  shape: string
}

interface Props {
  x: number
  y: number
  values: MindMapStyleValues
  multi: boolean
  // 画布区域，面板始终被限制在其中，避免滑到标题栏/标签栏下面
  boundaryRef?: RefObject<HTMLDivElement | null>
  onChange: (patch: Partial<MindMapStyleValues>) => void
  onReset: () => void
  onClose: () => void
}

const FONT_FAMILIES = [
  { value: '', label: '跟随主题' },
  { value: '微软雅黑, Microsoft YaHei', label: '微软雅黑' },
  { value: '宋体, SimSun', label: '宋体' },
  { value: '黑体, SimHei', label: '黑体' },
  { value: '楷体, KaiTi', label: '楷体' },
  { value: '等线, DengXian', label: '等线' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Consolas, monospace', label: 'Consolas' }
]

const SHAPES = [
  { value: '', label: '跟随主题' },
  { value: 'rectangle', label: '矩形' },
  { value: 'roundedRectangle', label: '圆角矩形' },
  { value: 'ellipse', label: '椭圆' },
  { value: 'circle', label: '圆形' },
  { value: 'diamond', label: '菱形' },
  { value: 'parallelogram', label: '平行四边形' },
  { value: 'octagonalRectangle', label: '八边形' }
]

const SWATCHES = [
  '#ffffff',
  '#f2f3f5',
  '#1f1f1f',
  '#565656',
  '#e74c3c',
  '#f39c12',
  '#f1c40f',
  '#2ecc71',
  '#1abc9c',
  '#3498db',
  '#5b8ff9',
  '#9b59b6'
]

// 与 .mindmap-style-panel 的 width 保持一致，父组件用它决定面板贴哪一侧
export const STYLE_PANEL_WIDTH = 258

/** 主题里的颜色可能是 rgb()/颜色名/8 位 hex，取色器只接受 #rrggbb。 */
export function toHexColor(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const [, r, g, b] = raw.toLowerCase()
    return `#${r}${r}${g}${g}${b}${b}`
  }
  if (/^#[0-9a-f]{8}$/i.test(raw)) return raw.slice(0, 7).toLowerCase()
  return fallback
}

function Swatches({ onPick }: { onPick: (color: string) => void }): JSX.Element {
  return (
    <div className="msp-swatches">
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          className="msp-swatch"
          style={{ background: color }}
          title={color}
          aria-label={`颜色 ${color}`}
          onClick={(event) => {
            onPick(color)
            event.currentTarget.blur()
          }}
        />
      ))}
    </div>
  )
}

export function MindMapStylePanel({
  x,
  y,
  values,
  multi,
  boundaryRef,
  onChange,
  onReset,
  onClose
}: Props): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const stopDragRef = useRef<(() => void) | null>(null)

  const clampToBounds = useCallback(
    (next: { x: number; y: number }): { x: number; y: number } => {
      const host = boundaryRef?.current?.getBoundingClientRect()
      const bounds =
        host && host.width > 0 && host.height > 0
          ? { left: host.left, top: host.top, right: host.right, bottom: host.bottom }
          : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
      const rect = panelRef.current?.getBoundingClientRect()
      const width = rect?.width ?? STYLE_PANEL_WIDTH
      const height = Math.min(rect?.height ?? 0, bounds.bottom - bounds.top - 16)
      const minX = bounds.left + 8
      const minY = bounds.top + 8
      const maxX = Math.max(minX, bounds.right - width - 8)
      const maxY = Math.max(minY, bounds.bottom - height - 8)
      return {
        x: Math.min(Math.max(next.x, minX), maxX),
        y: Math.min(Math.max(next.y, minY), maxY)
      }
    },
    [boundaryRef]
  )

  useLayoutEffect(() => {
    if (!panelRef.current) return
    setPos(clampToBounds({ x, y }))
  }, [clampToBounds, x, y])

  useEffect(() => () => stopDragRef.current?.(), [])

  const startDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return
    const panel = panelRef.current
    if (!panel) return
    event.preventDefault()
    const rect = panel.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    const onMove = (moveEvent: PointerEvent): void => {
      setPos(clampToBounds({ x: moveEvent.clientX - offsetX, y: moveEvent.clientY - offsetY }))
    }
    const stop = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      stopDragRef.current = null
    }
    stopDragRef.current?.()
    stopDragRef.current = stop
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const changeNumber =
    (key: 'fontSize' | 'borderWidth' | 'borderRadius', min: number, max: number) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const next = Number(event.target.value)
      if (!Number.isFinite(next)) return
      onChange({ [key]: Math.min(max, Math.max(min, Math.round(next))) })
    }

  const fontOptions = FONT_FAMILIES.some((option) => option.value === values.fontFamily)
    ? FONT_FAMILIES
    : [
        {
          value: values.fontFamily,
          label: values.fontFamily.split(',')[0] || '自定义字体'
        },
        ...FONT_FAMILIES
      ]

  const shapeOptions = SHAPES.some((option) => option.value === values.shape)
    ? SHAPES
    : [{ value: values.shape, label: '当前形状' }, ...SHAPES]

  const transparent = values.fillColor === 'transparent'

  return createPortal(
    <div
      className="mindmap-style-panel"
      role="dialog"
      aria-label="节点样式"
      ref={panelRef}
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="msp-head" onPointerDown={startDrag} title="拖动可移动面板">
        <span className="msp-title">节点样式</span>
        {multi ? <span className="msp-hint">统一设置选中节点</span> : null}
        <button type="button" className="msp-close" aria-label="关闭" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="msp-section">
        <span className="msp-section-title">文字</span>
        <div className="msp-row">
          <span className="msp-label">字体</span>
          <div className="msp-select-wrap">
            <select
              className="msp-select"
              aria-label="字体"
              value={values.fontFamily}
              onChange={(event) => onChange({ fontFamily: event.target.value })}
            >
              {fontOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronIcon open className="msp-chevron" />
          </div>
        </div>
        <div className="msp-row">
          <span className="msp-label">字号</span>
          <input
            type="number"
            className="msp-num"
            aria-label="字号"
            min={8}
            max={72}
            step={1}
            value={values.fontSize}
            onChange={changeNumber('fontSize', 8, 72)}
          />
          <div className="msp-toggles">
            <button
              type="button"
              className={`msp-toggle${values.fontWeight === 'bold' ? ' on' : ''}`}
              aria-label="加粗"
              aria-pressed={values.fontWeight === 'bold'}
              onClick={() =>
                onChange({ fontWeight: values.fontWeight === 'bold' ? 'normal' : 'bold' })
              }
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className={`msp-toggle${values.fontStyle === 'italic' ? ' on' : ''}`}
              aria-label="斜体"
              aria-pressed={values.fontStyle === 'italic'}
              onClick={() =>
                onChange({ fontStyle: values.fontStyle === 'italic' ? 'normal' : 'italic' })
              }
            >
              <em>I</em>
            </button>
            <button
              type="button"
              className={`msp-toggle${values.textDecoration === 'underline' ? ' on' : ''}`}
              aria-label="下划线"
              aria-pressed={values.textDecoration === 'underline'}
              onClick={() =>
                onChange({
                  textDecoration: values.textDecoration === 'underline' ? 'none' : 'underline'
                })
              }
            >
              <u>U</u>
            </button>
          </div>
        </div>
        <div className="msp-row">
          <span className="msp-label">颜色</span>
          <input
            type="color"
            className="msp-color"
            aria-label="文字颜色"
            value={toHexColor(values.color, '#333333')}
            onChange={(event) => onChange({ color: event.target.value })}
          />
          <span className="msp-hex">{toHexColor(values.color, '#333333')}</span>
        </div>
        <Swatches onPick={(color) => onChange({ color })} />
      </div>

      <div className="msp-section">
        <span className="msp-section-title">背景</span>
        <div className="msp-row">
          <span className="msp-label">填充</span>
          <input
            type="color"
            className="msp-color"
            aria-label="背景颜色"
            value={toHexColor(values.fillColor, '#ffffff')}
            onChange={(event) => onChange({ fillColor: event.target.value })}
          />
          <button
            type="button"
            className={`msp-chip${transparent ? ' on' : ''}`}
            aria-pressed={transparent}
            onClick={() => onChange({ fillColor: transparent ? '#ffffff' : 'transparent' })}
          >
            无填充
          </button>
        </div>
        <Swatches onPick={(color) => onChange({ fillColor: color })} />
      </div>

      <div className="msp-section">
        <span className="msp-section-title">边框</span>
        <div className="msp-row">
          <span className="msp-label">颜色</span>
          <input
            type="color"
            className="msp-color"
            aria-label="边框颜色"
            value={toHexColor(values.borderColor, '#888888')}
            onChange={(event) => onChange({ borderColor: event.target.value })}
          />
          <span className="msp-hex">{toHexColor(values.borderColor, '#888888')}</span>
        </div>
        <Swatches onPick={(color) => onChange({ borderColor: color })} />
        <div className="msp-row">
          <span className="msp-label">粗细</span>
          <input
            type="number"
            className="msp-num"
            aria-label="边框粗细"
            min={0}
            max={10}
            step={1}
            value={values.borderWidth}
            onChange={changeNumber('borderWidth', 0, 10)}
          />
          <span className="msp-label msp-label-inline">圆角</span>
          <input
            type="number"
            className="msp-num"
            aria-label="边框圆角"
            min={0}
            max={40}
            step={1}
            value={values.borderRadius}
            onChange={changeNumber('borderRadius', 0, 40)}
          />
        </div>
      </div>

      <div className="msp-section">
        <span className="msp-section-title">形状</span>
        <div className="msp-row">
          <div className="msp-select-wrap">
            <select
              className="msp-select"
              aria-label="形状"
              value={values.shape}
              onChange={(event) => onChange({ shape: event.target.value })}
            >
              {shapeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronIcon open className="msp-chevron" />
          </div>
        </div>
      </div>

      <div className="msp-foot">
        <button type="button" className="msp-reset" onClick={onReset}>
          恢复主题样式
        </button>
      </div>
    </div>,
    document.body
  )
}
