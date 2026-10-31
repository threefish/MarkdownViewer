import { watch, type FSWatcher } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

interface Handlers {
  changed: (mtimeMs: number) => void
  deleted: () => void
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
      entry.handlers.changed(stat.mtimeMs)
    }
  } catch {
    entry.retries += 1
    if (entry.retries >= 3) {
      entry.retries = 0
      entry.handlers.deleted()
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
  try {
    const base = path.basename(file).toLowerCase()
    entry.watcher = watch(path.dirname(file), { persistent: false }, (_event, filename) => {
      if (filename && filename.toString().toLowerCase() !== base) return
      schedule(entry)
    })
  } catch (err) {
    console.error('[watcher] failed', err)
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
