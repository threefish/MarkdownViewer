import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import type { RecentDoc, ThemePreference } from '../../../shared/types'
import { THEME_GROUPS } from '../../../shared/themes'

export type MenuAction =
  | 'open-file'
  | 'open-folder'
  | 'new-file'
  | 'new-folder'
  | 'open-path'
  | 'save'
  | 'toggle-edit'
  | 'close-tab'
  | 'settings'
  | 'quit'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'select-all'
  | 'find'
  | 'toggle-sidebar'
  | 'set-theme'
  | 'reload'
  | 'about'
  | 'clear-recents'

export interface MenuState {
  hasDoc: boolean
  editing: boolean
  dirty: boolean
  sidebarCollapsed: boolean
  themeMode: ThemePreference
  recents: RecentDoc[]
}

interface Item {
  label?: string
  hint?: string
  disabled?: boolean
  checked?: boolean
  action?: MenuAction
  payload?: string
  separator?: boolean
  submenu?: Item[]
}

interface Group {
  label: string
  items: Item[]
}

interface Props {
  state: MenuState
  onAction: (action: MenuAction, payload?: string) => void
}

function buildGroups(state: MenuState): Group[] {
  const recents = state.recents.slice(0, 8)
  const recentItems: Item[] = recents.length
    ? [
        ...recents.map<Item>((item) => ({
          label: item.name,
          action: 'open-path',
          payload: item.path
        })),
        { separator: true },
        { label: '清空最近记录', action: 'clear-recents' }
      ]
    : [{ label: '暂无记录', disabled: true }]

  const themeItems: Item[] = [
    {
      label: '跟随系统',
      action: 'set-theme',
      payload: 'system',
      checked: state.themeMode === 'system'
    }
  ]
  for (const group of THEME_GROUPS) {
    themeItems.push({ separator: true })
    for (const theme of group.themes) {
      themeItems.push({
        label: theme.label,
        action: 'set-theme',
        payload: theme.value,
        checked: state.themeMode === theme.value
      })
    }
  }

  return [
    {
      label: '文件',
      items: [
        { label: '新建文件…', action: 'new-file' },
        { label: '新建文件夹…', action: 'new-folder' },
        { separator: true },
        { label: '打开文件…', hint: 'Ctrl+O', action: 'open-file' },
        { label: '打开文件夹…', hint: 'Ctrl+Shift+O', action: 'open-folder' },
        { label: '最近打开', disabled: !recents.length, submenu: recentItems },
        { separator: true },
        {
          label: state.dirty ? '保存 ●' : '保存',
          hint: 'Ctrl+S',
          disabled: !state.hasDoc || !state.editing,
          action: 'save'
        },
        {
          label: state.editing ? '切换到阅读' : '编辑文本',
          hint: 'Ctrl+E',
          disabled: !state.hasDoc,
          action: 'toggle-edit'
        },
        {
          label: '关闭标签页',
          hint: 'Ctrl+W',
          disabled: !state.hasDoc,
          action: 'close-tab'
        },
        { separator: true },
        { label: '设置…', hint: 'Ctrl+,', action: 'settings' },
        { separator: true },
        { label: '退出', hint: 'Alt+F4', action: 'quit' }
      ]
    },
    {
      label: '编辑',
      items: [
        { label: '撤销', hint: 'Ctrl+Z', disabled: !state.editing, action: 'undo' },
        { label: '重做', hint: 'Ctrl+Y', disabled: !state.editing, action: 'redo' },
        { separator: true },
        { label: '剪切', hint: 'Ctrl+X', action: 'cut' },
        { label: '复制', hint: 'Ctrl+C', action: 'copy' },
        { label: '粘贴', hint: 'Ctrl+V', action: 'paste' },
        { label: '全选', hint: 'Ctrl+A', action: 'select-all' },
        { separator: true },
        { label: '查找', hint: 'Ctrl+F', disabled: !state.hasDoc, action: 'find' }
      ]
    },
    {
      label: '视图',
      items: [
        {
          label: '显示侧栏',
          hint: 'Ctrl+B',
          checked: !state.sidebarCollapsed,
          action: 'toggle-sidebar'
        },
        { separator: true },
        { label: '主题', disabled: true },
        ...themeItems,
        { separator: true },
        {
          label: '重新加载文档',
          hint: 'F5',
          disabled: !state.hasDoc,
          action: 'reload'
        }
      ]
    },
    {
      label: '帮助',
      items: [{ label: '关于 Markdown Viewer', action: 'about' }]
    }
  ]
}

