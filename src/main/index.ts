import { app, Menu } from 'electron'
import { statSync } from 'node:fs'
import { findOpenArgument } from './argv'
import { registerIpc, setPendingFile } from './ipc'
import { registerScheme, setupProtocol } from './protocol'
import { applyNativeTheme, getSettings, resolveThemeMode } from './settings'
import { isXmindFile } from '../shared/fileKinds'
import {
  createMainWindow,
  createZenWindow,
  findZenWindow,
  getMainWindow,
  setupTray,
  showMainWindow
} from './window'

registerScheme()

function isFileTarget(target: string | null): target is string {
  if (!target) return false
  try {
    return statSync(target).isFile()
  } catch {
    return false
  }
}

// XMind 要先在渲染层解析并另存为 .smm，需要交互，仍走主窗口。
function shouldOpenInZen(target: string | null): target is string {
  return isFileTarget(target) && !isXmindFile(target)
}

function openInZen(target: string): void {
  const existing = findZenWindow(target)
  if (existing) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return
  }
  createZenWindow(target, resolveThemeMode(getSettings().themeMode))
}

function ensureMainWindow(): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    showMainWindow()
    return
  }
  const settings = getSettings()
  createMainWindow(resolveThemeMode(settings.themeMode), {
    bounds: settings.windowBounds,
    maximized: settings.windowMaximized,
    remember: settings.rememberWindowBounds
  })
  setupTray()
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.exit(0)
} else {
  const launchTarget = findOpenArgument(process.argv, process.cwd(), app.isPackaged)
  const launchInZen = shouldOpenInZen(launchTarget)
  if (!launchInZen) setPendingFile(launchTarget)

  app.on('second-instance', (_event, argv, cwd) => {
    const target = findOpenArgument(argv, cwd, app.isPackaged)
    if (shouldOpenInZen(target)) {
      openInZen(target)
      return
    }
    ensureMainWindow()
    const win = getMainWindow()
    if (!win || !target) return
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => {
        if (!win.isDestroyed()) win.webContents.send('doc:open-request', target)
      })
    } else {
      win.webContents.send('doc:open-request', target)
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.local.mdviewer')
    Menu.setApplicationMenu(null)

    const settings = getSettings()
    applyNativeTheme(settings.themeMode)

    setupProtocol()
    registerIpc(getMainWindow, ensureMainWindow)

    if (launchInZen && launchTarget) {
      createZenWindow(launchTarget, resolveThemeMode(settings.themeMode))
    } else {
      createMainWindow(resolveThemeMode(settings.themeMode), {
        bounds: settings.windowBounds,
        maximized: settings.windowMaximized,
        remember: settings.rememberWindowBounds
      })
      setupTray()
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
