import { useEffect, useLayoutEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { ArrowDownIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon } from './Icons'

export interface TabInfo {
  path: string
  name: string
  dirty: boolean
}

interface Props {
  tabs: TabInfo[]
  activePath: string | null
  canBack: boolean
  canForward: boolean
  listOpen: boolean
  onToggleList: () => void
  onBack: () => void
  onForward: () => void
  onActivate: (path: string) => void
  onClose: (path: string) => void
  onClosePaths: (paths: string[]) => void
  onNew: () => void
}

interface MenuState {
  x: number
  y: number
  path: string
}

export function TabBar({
  tabs,
  activePath,
  canBack,
  canForward,
  listOpen,
  onToggleList,
  onBack,
  onForward,
  onActivate,
  onClose,
  onClosePaths,
  onNew
}: Props): JSX.Element | null {
  const barRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const searchRef = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [overflowed, setOverflowed] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.deltaY) return
      const max = bar.scrollWidth - bar.clientWidth
      if (max <= 0) return
      bar.scrollLeft = Math.max(0, Math.min(max, bar.scrollLeft + event.deltaY))
      event.preventDefault()
    }
    bar.addEventListener('wheel', onWheel, { passive: false })
    return () => bar.removeEventListener('wheel', onWheel)
  }, [tabs.length])

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const check = (): void => setOverflowed(bar.scrollWidth > bar.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [tabs])

  useEffect(() => {
    if (activePath) {
      itemRefs.current.get(activePath)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [activePath])

  useEffect(() => {
    if (!listOpen) return
    setQuery('')
    const frame = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [listOpen])

  useEffect(() => {
    if (!listOpen) return
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (popRef.current?.contains(target)) return
      if (arrowRef.current?.contains(target)) return
      onToggleList()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onToggleList()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    const close = (): void => onToggleList()
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [listOpen, onToggleList])

  if (!tabs.length) return null

  const openMenu = (event: ReactMouseEvent, path: string): void => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, path })
  }

  const closeMenu = (): void => setMenu(null)

  const menuIndex = menu ? tabs.findIndex((tab) => tab.path === menu.path) : -1

  const queryLower = query.trim().toLowerCase()
  const visibleTabs = queryLower
    ? tabs.filter(
        (tab) =>
          tab.name.toLowerCase().includes(queryLower) ||
          tab.path.toLowerCase().includes(queryLower)
      )
    : tabs

  const buildItems = (index: number): ContextMenuItem[] => {
    const list = tabs
    const closePaths = (paths: string[]): void => {
      onClosePaths(paths)
    }
    return [
      { label: '关闭', onClick: () => onClose(list[index].path) },
      {
        label: '关闭其他',
        disabled: list.length < 2,
        onClick: () => closePaths(list.filter((tab, at) => at !== index).map((tab) => tab.path))
      },
      {
        label: '关闭左侧',
        disabled: index <= 0,
        onClick: () => closePaths(list.slice(0, index).map((tab) => tab.path))
      },
      {
        label: '关闭右侧',
        disabled: index >= list.length - 1,
        onClick: () => closePaths(list.slice(index + 1).map((tab) => tab.path))
      },
      { label: '关闭全部', onClick: () => closePaths(list.map((tab) => tab.path)) },
      { separator: true },
      {
        label: '关闭未修改',
        disabled: !list.some((tab) => !tab.dirty),
        onClick: () => closePaths(list.filter((tab) => !tab.dirty).map((tab) => tab.path))
      }
    ]
  }

  return (
    <>
      <div className="tabbar">
        <div className="tabbar-nav">
          <button
            type="button"
            className="tabbar-nav-btn"
            title="返回 (Alt+←)"
            aria-label="返回"
            disabled={!canBack}
            onClick={onBack}
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className="tabbar-nav-btn"
            title="前进 (Alt+→)"
            aria-label="前进"
            disabled={!canForward}
            onClick={onForward}
          >
            <ChevronRightIcon />
          </button>
        </div>
        <div
          className="tabbar-tabs"
          role="tablist"
          ref={barRef}
          onDoubleClick={(event) => {
            if (event.target === event.currentTarget) onNew()
          }}
        >
          {tabs.map((tab) => (
            <div
              key={tab.path}
              ref={(node) => {
                if (node) itemRefs.current.set(tab.path, node)
                else itemRefs.current.delete(tab.path)
              }}
              className={`tab${tab.path === activePath ? ' active' : ''}`}
              title={tab.path}
              onContextMenu={(event) => openMenu(event, tab.path)}
            >
              <button
                type="button"
                className="tab-main"
                role="tab"
                aria-selected={tab.path === activePath}
                onClick={() => onActivate(tab.path)}
                onAuxClick={(event) => {
                  if (event.button === 1) {
                    event.preventDefault()
                    onClose(tab.path)
                  }
                }}
              >
                <span className="tab-label">{tab.name}</span>
                {tab.dirty ? <span className="tab-dirty" aria-label="未保存" /> : null}
              </button>
              <button
                type="button"
                className="tab-close"
                title="关闭 (Ctrl+W)"
                aria-label={`关闭 ${tab.name}`}
                onClick={() => onClose(tab.path)}
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
        {overflowed ? (
          <button
            type="button"
            className={`tab-overflow${listOpen ? ' open' : ''}`}
            title="全部打开的文件 (Ctrl+Shift+T)"
            aria-label="全部打开的文件"
            aria-expanded={listOpen}
            ref={arrowRef}
            onClick={onToggleList}
          >
            <ArrowDownIcon />
          </button>
        ) : null}
        <button
          type="button"
          className="tab-new"
          title="新建文件"
          aria-label="新建文件"
          onClick={onNew}
        >
          <PlusIcon />
        </button>
        {listOpen ? (
          <div className="tabs-popover" role="dialog" aria-label="全部打开的文件" ref={popRef}>
            <div className="tabs-popover-head">
              打开的文件（{visibleTabs.length}
              {queryLower ? ` / ${tabs.length}` : ''}）
            </div>
            <div className="tabs-popover-search">
              <input
                ref={searchRef}
                value={query}
                placeholder="搜索文件名或路径…"
                aria-label="搜索打开的文件"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="tabs-popover-list">
              {visibleTabs.length === 0 ? (
                <div className="tabs-popover-empty">没有匹配的文件</div>
              ) : (
                visibleTabs.map((tab) => (
                  <div
                    key={tab.path}
                    className={`tabs-popover-row${tab.path === activePath ? ' active' : ''}`}
                  >
                    <button
                      type="button"
                      className="tabs-popover-main"
                      title={tab.path}
                      onClick={() => {
                        onActivate(tab.path)
                        onToggleList()
                      }}
                    >
                      <span className="tabs-popover-name">
                        {tab.name}
                        {tab.dirty ? <span className="tab-dirty" aria-label="未保存" /> : null}
                      </span>
                      <span className="tabs-popover-dir">{tab.path}</span>
                    </button>
                    <button
                      type="button"
                      className="tabs-popover-close"
                      title="关闭"
                      aria-label={`关闭 ${tab.name}`}
                      onClick={() => onClose(tab.path)}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
      {menu && menuIndex >= 0 ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={buildItems(menuIndex)}
          onClose={closeMenu}
          ariaLabel="标签页操作"
        />
      ) : null}
    </>
  )
}