export function MenuBar({ state, onAction }: Props): JSX.Element {
  const [open, setOpen] = useState<number | null>(null)
  const [flyout, setFlyout] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const groups = buildGroups(state)

  useEffect(() => {
    if (open === null) return
    const onDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(null)
        setFlyout(null)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open === null) return
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(null)
      setFlyout(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  const close = (): void => {
    setOpen(null)
    setFlyout(null)
  }

  const run = (item: Item): void => {
    if (item.disabled || !item.action) return
    close()
    onAction(item.action, item.payload)
  }

  const focusables = (): HTMLButtonElement[] =>
    Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>('button.menu-item-btn:not(:disabled)') ?? []
    )

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const list = focusables()
    if (!list.length) return
    const index = list.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    const next = list[(index + step + list.length) % list.length]
    next?.focus()
  }

  const renderPanelItem = (item: Item, index: number): JSX.Element => {
    if (item.separator) return <div className="menu-sep" key={`sep-${index}`} />
    const hasSub = !!item.submenu?.length
    return (
      <div
        className="menu-item-wrap"
        key={`${item.label}-${index}`}
        onMouseEnter={() => setFlyout(hasSub ? index : null)}
        onMouseLeave={() => {
          if (hasSub) setFlyout((current) => (current === index ? null : current))
        }}
      >
        <button
          type="button"
          className="menu-item-btn"
          disabled={item.disabled}
          onClick={() => (hasSub ? setFlyout(flyout === index ? null : index) : run(item))}
        >
          <span className="menu-lead">{item.checked ? '✓' : ''}</span>
          <span className="menu-label">{item.label}</span>
          {item.hint ? <span className="menu-hint">{item.hint}</span> : null}
          {hasSub ? <span className="menu-arrow">›</span> : null}
        </button>
        {hasSub && flyout === index ? (
          <div className="menu-panel menu-flyout">
            {item.submenu?.map((sub, subIndex) =>
              sub.separator ? (
                <div className="menu-sep" key={`sep-${subIndex}`} />
              ) : (
                <button
                  key={`${sub.label}-${subIndex}`}
                  type="button"
                  className="menu-item-btn"
                  disabled={sub.disabled}
                  onClick={() => run(sub)}
                >
                  <span className="menu-lead" />
                  <span className="menu-label">{sub.label}</span>
                  {sub.hint ? <span className="menu-hint">{sub.hint}</span> : null}
                </button>
              )
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="menubar" ref={rootRef}>
      {groups.map((group, index) => (
        <div className="menubar-item" key={group.label}>
          <button
            type="button"
            className={`menubar-menu${open === index ? ' open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open === index}
            onClick={() => {
              setOpen(open === index ? null : index)
              setFlyout(null)
            }}
            onMouseEnter={() => {
              if (open !== null && open !== index) {
                setOpen(index)
                setFlyout(null)
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown') return
              event.preventDefault()
              setOpen(index)
              requestAnimationFrame(() => focusables()[0]?.focus())
            }}
          >
            {group.label}
          </button>
          {open === index ? (
            <div className="menu-panel" role="menu" ref={panelRef} onKeyDown={onPanelKeyDown}>
              {group.items.map((item, itemIndex) => renderPanelItem(item, itemIndex))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
