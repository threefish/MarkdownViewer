import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type MouseEvent as ReactMouseEvent
} from 'react'
import type { FsEntry, SearchFileResult, SearchResult } from '../../../shared/types'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { FileTree } from './FileTree'
import { CloseIcon, FileIcon, SearchIcon } from './Icons'

function normalize(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

function parentOf(path: string): string {
  const normalized = path.replace(/\//g, '\\').replace(/\\+$/, '')
  const index = normalized.lastIndexOf('\\')
  return index > 0 ? normalized.slice(0, index) : ''
}

function rootOf(path: string, roots: string[]): string | null {
  const target = normalize(path)
  let best: string | null = null
  for (const root of roots) {
    const dir = normalize(root)
    if ((target === dir || target.startsWith(dir + '\\')) && (!best || dir.length > best.length)) {
      best = dir
    }
  }
  return best
}

function relativeDir(path: string, roots: string[]): string {
  const root = rootOf(path, roots)
  if (!root) return ''
  const p = path.replace(/\//g, '\\')
  const rel = p.slice(root.length + 1)
  return parentOf(rel).replace(/\\/g, ' / ')
}

async function searchAll(roots: string[], query: string): Promise<SearchResult> {
  const empty: SearchResult = { nameMatches: [], contentMatches: [], truncated: false }
  const results = await Promise.all(
    roots.map((root) => window.mdv.searchTree(root, query).catch(() => empty))
  )
  const nameMatches: FsEntry[] = []
  const contentMatches: SearchFileResult[] = []
  const seenNames = new Set<string>()
  const seenContent = new Set<string>()
  let truncated = false
  for (const result of results) {
    truncated = truncated || result.truncated
    for (const entry of result.nameMatches) {
      const key = normalize(entry.path)
      if (seenNames.has(key)) continue
      seenNames.add(key)
      nameMatches.push(entry)
    }
    for (const file of result.contentMatches) {
      const key = normalize(file.path)
      if (seenContent.has(key)) continue
      seenContent.add(key)
      contentMatches.push(file)
    }
  }
  if (nameMatches.length > 80 || contentMatches.length > 80) truncated = true
  return {
    nameMatches: nameMatches.slice(0, 80),
    contentMatches: contentMatches.slice(0, 80),
    truncated
  }
}

function Highlight({ text, query }: { text: string; query: string }): JSX.Element {
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  )
}

interface ResultsProps {
  result: SearchResult | null
  query: string
  searching: boolean
  roots: string[]
  onOpen: (path: string) => void
}

function SearchResults({ result, query, searching, roots, onOpen }: ResultsProps): JSX.Element {
  if (searching && !result) return <div className="search-state">正在搜索…</div>
  if (!result) return <div className="search-state" />
  const { nameMatches, contentMatches, truncated } = result
  if (!nameMatches.length && !contentMatches.length) {
    return <div className="search-state">没有匹配的文件</div>
  }

  return (
    <div className="search-results">
      {nameMatches.length ? (
        <section>
          <div className="search-group">文件名 · {nameMatches.length}</div>
          {nameMatches.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className="search-row"
              title={entry.path}
              onClick={() => onOpen(entry.path)}
            >
              <FileIcon className="search-file-icon" />
              <span className="search-file-name">
                <Highlight text={entry.name} query={query} />
              </span>
              <span className="search-file-dir">{relativeDir(entry.path, roots)}</span>
            </button>
          ))}
        </section>
      ) : null}

      {contentMatches.length ? (
        <section>
          <div className="search-group">内容 · {contentMatches.length} 个文件</div>
          {contentMatches.map((file) => (
            <div key={file.path} className="search-file-group">
              <button
                type="button"
                className="search-row"
                title={file.path}
                onClick={() => onOpen(file.path)}
              >
                <FileIcon className="search-file-icon" />
                <span className="search-file-name">{file.name}</span>
                <span className="search-file-dir">{parentOf(file.rel).replace(/\\/g, ' / ')}</span>
              </button>
              {file.hits.map((hit) => (
                <button
                  key={`${file.path}#${hit.line}`}
                  type="button"
                  className="search-hit"
                  title={`${file.path}：第 ${hit.line} 行`}
                  onClick={() => onOpen(file.path)}
                >
                  <span className="search-hit-line">{hit.line}</span>
                  <span className="search-hit-text">
                    <Highlight text={hit.text} query={query} />
                  </span>
                </button>
              ))}
            </div>
          ))}
        </section>
      ) : null}

      {truncated ? <div className="search-state">文件过多，仅显示部分结果</div> : null}
    </div>
  )
}

interface MenuState {
  x: number
  y: number
  entry: FsEntry
  isRoot: boolean
}

