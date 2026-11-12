import {
  app,
  clipboard,
  dialog,
  ipcMain,
  shell,
  type BrowserWindow,
  type OpenDialogOptions
} from 'electron'
import { constants as fsConstants, promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  AssocInfo,
  CopyEntryResult,
  CreateEntryResult,
  DocPayload,
  FsEntry,
  ImageMeta,
  PathStat,
  PdfExportResult,
  PdfMeta,
  RenameEntryResult,
  RestoreResult,
  SavePastedImageResult,
  SearchResult,
  SettingsBundle,
  TrashResult,
  WriteResult
} from '../shared/types'
import {
  imageFileExtensions,
  isExcalidrawFile,
  isImageFile,
  isPdfFile,
  isTextFile,
  textFileExtensions
} from '../shared/fileKinds'
import { themeBackground } from '../shared/themes'
import { listDirectory } from './fsTree'
import { searchTree } from './fsSearch'
import { getSettings, patchSettings, applyNativeTheme, resetPreferences, resolveThemeMode } from './settings'
import {
  unwatchDocument,
  watchDocument,
  pauseWatched,
  renameWatched,
  resumeWatched,
  watchDirectory,
  unwatchDirectory,
  pauseWatchedDirs,
  renameWatchedDirs,
  resumeWatchedDirs
} from './watcher'
import { closeMainWindow } from './window'
import { exportDocumentToPdf, takePrintPayload } from './pdf'
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

function exists(target: string): Promise<boolean> {
  return fs.lstat(target).then(
    () => true,
    () => false
  )
}

const PASTE_IMAGE_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp'
}
const PASTE_IMAGE_MAX = 20 * 1024 * 1024

function pasteImageStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

// 粘贴图片 / 插入资源统一落盘目录：文档目录 + 设置中的相对子目录（必须仍在文档目录内）。
function assetDirFor(docPath: string): { base: string; dir: string } | { error: string } {
  const base = path.dirname(docPath)
  const sub = getSettings().pastedImageDir
  const dir = sub ? path.join(base, sub) : base
  const relativeDir = path.relative(base, dir)
  if (relativeDir === '..' || relativeDir.startsWith(`..${path.sep}`) || path.isAbsolute(relativeDir)) {
    return { error: '保存目录无效' }
  }
  return { base, dir }
}

