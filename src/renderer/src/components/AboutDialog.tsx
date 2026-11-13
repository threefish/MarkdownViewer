import { useEffect } from 'react'
import { SHORTCUT_COLUMNS } from '../lib/shortcuts'
import { ShortcutKeys } from './ShortcutKeys'

interface Props {
  open: boolean
  version: string
  onClose: () => void
}

export function AboutDialog({ open, version, onClose }: Props): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal about"
        role="dialog"
        aria-modal="true"
        aria-label="关于 Markdown Viewer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="about-head">
          <h2 className="about-title">关于 Markdown Viewer</h2>
          <span className="about-version">版本 {version || '—'}</span>
        </header>
        <div className="about-scroll">
          <p className="about-desc">
            本地 Markdown 阅读与编辑器，支持 GFM、KaTeX 公式、Mermaid 图表、Excalidraw
            画板（可新建、编辑，并在 Markdown 中嵌入预览）与思维导图（.smm，支持导入导出
            XMind、20 套配色主题、节点右键样式面板），也可查看和编辑常见文本与代码文件。在资源管理器中双击受支持的文件，
            会在独立的禅模式窗口中专注阅读，多个文件可同时打开多个禅模式窗口。
          </p>
          <h3 className="about-section-title">键盘快捷键</h3>
          <div className="shortcut-grid">
            {SHORTCUT_COLUMNS.map((column, columnIndex) => (
              <div className="shortcut-col" key={columnIndex}>
                {column.map((group) => (
                  <section className="shortcut-group" key={group.title}>
                    <h4>{group.title}</h4>
                    {group.shortcuts.map((shortcut) => (
                      <div className="shortcut-row" key={shortcut.label}>
                        <span className="shortcut-label">{shortcut.label}</span>
                        <ShortcutKeys keys={shortcut.keys} />
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="confirm-actions about-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            好
          </button>
        </div>
      </div>
    </div>
  )
}
