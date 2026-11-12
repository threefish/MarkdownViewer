import { useEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { FsEntry } from '../../../shared/types'
import { isExcalidrawFile, isImageFile } from '../../../shared/fileKinds'
import { ChevronIcon, FileIcon, FolderOpenIcon } from './Icons'

export type AssetKind = 'image' | 'drawing'

interface Props {
  open: boolean
  kind: AssetKind
  docPath: string
  busy: boolean
  onInsert: (absolutePath: string) => void
  onImportOther: () => void
  onCancel: () => void
}

function dirOf(value: string): string {
  const normalized = value.replace(/[\\/]+$/, '')
  const index = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  return index > 0 ? normalized.slice(0, index) : normalized
}

function baseOf(value: string): string {
  const normalized = value.replace(/[\\/]+$/, '')
  const index = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

function relativeOf(base: string, target: string): string {
  const from = base.replace(/\\/g, '/').replace(/\/+$/, '')
  const to = target.replace(/\\/g, '/')
  if (to.toLowerCase() === from.toLowerCase()) return '.'
  if (to.toLowerCase().startsWith(`${from.toLowerCase()}/`)) return to.slice(from.length + 1)
  return to
}

function insertable(kind: AssetKind, entry: FsEntry): boolean {
  if (entry.isDir) return true
  return kind === 'drawing' ? isExcalidrawFile(entry.path) : isImageFile(entry.path)
}

function sortEntries(list: FsEntry[]): FsEntry[] {
  return [...list].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
  })
}

interface TreeProps {
  kind: AssetKind
  selectedPath: string | null
  onSelect: (entry: FsEntry) => void
  onConfirm: (entry: FsEntry) => void
}

function PickerChildren({
  dir,
  depth,
  kind,
  selectedPath,
  onSelect,
  onConfirm
}: TreeProps & { dir: string; depth: number }): JSX.Element {
  const [entries, setEntries] = useState<FsEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setFailed(false)
    window.mdv
      .listDir(dir)
      .then((list) => {
        if (!cancelled) setEntries(sortEntries(list.filter((entry) => insertable(kind, entry))))
      })
      .catch(() => {
        if (cancelled) return
        setEntries([])
        setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [dir, kind])

  if (entries === null) {
    return (
      <div className="tree-subtle" style={{ paddingLeft: 28 + depth * 14 }}>
        正在读取…
      </div>
    )
  }
  if (failed) {
    return (
      <div className="tree-subtle" style={{ paddingLeft: 28 + depth * 14 }}>
        无法读取此文件夹
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="tree-subtle" style={{ paddingLeft: 28 + depth * 14 }}>
        {depth === 0 ? (kind === 'drawing' ? '此文件夹没有画板文件' : '此文件夹没有图片') : '无匹配文件'}
      </div>
    )
  }
  return (
    <>
      {entries.map((entry) =>
        entry.isDir ? (
          <PickerFolder
            key={entry.path}
            entry={entry}
            depth={depth}
            kind={kind}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onConfirm={onConfirm}
          />
        ) : (
          <button
            key={entry.path}
            type="button"
            className={`tree-row${selectedPath === entry.path ? ' active' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            title={entry.path}
            onClick={() => onSelect(entry)}
            onDoubleClick={() => onConfirm(entry)}
            onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              onConfirm(entry)
            }}
          >
            <span className="tree-chevron-spacer" />
            <FileIcon className="tree-icon" />
            <span className="tree-label">{entry.name}</span>
          </button>
        )
      )}
    </>
  )
}

function PickerFolder({
  entry,
  depth,
  ...rest
}: TreeProps & { entry: FsEntry; depth: number }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="tree-group">
      <button
        type="button"
        className="tree-row"
        style={{ paddingLeft: 8 + depth * 14 }}
        title={entry.path}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronIcon open={open} className="tree-chevron" />
        <FolderOpenIcon className="tree-icon" />
        <span className="tree-label">{entry.name}</span>
      </button>
      {open ? <PickerChildren dir={entry.path} depth={depth + 1} {...rest} /> : null}
    </div>
  )
}

export function InsertAssetDialog({
  open,
  kind,
  docPath,
  busy,
  onInsert,
  onImportOther,
  onCancel
}: Props): JSX.Element | null {
  const docDir = dirOf(docPath)
  const [selected, setSelected] = useState<FsEntry | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setSelected(null)
    const timer = window.setTimeout(() => treeRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [open, kind, docPath])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onCancel])

  if (!open) return null

  const title = kind === 'drawing' ? '插入 Excalidraw 画板' : '插入图片'
  const confirm = (): void => {
    if (selected) onInsert(selected.path)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal asset-picker"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="confirm-title">{title}</h2>
        <p className="asset-doc" title={docDir}>
          位置：{docDir}
        </p>
        <div className="asset-tree" ref={treeRef} tabIndex={-1}>
          <div className="asset-tree-root" title={docDir}>
            <FolderOpenIcon className="tree-icon" />
            <span className="tree-label">{baseOf(docDir)}</span>
          </div>
          <PickerChildren
            dir={docDir}
            depth={0}
            kind={kind}
            selectedPath={selected?.path ?? null}
            onSelect={setSelected}
            onConfirm={(entry) => onInsert(entry.path)}
          />
        </div>
        <div className="confirm-actions asset-actions">
          <button type="button" className="btn plain asset-import" disabled={busy} onClick={onImportOther}>
            从其他位置导入…
          </button>
          <span className="asset-selected" title={selected?.path ?? ''}>
            {selected ? relativeOf(docDir, selected.path) : '未选择文件'}
          </span>
          <div className="asset-actions-right">
            <button type="button" className="btn" disabled={busy} onClick={onCancel}>
              取消
            </button>
            <button type="button" className="btn primary" disabled={!selected || busy} onClick={confirm}>
              {busy ? '插入中…' : '插入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