interface Props {
  roots: string[]
  currentPath: string | null
  version: number
  expanded: Set<string>
  hiddenPaths: string[]
  onToggleDir: (path: string) => void
  onOpen: (path: string) => void
  onCreateIn: (dir: string, kind: 'file' | 'dir') => void
  onReveal: (path: string) => void
  onTrash: (entry: FsEntry) => void
  onHideEntry: (entry: FsEntry) => void
  onPickHidden: (dir: string) => void
  onRemoveRoot: (root: string) => void
}
export function FilesPanel({
  roots,
  currentPath,
  version,
  expanded,
  hiddenPaths,
  onToggleDir,
  onOpen,
  onCreateIn,
  onReveal,
  onTrash,
  onHideEntry,
  onPickHidden,
  onRemoveRoot
}: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const text = query.trim()
  const rootsKey = roots.join('\n')

  const hiddenSet = useMemo(() => {
    const set = new Set<string>()
    for (const path of hiddenPaths) set.add(normalize(path))
    return set
  }, [hiddenPaths])

  const isHidden = useCallback(
    (path: string): boolean => {
      let current = normalize(path)
      while (current) {
        if (hiddenSet.has(current)) return true
        const index = current.lastIndexOf('\\')
        if (index <= 0) return false
        current = current.slice(0, index)
      }
      return false
    },
    [hiddenSet]
  )

  const visibleResult = useMemo(() => {
    if (!result) return null
    return {
      nameMatches: result.nameMatches.filter((entry) => !isHidden(entry.path)),
      contentMatches: result.contentMatches.filter((file) => !isHidden(file.path)),
      truncated: result.truncated
    }
  }, [result, isHidden])

  useEffect(() => {
    setQuery('')
    setResult(null)
  }, [rootsKey])

  useEffect(() => {
    if (!roots.length || !text) {
      setResult(null)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      searchAll(roots, text)
        .then((res) => {
          if (!cancelled) {
            setResult(res)
            setSearching(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResult({ nameMatches: [], contentMatches: [], truncated: false })
            setSearching(false)
          }
        })
    }, 240)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [rootsKey, text])

  if (!roots.length) {
    return (
      <div className="tree-hint">
        <p>还没有打开文件夹</p>
        <span>打开文件夹后会作为根目录显示在这里，可同时打开多个</span>
      </div>
    )
  }

  const openMenu = (event: ReactMouseEvent, entry: FsEntry, isRoot: boolean): void => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, entry, isRoot })
  }

  const hiddenUnder = (dir: string): number => {
    const base = normalize(dir)
    let count = 0
    for (const path of hiddenPaths) {
      const target = normalize(path)
      if (target !== base && target.startsWith(base + '\\')) count++
    }
    return count
  }

  const buildItems = (state: MenuState): ContextMenuItem[] => {
    const { entry, isRoot } = state
    if (isRoot) {
      const hiddenCount = hiddenUnder(entry.path)
      return [
        { label: '新建文件', onClick: () => onCreateIn(entry.path, 'file') },
        { label: '新建文件夹', onClick: () => onCreateIn(entry.path, 'dir') },
        { label: '在资源管理器中显示', onClick: () => onReveal(entry.path) },
        { separator: true },
        ...(hiddenCount
          ? [
              {
                label: '显示隐藏项目…',
                onClick: () => onPickHidden(entry.path)
              },
              { separator: true } as ContextMenuItem
            ]
          : []),
        { label: '移出文件树', onClick: () => onRemoveRoot(entry.path) }
      ]
    }
    if (entry.isDir) {
      const hiddenCount = hiddenUnder(entry.path)
      return [
        { label: '新建文件', onClick: () => onCreateIn(entry.path, 'file') },
        { label: '新建文件夹', onClick: () => onCreateIn(entry.path, 'dir') },
        { label: '在资源管理器中显示', onClick: () => onReveal(entry.path) },
        { separator: true },
        { label: '从文件树隐藏', onClick: () => onHideEntry(entry) },
        ...(hiddenCount
          ? [
              {
                label: '显示隐藏项目…',
                onClick: () => onPickHidden(entry.path)
              }
            ]
          : []),
        { separator: true },
        { label: '删除（移到回收站）', danger: true, onClick: () => onTrash(entry) }
      ]
    }
    return [
      { label: '打开', onClick: () => onOpen(entry.path) },
      { label: '在资源管理器中显示', onClick: () => onReveal(entry.path) },
      { separator: true },
      { label: '从文件树隐藏', onClick: () => onHideEntry(entry) },
      { separator: true },
      { label: '删除（移到回收站）', danger: true, onClick: () => onTrash(entry) }
    ]
  }

  return (
    <div className="files-panel">
      <div className="side-search">
        <SearchIcon className="side-search-icon" />
        <input
          ref={inputRef}
          value={query}
          placeholder="搜索文件名或内容"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setQuery('')
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="side-search-clear"
            title="清除搜索"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>

      {text ? (
        <SearchResults
          result={visibleResult}
          query={text}
          searching={searching}
          roots={roots}
          onOpen={onOpen}
        />
      ) : (
        <FileTree
          key={`${rootsKey}#${version}`}
          roots={roots}
          currentPath={currentPath}
          expanded={expanded}
          isHidden={isHidden}
          onToggle={onToggleDir}
          onOpen={onOpen}
          onContext={openMenu}
        />
      )}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={buildItems(menu)}
          onClose={() => setMenu(null)}
          ariaLabel="文件操作"
        />
      ) : null}
    </div>
  )
}
