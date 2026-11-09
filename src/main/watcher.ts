import { watch, type FSWatcher } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

interface Handlers {
  changed: (file: string, mtimeMs: number) => void
  deleted: (file: string) => void
}

interface Entry {
  file: string
  handlers: Handlers
  watcher: FSWatcher | null
  timer: NodeJS.Timeout | null
  retries: number
  lastMtime: number
}

const entries = new Map<string, Entry>()

function key(file: string): string {
  return path.resolve(file).toLowerCase()
}

function closeEntry(entry: Entry): void {
  if (entry.timer) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
  if (entry.watcher) {
    try {
      entry.watcher.close()
    } catch {
      // ignore
    }
    entry.watcher = null
  }
}

function attach(entry: Entry): void {
  try {
    const base = path.basename(entry.file).toLowerCase()
    entry.watcher = watch(path.dirname(entry.file), { persistent: false }, (_event, filename) => {
      if (filename && filename.toString().toLowerCase() !== base) return
      schedule(entry)
    })
  } catch (err) {
    console.error('[watcher] failed', err)
  }
}

function schedule(entry: Entry): void {
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    void check(entry)
  }, 160)
}

async function check(entry: Entry): Promise<void> {
  if (entries.get(key(entry.file)) !== entry) return
  try {
    const stat = await fs.stat(entry.file)
    entry.retries = 0
    if (stat.mtimeMs !== entry.lastMtime) {
      entry.lastMtime = stat.mtimeMs
      entry.handlers.changed(entry.file, stat.mtimeMs)
    }
  } catch {
    entry.retries += 1
    if (entry.retries >= 3) {
      entry.retries = 0
      entry.handlers.deleted(entry.file)
    } else {
      entry.timer = setTimeout(() => {
        void check(entry)
      }, 120)
    }
  }
}

export function watchDocument(file: string, next: Handlers): void {
  const id = key(file)
  const existing = entries.get(id)
  if (existing) {
    existing.handlers = next
    return
  }
  const entry: Entry = {
    file,
    handlers: next,
    watcher: null,
    timer: null,
    retries: 0,
    lastMtime: -1
  }
  entries.set(id, entry)
  attach(entry)
}

function affected(oldPath: string): Entry[] {
  const fromKey = path.resolve(oldPath).replace(/\\+$/, '').toLowerCase()
  const prefix = `${fromKey}${path.sep.toLowerCase()}`
  const list: Entry[] = []
  for (const entry of [...entries.values()]) {
    const lower = path.resolve(entry.file).toLowerCase()
    if (lower === fromKey || lower.startsWith(prefix)) list.push(entry)
  }
  return list
}

/** Windows 不允许重命名仍被 fs.watch 占用的目录或其上级目录，改名前先释放句柄。 */
export function pauseWatched(target: string): void {
  for (const entry of affected(target)) closeEntry(entry)
}

export function resumeWatched(target: string): void {
  for (const entry of affected(target)) if (!entry.watcher) attach(entry)
}

/** 重命名后将旧路径（或其目录内）的监听迁移到新路径，避免误报「文件已删除」。 */
export function renameWatched(oldPath: string, newPath: string): void {
  const from = path.resolve(oldPath).replace(/\\+$/, '')
  for (const entry of affected(oldPath)) {
    const current = path.resolve(entry.file)
    const target =
      current.toLowerCase() === from.toLowerCase()
        ? newPath
        : path.join(newPath, current.slice(from.length + 1))
    closeEntry(entry)
    entries.delete(key(entry.file))
    entry.file = target
    if (entries.has(key(target))) continue
    entries.set(key(target), entry)
    attach(entry)
  }
}

export function unwatchDocument(file: string): void {
  const id = key(file)
  const entry = entries.get(id)
  if (!entry) return
  closeEntry(entry)
  entries.delete(id)
}

export function unwatchAll(): void {
  for (const entry of entries.values()) closeEntry(entry)
  entries.clear()
}
