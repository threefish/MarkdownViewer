import { BrowserWindow, Menu, Tray, app, nativeImage, screen, shell } from 'electron'
import path from 'node:path'
import trayIconPath from '../../build/tray.png?asset'
import type { ThemeMode, WindowBounds } from '../shared/types'
import { themeBackground } from '../shared/themes'
import {
  isExcalidrawFile,
  isImageFile,
  isMarkdownFile,
  isMindMapFile,
  isPdfFile
} from '../shared/fileKinds'
import { getSettings, patchSettings } from './settings'

let mainWindow: BrowserWindow | null = null
let allowClose = false
let rendererReady = false
let saveTimer: NodeJS.Timeout | null = null
let tray: Tray | null = null
const zenWindows = new Map<BrowserWindow, string>()

export interface WindowState {
  bounds: WindowBounds | null
  maximized: boolean
  remember: boolean
}

function isBoundsVisible(bounds: WindowBounds): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapWidth =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
    const overlapHeight =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y)
    return overlapWidth >= 120 && overlapHeight >= 80
  })
}

export function persistWindowState(win: BrowserWindow): void {
  if (win.isDestroyed() || win.isMinimized()) return
  const settings = getSettings()
  if (!settings.rememberWindowBounds) return
  const maximized = win.isMaximized()
  const bounds = maximized ? win.getNormalBounds() : win.getBounds()
  const prev = settings.windowBounds
  if (
    prev &&
    prev.x === bounds.x &&
    prev.y === bounds.y &&
    prev.width === bounds.width &&
    prev.height === bounds.height &&
    settings.windowMaximized === maximized
  ) {
    return
  }
  patchSettings({ windowBounds: bounds, windowMaximized: maximized })
}

function scheduleWindowSave(win: BrowserWindow): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    persistWindowState(win)
  }, 400)
}

function cancelPendingSave(): void {
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function closeMainWindow(): void {
  allowClose = true
  mainWindow?.close()
}

export function showMainWindow(): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function isZenWindow(win: BrowserWindow | null): boolean {
  return !!win && zenWindows.has(win)
}

/** 各格式禅模式窗口的默认尺寸（逻辑像素），阅读/画布按内容需要取合适比例。 */
function zenWindowSize(file: string): { width: number; height: number } {
  if (isMarkdownFile(file)) return { width: 1000, height: 880 }
  if (isMindMapFile(file) || isExcalidrawFile(file)) return { width: 1320, height: 900 }
  if (isPdfFile(file)) return { width: 1160, height: 920 }
  if (isImageFile(file)) return { width: 1120, height: 860 }
  return { width: 980, height: 840 }
}

/** 双击文件打开的只读禅模式窗口：按格式给默认尺寸并居中于当前显示器，Esc 关闭。 */
export function createZenWindow(file: string, theme: ThemeMode): BrowserWindow {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  const size = zenWindowSize(file)
  const width = Math.min(size.width, area.width - 80)
  const height = Math.min(size.height, area.height - 80)
  const win = new BrowserWindow({
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
    minWidth: 480,
    minHeight: 320,
    frame: false,
    show: false,
    backgroundColor: themeBackground(theme),
    title: `${path.basename(file)} — 禅模式`,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true
    }
  })
  zenWindows.set(win, file)
  hardenWindow(win)
  const notifyMaximized = (value: boolean): void => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('window:maximized-changed', value)
    }
  }
  win.on('maximize', () => notifyMaximized(true))
  win.on('unmaximize', () => notifyMaximized(false))
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
  win.on('closed', () => {
    zenWindows.delete(win)
  })
  loadRenderer(win)
  return win
}

export function findZenWindow(file: string): BrowserWindow | null {
  for (const [win, target] of zenWindows) {
    if (win.isDestroyed()) continue
    if (target.toLowerCase() === file.toLowerCase()) return win
  }
  return null
}

export function zenFileFor(senderId: number): string | null {
  for (const [win, file] of zenWindows) {
    if (!win.isDestroyed() && win.webContents.id === senderId) return file
  }
  return null
}

export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function closeAllWindows(): void {
  allowClose = true
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.close()
  }
}

function loadRenderer(win: BrowserWindow): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function hardenWindow(win: BrowserWindow): void {
  const wc = win.webContents
  wc.on('will-navigate', (event) => {
    event.preventDefault()
  })
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })
  wc.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}

export function requestQuit(): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) {
    app.quit()
    return
  }
  showMainWindow()
  const send = (): void => {
    if (!win.isDestroyed()) win.webContents.send('app:close-request')
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

export function setupTray(): void {
  if (tray) return
  const icon = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(icon.resize({ width: 32, height: 32 }))
  tray.setToolTip('Markdown Viewer')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => showMainWindow() },
      { type: 'separator' },
      { label: '退出', click: () => requestQuit() }
    ])
  )
  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => showMainWindow())
}

export function createMainWindow(theme: ThemeMode, state: WindowState): BrowserWindow {
  allowClose = false
  rendererReady = false
  const restored =
    state.remember && state.bounds && isBoundsVisible(state.bounds) ? state.bounds : null
  const win = new BrowserWindow({
    width: restored?.width ?? 1280,
    height: restored?.height ?? 860,
    ...(restored ? { x: restored.x, y: restored.y } : {}),
    minWidth: 760,
    minHeight: 480,
    frame: false,
    show: false,
    backgroundColor: themeBackground(theme),
    title: 'Markdown Viewer',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true
    }
  })

  mainWindow = win

  win.once('ready-to-show', () => {
    if (state.remember && state.maximized) win.maximize()
    win.show()
  })
  win.webContents.once('did-finish-load', () => {
    rendererReady = true
  })
  win.on('close', () => {
    cancelPendingSave()
    persistWindowState(win)
  })
  win.on('close', (event) => {
    if (allowClose || !rendererReady || win.webContents.isDestroyed()) return
    event.preventDefault()
    win.hide()
  })
  win.on('query-session-end', () => {
    allowClose = true
  })
  win.on('resize', () => scheduleWindowSave(win))
  win.on('move', () => scheduleWindowSave(win))
  win.on('maximize', () => {
    scheduleWindowSave(win)
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('window:maximized-changed', true)
    }
  })
  win.on('unmaximize', () => {
    scheduleWindowSave(win)
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('window:maximized-changed', false)
    }
  })
  win.on('closed', () => {
    cancelPendingSave()
    if (mainWindow === win) mainWindow = null
  })

  hardenWindow(win)
  loadRenderer(win)

  return win
}
