import { useEffect, useState, type JSX } from 'react'
import { WindowCloseIcon, WindowMaximizeIcon, WindowMinimizeIcon } from './Icons'

interface Props {
  title: string
  path: string
  onOpenMain: () => void
}

export function ZenTitleBar({ title, path, onOpenMain }: Props): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.mdv
      .isWindowMaximized()
      .then((value) => {
        if (!cancelled) setMaximized(value)
      })
      .catch(() => {})
    const off = window.mdv.onWindowMaximized(setMaximized)
    return () => {
      cancelled = true
      off()
    }
  }, [])

  return (
    <header className="zen-titlebar">
      <span className="zen-titlebar-title" title={path}>
        {title}
      </span>
      <span className="zen-titlebar-hint">禅模式 · Esc 退出</span>
      <button
        type="button"
        className="zen-btn"
        title="打开主窗口"
        onClick={onOpenMain}
      >
        主界面
      </button>
      <div className="window-controls">
        <button
          type="button"
          className="window-btn"
          title="最小化"
          aria-label="最小化"
          onClick={() => window.mdv.minimizeWindow()}
        >
          <WindowMinimizeIcon />
        </button>
        <button
          type="button"
          className="window-btn"
          title={maximized ? '还原' : '最大化'}
          aria-label={maximized ? '还原' : '最大化'}
          onClick={() => window.mdv.toggleMaximizeWindow()}
        >
          <WindowMaximizeIcon restored={maximized} />
        </button>
        <button
          type="button"
          className="window-btn close"
          title="退出禅模式 (Esc)"
          aria-label="退出禅模式"
          onClick={() => window.mdv.closeWindow()}
        >
          <WindowCloseIcon />
        </button>
      </div>
    </header>
  )
}
