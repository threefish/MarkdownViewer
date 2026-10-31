import { useEffect } from 'react'

export interface ConfirmAction {
  label: string
  tone?: 'primary' | 'danger' | 'plain'
  onClick: () => void
}

interface Props {
  open: boolean
  title: string
  message: string
  detail?: string
  actions: ConfirmAction[]
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  actions,
  onCancel
}: Props): React.JSX.Element | null {
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

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal confirm"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="confirm-title">{title}</h2>
        <p className="confirm-message">{message}</p>
        {detail ? <p className="confirm-detail">{detail}</p> : null}
        <div className="confirm-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`btn${action.tone === 'primary' ? ' primary' : ''}${
                action.tone === 'danger' ? ' danger' : ''
              }`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
