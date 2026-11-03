import { useEffect, useState } from 'react'

interface Props {
  open: boolean
  dir: string | null
  paths: string[]
  onConfirm: (paths: string[]) => void
  onCancel: () => void
}

function relativePath(path: string, dir: string | null): string {
  if (!dir) return path
  const target = path.replace(/\//g, '\\').replace(/\\+$/, '')
  const base = dir.replace(/\//g, '\\').replace(/\\+$/, '')
  if (target.length > base.length && target.toLowerCase().startsWith(base.toLowerCase() + '\\')) {
    return target.slice(base.length + 1)
  }
  return target
}

export function HiddenRestoreDialog({
  open,
  dir,
  paths,
  onConfirm,
  onCancel
}: Props): React.JSX.Element | null {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) setSelected(new Set())
  }, [open, dir])

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

  const toggle = (path: string): void => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const chosen = paths.filter((path) => selected.has(path))

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal confirm restore-modal"
        role="dialog"
        aria-modal="true"
        aria-label="显示隐藏项目"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="confirm-title">显示隐藏项目</h2>
        <p className="confirm-message">共 {paths.length} 个隐藏项目，勾选要恢复到文件树的项目。</p>
        {dir ? (
          <p className="confirm-detail restore-dir" title={dir}>
            位置：{dir}
          </p>
        ) : null}
        <ul className="restore-list">
          {paths.map((path) => (
            <li key={path}>
              <label className="restore-row" title={path}>
                <input
                  type="checkbox"
                  checked={selected.has(path)}
                  onChange={() => toggle(path)}
                />
                <span className="restore-label">{relativePath(path, dir)}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!chosen.length}
            onClick={() => onConfirm(chosen)}
          >
            {chosen.length ? `显示所选（${chosen.length}）` : '显示所选'}
          </button>
        </div>
      </div>
    </div>
  )
}
