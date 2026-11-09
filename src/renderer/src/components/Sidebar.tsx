import type { PointerEvent as ReactPointerEvent } from 'react'
import type { FsEntry } from '../../../shared/types'
import { BookIcon, ListIcon } from './Icons'
import { FilesPanel } from './FilesPanel'
import { Outline } from './Outline'

type Tab = 'files' | 'outline'

interface Props {
  roots: string[]
  tab: Tab
  onTab: (tab: Tab) => void
  currentPath: string | null
  docKey: string
  collapsed: boolean
  width: number
  treeVersion: number
  expanded: Set<string>
  hiddenPaths: string[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  onToggleDir: (path: string) => void
  onOpen: (path: string) => void
  onCreateIn: (dir: string, kind: 'file' | 'dir') => void
  onReveal: (path: string) => void
  onTrash: (entry: FsEntry) => void
  onRename: (entry: FsEntry) => void
  onHideEntry: (entry: FsEntry) => void
  onPickHidden: (dir: string) => void
  onRemoveRoot: (root: string) => void
  onResizeCommit: (width: number) => void
}

const MIN_WIDTH = 220
const MAX_WIDTH = 520

export function Sidebar({
  roots,
  tab,
  onTab,
  currentPath,
  docKey,
  collapsed,
  width,
  treeVersion,
  expanded,
  hiddenPaths,
  scrollRef,
  onToggleDir,
  onOpen,
  onCreateIn,
  onReveal,
  onTrash,
  onRename,
  onHideEntry,
  onPickHidden,
  onRemoveRoot,
  onResizeCommit
}: Props): React.JSX.Element {
  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (collapsed) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    let current = startWidth
    document.body.classList.add('sidebar-resizing')
    const onMove = (moveEvent: PointerEvent): void => {
      current = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(startWidth + moveEvent.clientX - startX)))
      document.documentElement.style.setProperty('--sidebar-w', `${current}px`)
    }
    const onUp = (): void => {
      document.body.classList.remove('sidebar-resizing')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      onResizeCommit(current)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <aside className={`sidebar${collapsed ? '' : ' open'}`} aria-hidden={collapsed}>
      <div className="sidebar-inner">
        <div className="side-tabs">
          <button
            type="button"
            className={tab === 'files' ? 'active' : ''}
            onClick={() => onTab('files')}
          >
            <BookIcon />
            文件
          </button>
          <button
            type="button"
            className={tab === 'outline' ? 'active' : ''}
            onClick={() => onTab('outline')}
          >
            <ListIcon />
            大纲
          </button>
        </div>

        <div className="side-scroll">
          {tab === 'files' ? (
            <FilesPanel
              roots={roots}
              currentPath={currentPath}
              version={treeVersion}
              expanded={expanded}
              hiddenPaths={hiddenPaths}
              onToggleDir={onToggleDir}
              onOpen={onOpen}
              onCreateIn={onCreateIn}
              onReveal={onReveal}
              onTrash={onTrash}
              onRename={onRename}
              onHideEntry={onHideEntry}
              onPickHidden={onPickHidden}
              onRemoveRoot={onRemoveRoot}
            />
          ) : (
            <Outline docKey={docKey} scrollRef={scrollRef} />
          )}
        </div>
      </div>
      <div className="side-resizer" title="拖动调整侧栏宽度" onPointerDown={startResize} />
    </aside>
  )
}
