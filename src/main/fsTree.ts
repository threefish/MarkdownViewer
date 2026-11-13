import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { FsEntry } from '../shared/types'
import { isImageFile, isPdfFile, isTextFile, isXmindFile } from '../shared/fileKinds'

const NOISE_DIRS = new Set(['node_modules'])
const collator = new Intl.Collator('zh-Hans', { numeric: true, sensitivity: 'base' })

export async function listDirectory(dir: string, hideNoisy = true): Promise<FsEntry[]> {
  if (!path.isAbsolute(dir)) throw new Error('需要绝对路径')
  const real = await fs.realpath(dir)
  const entries = await fs.readdir(real, { withFileTypes: true })
  const items: FsEntry[] = []
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    if (hideNoisy && (entry.name.startsWith('.') || NOISE_DIRS.has(entry.name.toLowerCase()))) {
      continue
    }
    if (entry.isDirectory()) {
      items.push({ name: entry.name, path: path.join(real, entry.name), isDir: true })
    } else if (
      entry.isFile() &&
      (isTextFile(entry.name) ||
        isPdfFile(entry.name) ||
        isImageFile(entry.name) ||
        isXmindFile(entry.name))
    ) {
      items.push({ name: entry.name, path: path.join(real, entry.name), isDir: false })
    }
  }
  items.sort((a, b) =>
    a.isDir === b.isDir ? collator.compare(a.name, b.name) : a.isDir ? -1 : 1
  )
  return items
}
