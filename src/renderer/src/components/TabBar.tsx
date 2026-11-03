import { useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { CloseIcon, PlusIcon } from './Icons'

export interface TabInfo {
  path: string
  name: string
  dirty: boolean
}

interface Props {
  tabs: TabInfo[]
  activePath: string | null
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
  onActivate,
  onClose,
  onClosePaths,
  onNew
}: Props): JSX.Element | null {
  const barRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const [menu, setMenu] = useState<MenuState | null>(null)

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

  useEffect(() => {
    if (activePath) {
      itemRefs.current.get(activePath)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [activePath])

  if (!tabs.length) return null

  const openMenu = (event: ReactMouseEvent, path: string): void => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, path })
  }

  const closeMenu = (): void => setMenu(null)

  const menuIndex = menu ? tabs.findIndex((tab) => tab.path === menu.path) : -1

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
        <button
          type="button"
          className="tab-new"
          title="新建文件"
          aria-label="新建文件"
          onClick={onNew}
        >
          <PlusIcon />
        </button>
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
