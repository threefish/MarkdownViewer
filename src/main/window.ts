import { BrowserWindow, Menu, Tray, app, nativeImage, screen, shell } from 'electron'
import path from 'node:path'
import trayIconPath from '../../build/tray.png?asset'
import type { ThemeMode, WindowBounds } from '../shared/types'
import { themeBackground } from '../shared/themes'
import { getSettings, patchSettings } from './settings'

let mainWindow: BrowserWindow | null = null
let allowClose = false
let rendererReady = false
let saveTimer: NodeJS.Timeout | null = null
let tray: Tray | null = null

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

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}
