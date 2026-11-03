import { useEffect, useRef, useState, type JSX } from 'react'

interface Props {
  open: boolean
  kind: 'file' | 'dir'
  dir: string | null
  defaultExt: string
  busy: boolean
  error: string | null
  onSubmit: (name: string) => void
  onCancel: () => void
}

export function NewEntryDialog({
  open,
  kind,
  dir,
  defaultExt,
  busy,
  error,
  onSubmit,
  onCancel
}: Props): JSX.Element | null {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const initial = kind === 'file' ? `未命名.${defaultExt}` : '新建文件夹'
    setName(initial)
    const timer = window.setTimeout(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      const dot = initial.lastIndexOf('.')
      input.setSelectionRange(0, kind === 'file' && dot > 0 ? dot : initial.length)
    }, 30)
    return () => window.clearTimeout(timer)
  }, [open, kind, defaultExt])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onCancel])

  if (!open) return null

  const title = kind === 'file' ? '新建文件' : '新建文件夹'

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form
        className="modal modal-new"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) onSubmit(name)
        }}
      >
        <h2 className="confirm-title">{title}</h2>
        <p className="modal-new-dir" title={dir ?? ''}>
          {dir ? `位置：${dir}` : '请先打开文件或文件夹'}
        </p>
        <input
          ref={inputRef}
          className="text-input"
          value={name}
          spellCheck={false}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        {error ? <p className="modal-new-error">{error}</p> : null}
        <div className="confirm-actions">
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            {busy ? '创建中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  )
}
