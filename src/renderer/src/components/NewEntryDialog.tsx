import { useEffect, useRef, useState, type JSX } from 'react'
import { withExtOptions } from '../lib/newFileExts'
import { ChevronIcon } from './Icons'

interface Props {
  open: boolean
  kind: 'file' | 'dir'
  dir: string | null
  defaultExt: string
  mode?: 'create' | 'rename'
  currentName?: string
  busy: boolean
  error: string | null
  onSubmit: (name: string) => void
  onCancel: () => void
}

/** 把名称里最后一个扩展名换成 next；没有扩展名时补上。 */
function replaceExt(name: string, next: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(0, dot + 1)}${next}` : `${name}.${next}`
}

export function NewEntryDialog({
  open,
  kind,
  dir,
  defaultExt,
  mode = 'create',
  currentName,
  busy,
  error,
  onSubmit,
  onCancel
}: Props): JSX.Element | null {
  const [name, setName] = useState('')
  const [ext, setExt] = useState(defaultExt)
  const inputRef = useRef<HTMLInputElement>(null)
  const renaming = mode === 'rename'
  const showExt = kind === 'file' && !renaming

  useEffect(() => {
    if (!open) return
    const initial = renaming
      ? (currentName ?? '')
      : kind === 'file'
        ? `未命名.${defaultExt}`
        : '新建文件夹'
    setName(initial)
    setExt(defaultExt)
    const timer = window.setTimeout(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      const dot = initial.lastIndexOf('.')
      input.setSelectionRange(0, kind === 'file' && dot > 0 ? dot : initial.length)
    }, 30)
    return () => window.clearTimeout(timer)
  }, [open, kind, defaultExt, renaming, currentName])

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

  const title = renaming ? '重命名' : kind === 'file' ? '新建文件' : '新建文件夹'

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
        <div className="modal-new-row">
          <input
            ref={inputRef}
            className="text-input"
            value={name}
            spellCheck={false}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          {showExt ? (
            <div className="modal-new-select-wrap">
              <select
                id="new-entry-ext"
                className="modal-new-select"
                aria-label="文件格式"
                title={ext ? `格式：.${ext}` : undefined}
                value={ext}
                disabled={busy}
                onChange={(event) => {
                  const next = event.target.value
                  setExt(next)
                  setName((previous) => replaceExt(previous, next))
                  inputRef.current?.focus()
                }}
              >
                {withExtOptions(ext).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronIcon open className="modal-new-chevron" />
            </div>
          ) : null}
        </div>
        {error ? <p className="modal-new-error">{error}</p> : null}
        <div className="confirm-actions">
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            {busy ? (renaming ? '重命名中…' : '创建中…') : renaming ? '重命名' : '创建'}
          </button>
        </div>
      </form>
    </div>
  )
}
