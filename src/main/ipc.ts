import {
  app,
  dialog,
  ipcMain,
  shell,
  type BrowserWindow,
  type OpenDialogOptions
} from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  AssocInfo,
  CreateEntryResult,
  DocPayload,
  FsEntry,
  PathStat,
  SearchResult,
  SettingsBundle,
  TrashResult,
  WriteResult
} from '../shared/types'
import { isTextFile, textFileExtensions } from '../shared/fileKinds'
import { themeBackground } from '../shared/themes'
import { listDirectory } from './fsTree'
import { searchTree } from './fsSearch'
import { getSettings, patchSettings, applyNativeTheme, resetPreferences, resolveThemeMode } from './settings'
import { unwatchDocument, watchDocument } from './watcher'
import { closeMainWindow } from './window'
import { getAssocInfo, registerAssociation, unregisterAssociation } from './registry'

type WindowGetter = () => BrowserWindow | null

let pendingFile: string | null = null

export function setPendingFile(file: string | null): void {
  pendingFile = file
}

function requireAbsPath(value: unknown, what = '路径'): string {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error(`无效的${what}`)
  }
  return value
}

function send(getWin: WindowGetter, channel: string, payload: unknown): void {
  const win = getWin()
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

async function readDocument(rawPath: string): Promise<DocPayload> {
  const target = requireAbsPath(rawPath, '文档路径')
  if (!isTextFile(target)) throw new Error('不是支持的文本文件')
  const real = await fs.realpath(target)
  const stat = await fs.stat(real)
  if (!stat.isFile()) throw new Error('目标不是文件')
  if (stat.size > 30 * 1024 * 1024) throw new Error('文件超过 30MB，暂不支持预览')
  const buf = await fs.readFile(real)
  if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) {
    throw new Error('该文件为 UTF-16 编码，暂不支持打开')
  }
  const content = buf.toString('utf8')
  if (content.includes('\u0000')) throw new Error('该文件看起来是二进制内容，暂不支持预览')
  return {
    path: real,
    root: path.dirname(real),
    name: path.basename(real),
    content: content.replace(/^\uFEFF/, ''),
    mtimeMs: stat.mtimeMs
  }
}

