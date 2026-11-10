import { BrowserWindow, dialog, type SaveDialogOptions } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PdfExportResult, PrintPayload } from '../shared/types'
import { themeBackground } from '../shared/themes'
import { getSettings, resolveThemeMode } from './settings'

const LOAD_TIMEOUT = 30_000
const SETTLE_TIMEOUT = 90_000
const SETTLE_POLL = 200
const SETTLE_STABILIZE = 300

const pending = new Map<number, PrintPayload>()

export function takePrintPayload(id: number): PrintPayload | null {
  const payload = pending.get(id)
  pending.delete(id)
  return payload ?? null
}

// 等待隐藏打印页里所有懒渲染块（Mermaid/Excalidraw）、图片与字体就绪。
// 必须要求 .markdown-body 已挂载，否则空 DOM 会让条件 vacuously true 而导出空白 PDF。
const SETTLE_JS = `(async () => {
  if (!document.querySelector('.markdown-body')) return false
  if (document.querySelectorAll('.mermaid-placeholder').length) return false
  const scenePending = Array.from(document.querySelectorAll('.excalidraw-embed-note'))
    .some((n) => (n.textContent || '').includes('正在渲染'))
  if (scenePending) return false
  if (Array.from(document.images).some((img) => !img.complete)) return false
  await document.fonts.ready
  return true
})()`

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitSettled(win: BrowserWindow): Promise<boolean> {
  const wc = win.webContents
  const start = Date.now()
  while (Date.now() - start < SETTLE_TIMEOUT) {
    if (win.isDestroyed() || wc.isDestroyed()) return false
    let ready = false
    try {
      ready = (await wc.executeJavaScript(SETTLE_JS, true)) === true
    } catch {
      ready = false
    }
    if (ready) {
      await sleep(SETTLE_STABILIZE)
      if (win.isDestroyed() || wc.isDestroyed()) return false
      try {
        return (await wc.executeJavaScript(SETTLE_JS, true)) === true
      } catch {
        return false
      }
    }
    await sleep(SETTLE_POLL)
  }
  return false
}

function loadPrintWindow(win: BrowserWindow): Promise<void> {
  const wc = win.webContents
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('打印窗口加载超时')), LOAD_TIMEOUT)
    wc.once('did-finish-load', () => {
      clearTimeout(timer)
      resolve()
    })
    wc.once('did-fail-load', (_event, _code, desc) => {
      clearTimeout(timer)
      reject(new Error(desc || '打印窗口加载失败'))
    })
    if (process.env['ELECTRON_RENDERER_URL']) {
      const url = new URL(process.env['ELECTRON_RENDERER_URL'])
      url.searchParams.set('mode', 'print')
      void win.loadURL(url.toString())
    } else {
      void win.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { mode: 'print' } })
    }
  })
}

export async function exportDocumentToPdf(
  parent: BrowserWindow | null,
  input: { path: string; content: string; baseDir: string }
): Promise<PdfExportResult> {
  const theme = resolveThemeMode(getSettings().themeMode)
  const defaultName = path.basename(input.path, path.extname(input.path)) + '.pdf'
  const options: SaveDialogOptions = {
    title: '导出 PDF',
    buttonLabel: '导出',
    defaultPath: path.join(input.baseDir, defaultName),
    filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    properties: ['showOverwriteConfirmation', 'createDirectory']
  }
  const saved = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)
  if (saved.canceled || !saved.filePath) return { ok: false, canceled: true }
  const target = saved.filePath

  const win = new BrowserWindow({
    width: 794,
    height: 1123,
    show: false,
    frame: false,
    backgroundColor: themeBackground(theme),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      backgroundThrottling: false
    }
  })
  const wc = win.webContents
  wc.setBackgroundThrottling(false)
  wc.on('will-navigate', (event) => event.preventDefault())
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  pending.set(wc.id, { content: input.content, baseDir: input.baseDir, theme })

  try {
    await loadPrintWindow(win)
    if (!(await waitSettled(win))) {
      return { ok: false, message: '导出超时：图表或图片未能在限定时间内渲染完成' }
    }
    const buf = await wc.printToPDF({
      pageSize: 'A4',
      landscape: false,
      printBackground: true,
      preferCSSPageSize: false,
      margins: { top: 0.71, bottom: 0.71, left: 0.63, right: 0.63 }
    })
    await fs.writeFile(target, buf)
    return { ok: true, path: target }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    pending.delete(wc.id)
    if (!win.isDestroyed()) win.destroy()
  }
}
