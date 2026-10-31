import { app, Menu } from 'electron'
import { findOpenArgument } from './argv'
import { registerIpc, setPendingFile } from './ipc'
import { registerScheme, setupProtocol } from './protocol'
import { applyNativeTheme, getSettings, resolveThemeMode } from './settings'
import { createMainWindow, getMainWindow, setupTray } from './window'

registerScheme()

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.exit(0)
} else {
  setPendingFile(findOpenArgument(process.argv, process.cwd(), app.isPackaged))

  app.on('second-instance', (_event, argv, cwd) => {
    const win = getMainWindow()
    const target = findOpenArgument(argv, cwd, app.isPackaged)
    if (!win) {
      if (target) setPendingFile(target)
      return
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (!target) return
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
    registerIpc(getMainWindow)
    createMainWindow(resolveThemeMode(settings.themeMode), {
      bounds: settings.windowBounds,
      maximized: settings.windowMaximized,
      remember: settings.rememberWindowBounds
    })
    setupTray()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