export function registerIpc(getWin: WindowGetter): void {
  ipcMain.handle('dialog:open', async (_event, mode: 'file' | 'folder') => {
    const win = getWin()
    const options: OpenDialogOptions =
      mode === 'folder'
        ? { properties: ['openDirectory'] }
        : {
            properties: ['openFile'],
            filters: [
              { name: '文本 / 代码', extensions: textFileExtensions() },
              { name: '所有文件', extensions: ['*'] }
            ]
          }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('doc:read', async (_event, rawPath: string): Promise<DocPayload> => {
    const doc = await readDocument(rawPath)
    watchDocument(doc.path, {
      changed: (mtimeMs) => send(getWin, 'doc:changed', { path: doc.path, mtimeMs }),
      deleted: () => send(getWin, 'doc:deleted', { path: doc.path })
    })
    return doc
  })

  ipcMain.handle('doc:unwatch', (_event, rawPath: string) => {
    if (typeof rawPath === 'string' && path.isAbsolute(rawPath)) unwatchDocument(rawPath)
  })

  ipcMain.handle('doc:write', async (_event, raw: {
    path?: unknown
    content?: unknown
    baseMtimeMs?: unknown
    force?: unknown
  }): Promise<WriteResult> => {
    try {
      const target = requireAbsPath(raw?.path, '文档路径')
      if (!isTextFile(target)) {
        return { ok: false, reason: 'error', message: '不是支持的文本文件' }
      }
      if (typeof raw.content !== 'string') {
        return { ok: false, reason: 'error', message: '内容无效' }
      }
      if (Buffer.byteLength(raw.content, 'utf8') > 30 * 1024 * 1024) {
        return { ok: false, reason: 'error', message: '内容超过 30MB，已取消保存' }
      }
      let real = target
      let stat: Awaited<ReturnType<typeof fs.stat>> | null = null
      try {
        real = await fs.realpath(target)
        stat = await fs.stat(real)
      } catch {
        stat = null
      }
      if (
        stat &&
        raw.force !== true &&
        typeof raw.baseMtimeMs === 'number' &&
        Math.abs(stat.mtimeMs - raw.baseMtimeMs) > 1
      ) {
        const disk = await fs.readFile(real, 'utf8')
        return {
          ok: false,
          reason: 'conflict',
          diskContent: disk,
          diskMtimeMs: stat.mtimeMs
        }
      }
      const tmp = `${real}.mdv-${process.pid}.tmp`
      try {
        await fs.writeFile(tmp, raw.content, 'utf8')
        await fs.rename(tmp, real)
      } catch (err) {
        await fs.unlink(tmp).catch(() => {})
        throw err
      }
      const next = await fs.stat(real)
      return { ok: true, mtimeMs: next.mtimeMs }
    } catch (err) {
      return {
        ok: false,
        reason: 'error',
        message: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle('fs:list', async (_event, dir: string): Promise<FsEntry[]> => {
    return listDirectory(requireAbsPath(dir, '目录路径'), getSettings().hideNoisyEntries)
  })

  ipcMain.handle('fs:search', async (_event, rawRoot: string, query: string): Promise<SearchResult> => {
    const root = requireAbsPath(rawRoot, '搜索目录')
    return searchTree(root, typeof query === 'string' ? query.slice(0, 200) : '')
  })

  ipcMain.handle('fs:create', async (_event, raw: {
    dir?: unknown
    name?: unknown
    kind?: unknown
  }): Promise<CreateEntryResult> => {
    try {
      const dir = requireAbsPath(raw?.dir, '目录路径')
      const kind = raw?.kind === 'dir' ? 'dir' : 'file'
      const name = typeof raw?.name === 'string' ? raw.name.trim() : ''
      if (!name) return { ok: false, message: '请输入名称' }
      if (name.length > 120) return { ok: false, message: '名称过长' }
      if (/[\\/:*?"<>|]/.test(name) || name === '.' || name === '..') {
        return { ok: false, message: '名称不能包含 \\ / : * ? " < > |' }
      }
      if (/[.\s]$/.test(name)) return { ok: false, message: '名称不能以点或空格结尾' }
      if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) {
        return { ok: false, message: '该名称是系统保留名称' }
      }
      const stat = await fs.stat(dir)
      if (!stat.isDirectory()) return { ok: false, message: '目标不是文件夹' }
      const finalName =
        kind === 'file' && !name.includes('.') && !isTextFile(name) ? `${name}.md` : name
      const target = path.join(dir, finalName)
      if (kind === 'dir') {
        await fs.mkdir(target)
      } else {
        const handle = await fs.open(target, 'wx')
        await handle.close()
      }
      return { ok: true, path: target }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EEXIST') return { ok: false, message: '同名文件或文件夹已存在' }
      if (code === 'ENOENT') return { ok: false, message: '目标文件夹不存在' }
      if (code === 'EACCES' || code === 'EPERM') return { ok: false, message: '没有写入权限' }
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('fs:trash', async (_event, rawPath: string): Promise<TrashResult> => {
    try {
      const target = requireAbsPath(rawPath, '路径')
      const stat = await fs.lstat(target)
      if (!stat.isDirectory() && !stat.isFile()) {
        return { ok: false, message: '不支持删除此类型的项目' }
      }
      await shell.trashItem(target)
      return { ok: true }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, message: '文件或文件夹不存在' }
      if (code === 'EACCES' || code === 'EPERM') return { ok: false, message: '没有删除权限' }
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('fs:reveal', async (_event, rawPath: string) => {
    const target = requireAbsPath(rawPath, '路径')
    await fs.access(target)
    shell.showItemInFolder(target)
  })

  ipcMain.handle('path:stat', async (_event, rawPath: string): Promise<PathStat> => {
    let real: string
    try {
      real = await fs.realpath(requireAbsPath(rawPath))
    } catch {
      return { kind: 'none', isText: false }
    }
    try {
      const stat = await fs.stat(real)
      if (stat.isDirectory()) return { kind: 'dir', isText: false }
      return { kind: 'file', isText: isTextFile(real) }
    } catch {
      return { kind: 'none', isText: false }
    }
  })

  ipcMain.handle('settings:get', (): SettingsBundle => {
    const settings = getSettings()
    return { settings, theme: resolveThemeMode(settings.themeMode) }
  })

  ipcMain.handle('settings:patch', (_event, patch: Record<string, unknown>): SettingsBundle => {
    const input: Record<string, unknown> = { ...(patch ?? {}) }
    const win = getWin()
    if (input.rememberWindowBounds === false) {
      input.windowBounds = null
      input.windowMaximized = false
    } else if (input.rememberWindowBounds === true && win && !win.isMinimized()) {
      input.windowBounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()
      input.windowMaximized = win.isMaximized()
    }
    const next = patchSettings(input as never)
    if (patch && typeof patch.themeMode === 'string') {
      applyNativeTheme(next.themeMode)
      getWin()?.setBackgroundColor(themeBackground(resolveThemeMode(next.themeMode)))
    }
    return { settings: next, theme: resolveThemeMode(next.themeMode) }
  })

  ipcMain.handle('settings:reset', (): SettingsBundle => {
    const next = resetPreferences()
    applyNativeTheme(next.themeMode)
    getWin()?.setBackgroundColor(themeBackground(resolveThemeMode(next.themeMode)))
    return { settings: next, theme: resolveThemeMode(next.themeMode) }
  })

  ipcMain.on('edit:action', (_event, action: unknown) => {
    const wc = getWin()?.webContents
    if (!wc) return
    if (action === 'cut') wc.cut()
    else if (action === 'copy') wc.copy()
    else if (action === 'paste') wc.paste()
  })

  ipcMain.on('app:close-confirm', () => {
    closeMainWindow()
  })

  ipcMain.on('window:minimize', () => {
    const win = getWin()
    if (win && !win.isDestroyed()) win.minimize()
  })

  ipcMain.on('window:toggle-maximize', () => {
    const win = getWin()
    if (!win || win.isDestroyed()) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on('window:close', () => {
    const win = getWin()
    if (win && !win.isDestroyed()) win.close()
  })

  ipcMain.handle('window:is-maximized', () => {
    const win = getWin()
    return !!win && !win.isDestroyed() && win.isMaximized()
  })

  ipcMain.handle('app:pending-file', (): string | null => {
    const file = pendingFile
    pendingFile = null
    return file
  })

  ipcMain.handle('assoc:status', (): Promise<AssocInfo> => getAssocInfo())
  ipcMain.handle('assoc:register', (): Promise<AssocInfo> => registerAssociation())
  ipcMain.handle('assoc:unregister', (): Promise<AssocInfo> => unregisterAssociation())
  ipcMain.handle('assoc:open-defaults', async () => {
    try {
      await shell.openExternal('ms-settings:defaultapps?registeredAppUser=md-viewer')
    } catch {
      await shell.openExternal('ms-settings:defaultapps').catch(() => {})
    }
  })

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (typeof url !== 'string' || !/^(https?|mailto):/i.test(url)) return
    await shell.openExternal(url)
  })

  ipcMain.handle('shell:open-path', async (_event, rawPath: string) => {
    const target = requireAbsPath(rawPath)
    const stat = await fs.stat(target).catch(() => null)
    if (!stat) throw new Error('目标不存在')
    const message = await shell.openPath(target)
    if (message) throw new Error(message)
  })

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    exePath: process.execPath,
    isPackaged: app.isPackaged
  }))

  ipcMain.on('fs:paths-dropped', (_event, paths: unknown) => {
    if (!Array.isArray(paths)) return
    const valid = paths.filter((p): p is string => typeof p === 'string' && path.isAbsolute(p))
    if (valid.length) send(getWin, 'fs:paths-dropped', valid)
  })
}
