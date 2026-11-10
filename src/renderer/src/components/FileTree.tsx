import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { FsEntry } from '../../../shared/types'
import { ChevronIcon, FileIcon, FolderOpenIcon } from './Icons'

function basename(value: string): string {
  const normalized = value.replace(/[\\/]+$/, '')
  const index = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

interface NodeProps {
  entry: FsEntry
  depth: number
  currentPath: string | null
  expanded: Set<string>
  isRoot?: boolean
  isHidden: (path: string) => boolean
  deletedEntries: FsEntry[]
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  onContext: (event: ReactMouseEvent, entry: FsEntry, isRoot: boolean) => void
}

function normalizePath(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

function dirOf(path: string): string {
  const normalized = path.replace(/\//g, '\\').replace(/\\+$/, '')
  const index = normalized.lastIndexOf('\\')
  return index > 0 ? normalized.slice(0, index) : ''
}

function FolderNode({
  entry,
  depth,
  currentPath,
  expanded,
  isRoot = false,
  isHidden,
  deletedEntries,
  onToggle,
  onOpen,
  onContext
}: NodeProps): React.JSX.Element {
  const open = expanded.has(entry.path)
  const [children, setChildren] = useState<FsEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const visibleChildren = children?.filter((child) => !isHidden(child.path))
  const ghosts = useMemo(() => {
    const dir = normalizePath(entry.path)
    return deletedEntries.filter(
      (item) =>
        normalizePath(dirOf(item.path)) === dir &&
        !isHidden(item.path) &&
        !children?.some((child) => normalizePath(child.path) === normalizePath(item.path))
    )
  }, [deletedEntries, entry.path, children, isHidden])

  useEffect(() => {
    if (!open || children !== null) return
    let cancelled = false
    setLoading(true)
    window.mdv
      .listDir(entry.path)
      .then((list) => {
        if (!cancelled) setChildren(list)
      })
      .catch(() => {
        if (!cancelled) setChildren([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, entry.path, children])

  // 目录展开期间监听增删，就地刷新该目录子节点，保留展开与滚动状态。
  useEffect(() => {
    if (!open) return
    const target = normalizePath(entry.path)
    const reload = (): void => {
      window.mdv
        .listDir(entry.path)
        .then((list) => setChildren(list))
        .catch(() => setChildren([]))
    }
    const registered = window.mdv.watchDir(entry.path)
    const off = window.mdv.onDirChanged((payload) => {
      if (normalizePath(payload.dir) === target) reload()
    })
    return () => {
      off()
      void registered.then(() => window.mdv.unwatchDir(entry.path)).catch(() => {})
    }
  }, [open, entry.path])

  return (
    <div className={`tree-group${isRoot ? ' tree-root-group' : ''}`}>
      <button
        type="button"
        className={`tree-row${isRoot ? ' tree-root-row' : ''}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => onToggle(entry.path)}
        onContextMenu={(event) => onContext(event, entry, isRoot)}
        title={entry.path}
      >
        <ChevronIcon open={open} className="tree-chevron" />
        <FolderOpenIcon className="tree-icon" />
        <span className="tree-label">{entry.name}</span>
      </button>
      {open ? (
        <>
          {children === null && loading ? (
            <div className="tree-subtle" style={{ paddingLeft: 28 + depth * 12 }}>
              加载中…
            </div>
          ) : null}
          {children && children.length === 0 ? (
            <div className="tree-subtle" style={{ paddingLeft: 28 + depth * 12 }}>
              空
            </div>
          ) : null}
          {children && children.length > 0 && visibleChildren?.length === 0 ? (
            <div className="tree-subtle" style={{ paddingLeft: 28 + depth * 12 }}>
              已全部隐藏
            </div>
          ) : null}
          {visibleChildren?.map((child) =>
            child.isDir ? (
              <FolderNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                currentPath={currentPath}
                expanded={expanded}
                isHidden={isHidden}
                deletedEntries={deletedEntries}
                onToggle={onToggle}
                onOpen={onOpen}
                onContext={onContext}
              />
            ) : (
              <button
                key={child.path}
                type="button"
                className={`tree-row${currentPath === child.path ? ' active' : ''}`}
                style={{ paddingLeft: 6 + (depth + 1) * 12 }}
                onClick={() => onOpen(child.path)}
                onContextMenu={(event) => onContext(event, child, false)}
                title={child.path}
              >
                <span className="tree-chevron-spacer" />
                <FileIcon className="tree-icon" />
                <span className="tree-label">{child.name}</span>
              </button>
            )
          )}
          {ghosts.map((ghost) => (
            <button
              key={`ghost:${ghost.path}`}
              type="button"
              className="tree-row tree-deleted"
              style={{ paddingLeft: 6 + (depth + 1) * 12 }}
              onClick={() => onOpen(ghost.path)}
              title={`${ghost.path}\n文件已被外部删除`}
            >
              <span className="tree-chevron-spacer" />
              <FileIcon className="tree-icon" />
              <span className="tree-label">{ghost.name}</span>
              <span className="tree-deleted-badge">已删除</span>
            </button>
          ))}
        </>
      ) : null}
    </div>
  )
}

interface Props {
  roots: string[]
  currentPath: string | null
  expanded: Set<string>
  isHidden: (path: string) => boolean
  deletedEntries: FsEntry[]
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  onContext: (event: ReactMouseEvent, entry: FsEntry, isRoot: boolean) => void
}

export function FileTree({
  roots,
  currentPath,
  expanded,
  isHidden,
  deletedEntries,
  onToggle,
  onOpen,
  onContext
}: Props): React.JSX.Element {
  if (!roots.length) {
    return (
      <div className="tree-hint">
        <p>还没有打开文件夹</p>
        <span>打开文件夹后会作为根目录显示在这里，可同时打开多个</span>
      </div>
    )
  }

  return (
    <div className="tree">
      {roots.map((root) => (
        <FolderNode
          key={root}
          entry={{ name: basename(root) || root, path: root, isDir: true }}
          depth={0}
          currentPath={currentPath}
          expanded={expanded}
          isRoot
          isHidden={isHidden}
          deletedEntries={deletedEntries}
          onToggle={onToggle}
          onOpen={onOpen}
          onContext={onContext}
        />
      ))}
    </div>
  )
}
