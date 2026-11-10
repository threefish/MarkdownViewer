import { promises as fs, type Dirent, type Stats } from 'node:fs'
import path from 'node:path'
import type { FsEntry, SearchFileResult, SearchResult } from '../shared/types'
import { isImageFile, isPdfFile, isTextFile } from '../shared/fileKinds'

const IGNORED = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'out',
  'build',
  'release',
  '.next',
  '.cache',
  'target',
  'vendor'
])
const MAX_DEPTH = 12
const MAX_FILES = 4000
const MAX_NAME_MATCHES = 60
const MAX_FILE_RESULTS = 60
const MAX_HITS_PER_FILE = 3
const MAX_CONTENT_BYTES = 1_500_000
const SNIPPET_RADIUS = 36

const collator = new Intl.Collator('zh-Hans', { numeric: true, sensitivity: 'base' })

function snippet(line: string, at: number, needleLength: number): string {
  const trimmed = line.trim()
  if (trimmed.length <= 120) return trimmed
  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(line.length, at + needleLength + SNIPPET_RADIUS)
  return `${start > 0 ? '…' : ''}${line.slice(start, end).trim()}${end < line.length ? '…' : ''}`
}

export async function searchTree(rawRoot: string, rawQuery: string): Promise<SearchResult> {
  const root = await fs.realpath(rawRoot)
  const query = rawQuery.trim()
  const empty: SearchResult = { nameMatches: [], contentMatches: [], truncated: false }
  if (!query) return empty

  const needle = query.toLowerCase()
  const nameMatches: FsEntry[] = []
  const contentMatches: SearchFileResult[] = []
  let scanned = 0
  let truncated = false

  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]

  while (stack.length) {
    if (truncated) break
    const { dir, depth } = stack.pop()!
    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (truncated) break
      if (entry.isSymbolicLink()) continue
      const full = path.join(dir, entry.name)
      const rel = path.relative(root, full)

      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || IGNORED.has(entry.name.toLowerCase())) continue
        if (depth < MAX_DEPTH) stack.push({ dir: full, depth: depth + 1 })
        continue
      }

      const plainText = isTextFile(entry.name)
      const binary = isPdfFile(entry.name) || isImageFile(entry.name)
      if (!entry.isFile() || (!plainText && !binary)) continue
      if (++scanned > MAX_FILES) {
        truncated = true
        break
      }

      if (entry.name.toLowerCase().includes(needle) && nameMatches.length < MAX_NAME_MATCHES) {
        nameMatches.push({ name: entry.name, path: full, isDir: false })
      }

      // PDF / 图片是二进制，只参与文件名匹配，不做正文内容检索。
      if (!plainText) continue
      if (contentMatches.length >= MAX_FILE_RESULTS) continue

      let stat: Stats
      try {
        stat = await fs.stat(full)
      } catch {
        continue
      }
      if (stat.size > MAX_CONTENT_BYTES) continue

      let text: string
      try {
        text = await fs.readFile(full, 'utf8')
      } catch {
        continue
      }

      const hits: SearchFileResult['hits'] = []
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length && hits.length < MAX_HITS_PER_FILE; i++) {
        const lower = lines[i].toLowerCase()
        const at = lower.indexOf(needle)
        if (at < 0) continue
        hits.push({ line: i + 1, text: snippet(lines[i], at, query.length) })
      }
      if (hits.length) {
        contentMatches.push({ path: full, name: entry.name, rel, hits })
      }
    }
  }

  nameMatches.sort((a, b) =>
    a.isDir === b.isDir ? collator.compare(a.path, b.path) : a.isDir ? -1 : 1
  )
  contentMatches.sort((a, b) => collator.compare(a.rel, b.rel))

  return { nameMatches, contentMatches, truncated }
}
