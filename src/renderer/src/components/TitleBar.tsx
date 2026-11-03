import { useEffect, useState, type JSX } from 'react'
import { PanelIcon, WindowCloseIcon, WindowMaximizeIcon, WindowMinimizeIcon } from './Icons'
import { MenuBar, type MenuAction, type MenuState } from './MenuBar'

interface Props {
  state: MenuState
  onAction: (action: MenuAction, payload?: string) => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

export function TitleBar({
  state,
  onAction,
  sidebarCollapsed,
  onToggleSidebar
}: Props): JSX.Element {
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
    <header className="titlebar">
      <button
        type="button"
        className="titlebar-btn titlebar-sidebar"
        title={sidebarCollapsed ? '显示左侧栏 (Ctrl+B)' : '收起左侧栏 (Ctrl+B)'}
        aria-label="切换左侧栏"
        onClick={onToggleSidebar}
      >
        <PanelIcon />
      </button>

      <MenuBar state={state} onAction={onAction} />

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
          title="关闭"
          aria-label="关闭"
          onClick={() => window.mdv.closeWindow()}
        >
          <WindowCloseIcon />
        </button>
      </div>
    </header>
  )
}