// 生成不冲突的目标名：原名 →「原名 - 副本.ext」→「原名 - 副本 (n).ext」，全程不覆盖已有文件。
async function uniqueChildName(dir: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName)
  const stem = ext ? fileName.slice(0, -ext.length) : fileName
  for (let index = 0; index <= 100; index++) {
    const candidate = index === 0 ? fileName : index === 1 ? `${stem} - 副本${ext}` : `${stem} - 副本 (${index})${ext}`
    const target = path.join(dir, candidate)
    if (!(await exists(target))) return target
  }
  throw new Error('同名文件过多，无法写入')
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
  ipcMain.handle('dialog:open', async (_event, mode: 'file' | 'folder' | 'image' | 'drawing') => {
    const win = getWin()
    const options: OpenDialogOptions =
      mode === 'folder'
        ? { properties: ['openDirectory'] }
        : mode === 'image'
          ? {
              properties: ['openFile'],
              filters: [
                { name: '图片', extensions: imageFileExtensions() },
                { name: '所有文件', extensions: ['*'] }
              ]
            }
          : mode === 'drawing'
            ? {
                properties: ['openFile'],
                filters: [
                  { name: 'Excalidraw 画板', extensions: ['excalidraw'] },
                  { name: '所有文件', extensions: ['*'] }
                ]
              }
            : {
                properties: ['openFile'],
                filters: [
                  { name: '文本 / 代码', extensions: textFileExtensions() },
                  { name: 'PDF 文档', extensions: ['pdf'] },
                  { name: '图片', extensions: imageFileExtensions() },
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
      changed: (file, mtimeMs) => send(getWin, 'doc:changed', { path: file, mtimeMs }),
      deleted: (file) => send(getWin, 'doc:deleted', { path: file })
    })
    return doc
  })

  ipcMain.handle('doc:unwatch', (_event, rawPath: string) => {
    if (typeof rawPath === 'string' && path.isAbsolute(rawPath)) unwatchDocument(rawPath)
  })

  // 嵌入预览只读取，不注册监听：watchDocument 按路径替换 handlers，会顶掉已打开标签页的监听。
  ipcMain.handle('scene:read', async (_event, rawPath: string): Promise<DocPayload> => {
    return readDocument(rawPath)
  })

  // PDF 是二进制，只取元信息并注册监听（外部修改/删除仍要通知渲染层），内容交给 pdf.js 经 mdv:// 读取。
  ipcMain.handle('pdf:meta', async (_event, rawPath: string): Promise<PdfMeta> => {
    const target = requireAbsPath(rawPath, '文档路径')
    if (!isPdfFile(target)) throw new Error('不是 PDF 文件')
    const real = await fs.realpath(target)
    const stat = await fs.stat(real)
    if (!stat.isFile()) throw new Error('目标不是文件')
    const meta: PdfMeta = {
      path: real,
      root: path.dirname(real),
      name: path.basename(real),
      mtimeMs: stat.mtimeMs
    }
    watchDocument(meta.path, {
      changed: (file, mtimeMs) => send(getWin, 'doc:changed', { path: file, mtimeMs }),
      deleted: (file) => send(getWin, 'doc:deleted', { path: file })
    })
    return meta
  })

  // 图片同样是二进制，只取元信息并注册监听，像素内容交给渲染层经 mdv:// 读取。
  ipcMain.handle('image:meta', async (_event, rawPath: string): Promise<ImageMeta> => {
    const target = requireAbsPath(rawPath, '图片路径')
    if (!isImageFile(target)) throw new Error('不是支持的图片文件')
    const real = await fs.realpath(target)
    const stat = await fs.stat(real)
    if (!stat.isFile()) throw new Error('目标不是文件')
    const meta: ImageMeta = {
      path: real,
      root: path.dirname(real),
      name: path.basename(real),
      mtimeMs: stat.mtimeMs
    }
    watchDocument(meta.path, {
      changed: (file, mtimeMs) => send(getWin, 'doc:changed', { path: file, mtimeMs }),
      deleted: (file) => send(getWin, 'doc:deleted', { path: file })
    })
    return meta
  })

  ipcMain.handle('print:payload', (event) => takePrintPayload(event.sender.id))

  ipcMain.handle(
    'doc:export-pdf',
    async (_event, raw: { path?: unknown; content?: unknown; baseDir?: unknown }): Promise<PdfExportResult> => {
      try {
        const docPath = requireAbsPath(raw?.path, '文档路径')
        const baseDir = requireAbsPath(raw?.baseDir, '目录路径')
        if (typeof raw?.content !== 'string') return { ok: false, message: '内容无效' }
        return await exportDocumentToPdf(getWin(), { path: docPath, content: raw.content, baseDir })
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  )

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

  // 粘贴图片落盘：目录取「文档目录 + 设置中的相对子目录」，wx 独占写入避免覆盖任何已有文件。
  ipcMain.handle('doc:save-pasted-image', async (_event, raw: {
    docPath?: unknown
    mimeType?: unknown
    data?: unknown
  }): Promise<SavePastedImageResult> => {
    try {
      const docPath = requireAbsPath(raw?.docPath, '文档路径')
      if (!isTextFile(docPath)) return { ok: false, message: '不是支持的文本文件' }
      const ext = typeof raw?.mimeType === 'string' ? PASTE_IMAGE_MIME[raw.mimeType] : undefined
      if (!ext) return { ok: false, message: '不支持的图片格式' }
      let data: Uint8Array
      if (raw?.data instanceof Uint8Array) data = raw.data
      else if (raw?.data instanceof ArrayBuffer) data = new Uint8Array(raw.data)
      else return { ok: false, message: '图片数据无效' }
      if (!data.byteLength) return { ok: false, message: '图片数据无效' }
      if (data.byteLength > PASTE_IMAGE_MAX) return { ok: false, message: '图片超过 20MB，未保存' }

      const resolved = assetDirFor(docPath)
      if ('error' in resolved) return { ok: false, message: resolved.error }
      const { base, dir } = resolved
      await fs.mkdir(dir, { recursive: true })

      const stem = `image-${pasteImageStamp(new Date())}`
      let target = ''
      let handle: Awaited<ReturnType<typeof fs.open>> | null = null
      for (let index = 1; index <= 100; index++) {
        const name = index === 1 ? `${stem}.${ext}` : `${stem}-${index}.${ext}`
        const candidate = path.join(dir, name)
        try {
          handle = await fs.open(candidate, 'wx')
          target = candidate
          break
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        }
      }
      if (!handle || !target) return { ok: false, message: '同名图片过多，未保存' }
      try {
        await handle.writeFile(data)
      } catch (err) {
        await handle.close().catch(() => {})
        await fs.unlink(target).catch(() => {})
        throw err
      }
      await handle.close()
      return {
        ok: true,
        relative: path.relative(base, target).replace(/\\/g, '/'),
        absolute: target
      }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // 从磁盘选入图片 / 画板：已在文档目录内直接引用相对路径，否则复制进资源目录后返回新相对路径。
  ipcMain.handle('doc:import-asset', async (_event, raw: {
    docPath?: unknown
    sourcePath?: unknown
  }): Promise<SavePastedImageResult> => {
    try {
      const docPath = requireAbsPath(raw?.docPath, '文档路径')
      if (!isTextFile(docPath)) return { ok: false, message: '不是支持的文本文件' }
      const sourcePath = requireAbsPath(raw?.sourcePath, '源文件路径')
      const realSrc = await fs.realpath(sourcePath)
      const stat = await fs.stat(realSrc)
      if (!stat.isFile()) return { ok: false, message: '源路径不是文件' }
      if (!isImageFile(realSrc) && !isExcalidrawFile(realSrc)) {
        return { ok: false, message: '仅支持图片或 Excalidraw 画板' }
      }
      if (stat.size > PASTE_IMAGE_MAX) return { ok: false, message: '文件超过 20MB，未插入' }

      const resolved = assetDirFor(docPath)
      if ('error' in resolved) return { ok: false, message: resolved.error }
      const { base, dir } = resolved

      const insideBase = path.relative(base, realSrc)
      if (insideBase !== '' && !insideBase.startsWith(`..${path.sep}`) && !path.isAbsolute(insideBase)) {
        return { ok: true, relative: insideBase.split(path.sep).join('/'), absolute: realSrc }
      }

      await fs.mkdir(dir, { recursive: true })
      const target = await uniqueChildName(dir, path.basename(realSrc))
      await fs.copyFile(realSrc, target, fsConstants.COPYFILE_EXCL)
      return {
        ok: true,
        relative: path.relative(base, target).split(path.sep).join('/'),
        absolute: target
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, message: '源文件不存在或已被移动' }
      if (code === 'ENOSPC') return { ok: false, message: '磁盘空间不足' }
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('fs:list', async (_event, dir: string): Promise<FsEntry[]> => {
    return listDirectory(requireAbsPath(dir, '目录路径'), getSettings().hideNoisyEntries)
  })

  ipcMain.handle('fs:watch-dir', (_event, dir: string) => {
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) return
    watchDirectory(dir, { changed: (changed) => send(getWin, 'fs:dir-changed', { dir: changed }) })
  })

  ipcMain.handle('fs:unwatch-dir', (_event, dir: string) => {
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) return
    unwatchDirectory(dir)
  })

  // 「保留文件」：文件被外部删除后，用标签页缓存内容把它重建到磁盘。
  // 写前先确认路径仍不存在，避免覆盖外部新写入的文件（数据安全优先）。
  ipcMain.handle('doc:restore', async (_event, raw: {
    path?: unknown
    content?: unknown
  }): Promise<RestoreResult> => {
    try {
      const target = requireAbsPath(raw?.path, '文档路径')
      if (!isTextFile(target)) return { ok: false, reason: 'error', message: '不是支持的文本文件' }
      if (typeof raw.content !== 'string') return { ok: false, reason: 'error', message: '内容无效' }
      if (Buffer.byteLength(raw.content, 'utf8') > 30 * 1024 * 1024) {
        return { ok: false, reason: 'error', message: '内容超过 30MB，已取消' }
      }
      try {
        await fs.lstat(target)
        return { ok: false, reason: 'exists', message: '该路径已存在文件，未做覆盖' }
      } catch {
        // 不存在才继续重建
      }
      const tmp = `${target}.mdv-restore-${process.pid}.tmp`
      try {
        await fs.writeFile(tmp, raw.content, 'utf8')
        await fs.rename(tmp, target)
      } catch (err) {
        await fs.unlink(tmp).catch(() => {})
        throw err
      }
      const next = await fs.stat(target)
      return { ok: true, mtimeMs: next.mtimeMs }
    } catch (err) {
      return {
        ok: false,
        reason: 'error',
        message: err instanceof Error ? err.message : String(err)
      }
    }
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
        kind === 'file' && !name.includes('.') && !isTextFile(name)
          ? `${name}.${getSettings().newFileExt}`
          : name
      const target = path.join(dir, finalName)
      if (kind === 'dir') {
        await fs.mkdir(target)
      } else {
        const handle = await fs.open(target, 'wx')
        try {
          if (isExcalidrawFile(target)) {
            const scene = {
              type: 'excalidraw',
              version: 2,
              source: 'md-viewer',
              elements: [],
              appState: { viewBackgroundColor: '#ffffff' },
              files: {}
            }
            await handle.writeFile(JSON.stringify(scene, null, 2), 'utf8')
          }
        } finally {
          await handle.close()
        }
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

  ipcMain.handle('fs:rename', async (_event, raw: {
    path?: unknown
    name?: unknown
  }): Promise<RenameEntryResult> => {
    try {
      const source = requireAbsPath(raw?.path, '路径')
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
      const real = await fs.realpath(source)
      const stat = await fs.stat(real)
      const finalName =
        !stat.isDirectory() && !name.includes('.') && !isTextFile(name)
          ? `${name}${path.extname(real)}`
          : name
      const target = path.join(path.dirname(real), finalName)
      const samePath = target.toLowerCase() === real.toLowerCase()
      if (samePath && target === real) return { ok: true, path: real }
      if (!samePath && (await exists(target))) {
        return { ok: false, message: '同名文件或文件夹已存在' }
      }
      pauseWatched(real)
      pauseWatchedDirs(real)
      let renamed = false
      try {
        await fs.rename(real, target)
        renamed = true
      } finally {
        if (!renamed) {
          resumeWatched(real)
          resumeWatchedDirs(real)
        }
      }
      const next = await fs.realpath(target)
      renameWatched(real, next)
      renameWatchedDirs(real, next)
      return { ok: true, path: next }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, message: '文件或文件夹不存在' }
      if (code === 'ENOTEMPTY') return { ok: false, message: '目标位置已有同名文件夹' }
      if (code === 'EACCES' || code === 'EPERM') return { ok: false, message: '没有重命名权限，项目可能正被占用' }
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
      pauseWatched(target)
      pauseWatchedDirs(target)
      try {
        await shell.trashItem(target)
      } catch (err) {
        resumeWatched(target)
        resumeWatchedDirs(target)
        throw err
      }
      return { ok: true }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, message: '文件或文件夹不存在' }
      if (code === 'EACCES' || code === 'EPERM') return { ok: false, message: '没有删除权限' }
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // 文件树「复制 → 粘贴」：在目标目录生成副本，同名按「- 副本」自增，绝不覆盖已有文件。
  ipcMain.handle('fs:copy', async (_event, raw: {
    source?: unknown
    targetDir?: unknown
  }): Promise<CopyEntryResult> => {
    try {
      const source = requireAbsPath(raw?.source, '源路径')
      const targetDir = requireAbsPath(raw?.targetDir, '目标文件夹')
      const dirStat = await fs.stat(targetDir)
      if (!dirStat.isDirectory()) return { ok: false, message: '目标不是文件夹' }
      const real = await fs.realpath(source)
      const stat = await fs.stat(real)
      if (!stat.isFile() && !stat.isDirectory()) return { ok: false, message: '不支持复制此类型的项目' }
      if (stat.isDirectory()) {
        const rel = path.relative(real, targetDir)
        if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
          return { ok: false, message: '不能把文件夹复制到它自己内部' }
        }
      }
      const target = await uniqueChildName(targetDir, path.basename(real))
      await fs.cp(real, target, {
        recursive: stat.isDirectory(),
        force: false,
        errorOnExist: true,
        preserveTimestamps: true
      })
      return { ok: true, path: target }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, message: '源文件或目标文件夹不存在' }
      if (code === 'EACCES' || code === 'EPERM') return { ok: false, message: '没有复制权限' }
      if (code === 'ENOSPC') return { ok: false, message: '磁盘空间不足' }
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('clipboard:write-text', (_event, text: unknown): boolean => {
    if (typeof text !== 'string' || !text) return false
    clipboard.writeText(text)
    return true
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
      return { kind: 'none', isText: false, isPdf: false, isImage: false }
    }
    try {
      const stat = await fs.stat(real)
      if (stat.isDirectory()) return { kind: 'dir', isText: false, isPdf: false, isImage: false }
      return {
        kind: 'file',
        isText: isTextFile(real),
        isPdf: isPdfFile(real),
        isImage: isImageFile(real)
      }
    } catch {
      return { kind: 'none', isText: false, isPdf: false, isImage: false }
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
