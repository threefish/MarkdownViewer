import { useEffect, useRef, type JSX } from 'react'

interface Props {
  open: boolean
  width: number
  min: number
  max: number
  onToggle: () => void
  onChange: (width: number) => void
  onCommit: (width: number) => void
  onClose: () => void
}

const FULL_WIDTH = 0

const PRESETS: Array<{ label: string; value: number }> = [
  { label: '窄', value: 720 },
  { label: '标准', value: 860 },
  { label: '宽', value: 1000 },
  { label: '100%', value: FULL_WIDTH }
]

export function WidthControl({
  open,
  width,
  min,
  max,
  onToggle,
  onChange,
  onCommit,
  onClose
}: Props): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, onClose])

  return (
    <div className="width-control" ref={wrapRef}>
      <button
        type="button"
        className={`float-btn${open ? ' active' : ''}`}
        title="正文宽度"
        aria-pressed={open}
        onClick={onToggle}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12h16" />
          <path d="M7.5 8.5L4 12l3.5 3.5" />
          <path d="M16.5 8.5L20 12l-3.5 3.5" />
        </svg>
      </button>

      {open ? (
        <div className="width-pop" role="dialog" aria-label="调整正文宽度">
          <div className="width-pop-head">
            <span>正文宽度</span>
            <span className="width-pop-value">{width === FULL_WIDTH ? '100%' : `${width} px`}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={10}
            value={width === FULL_WIDTH ? max : width}
            aria-label="正文宽度"
            onChange={(event) => onChange(Number(event.target.value))}
            onPointerUp={(event) => onCommit(Number(event.currentTarget.value))}
            onKeyUp={(event) => onCommit(Number(event.currentTarget.value))}
          />
          <div className="width-pop-foot">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`width-preset${width === preset.value ? ' active' : ''}`}
                onClick={() => onCommit(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
