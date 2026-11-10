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

// ---------- 目录级监听：文件树中展开的目录，增删/重命名时就地刷新 ----------

interface DirHandlers {
  changed: (dir: string) => void
}

interface DirWatch {
  dir: string
  handlers: DirHandlers
  watcher: FSWatcher | null
  timer: NodeJS.Timeout | null
  refs: number
}

const dirWatches = new Map<string, DirWatch>()

function dirKey(dir: string): string {
  return path.resolve(dir).replace(/\\+$/, '').toLowerCase()
}

function closeDirWatch(watch: DirWatch): void {
  if (watch.timer) {
    clearTimeout(watch.timer)
    watch.timer = null
  }
  if (watch.watcher) {
    try {
      watch.watcher.close()
    } catch {
      // ignore
    }
    watch.watcher = null
  }
}

function attachDir(record: DirWatch): void {
  try {
    // 只关心 rename（新增/删除/改名）；内容写入是 change，不触发刷新。
    record.watcher = watch(record.dir, { persistent: false }, (eventType) => {
      if (eventType !== 'rename') return
      scheduleDir(record)
    })
  } catch (err) {
    console.error('[watcher] dir failed', err)
  }
}

function scheduleDir(watch: DirWatch): void {
  if (watch.timer) clearTimeout(watch.timer)
  watch.timer = setTimeout(() => {
    watch.timer = null
    watch.handlers.changed(watch.dir)
  }, 200)
}

export function watchDirectory(dir: string, handlers: DirHandlers): void {
  const id = dirKey(dir)
  const existing = dirWatches.get(id)
  if (existing) {
    existing.refs += 1
    existing.handlers = handlers
    if (!existing.watcher) attachDir(existing)
    return
  }
  const entry: DirWatch = { dir, handlers, watcher: null, timer: null, refs: 1 }
  dirWatches.set(id, entry)
  attachDir(entry)
}

export function unwatchDirectory(dir: string): void {
  const id = dirKey(dir)
  const entry = dirWatches.get(id)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs > 0) return
  closeDirWatch(entry)
  dirWatches.delete(id)
}

function affectedDirs(target: string): DirWatch[] {
  const fromKey = dirKey(target)
  const prefix = `${fromKey}${path.sep.toLowerCase()}`
  const list: DirWatch[] = []
  for (const entry of dirWatches.values()) {
    const lower = dirKey(entry.dir)
    if (lower === fromKey || lower.startsWith(prefix)) list.push(entry)
  }
  return list
}

/** 重命名/删除目录前释放其（含子目录）句柄，Windows 才会允许操作。 */
export function pauseWatchedDirs(target: string): void {
  for (const entry of affectedDirs(target)) closeDirWatch(entry)
}

export function resumeWatchedDirs(target: string): void {
  for (const entry of affectedDirs(target)) if (!entry.watcher) attachDir(entry)
}

/** 重命名目录后把监听迁移到新路径，避免误报或丢失刷新。 */
export function renameWatchedDirs(oldPath: string, newPath: string): void {
  const from = path.resolve(oldPath).replace(/\\+$/, '')
  for (const entry of affectedDirs(oldPath)) {
    const current = path.resolve(entry.dir)
    const target =
      current.toLowerCase() === from.toLowerCase()
        ? newPath
        : path.join(newPath, current.slice(from.length + 1))
    closeDirWatch(entry)
    dirWatches.delete(dirKey(entry.dir))
    entry.dir = target
    if (dirWatches.has(dirKey(target))) continue
    dirWatches.set(dirKey(target), entry)
    attachDir(entry)
  }
}

export function unwatchAllDirs(): void {
  for (const entry of dirWatches.values()) closeDirWatch(entry)
  dirWatches.clear()
}
