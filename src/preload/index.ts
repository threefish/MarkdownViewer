import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { MdvApi } from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: MdvApi = {
  openDialog: (mode) => ipcRenderer.invoke('dialog:open', mode),
  readDoc: (path) => ipcRenderer.invoke('doc:read', path),
  unwatchDoc: (path) => ipcRenderer.invoke('doc:unwatch', path),
  writeDoc: (payload) => ipcRenderer.invoke('doc:write', payload),
  listDir: (dir) => ipcRenderer.invoke('fs:list', dir),
  createEntry: (payload) => ipcRenderer.invoke('fs:create', payload),
  trashPath: (path) => ipcRenderer.invoke('fs:trash', path),
  revealPath: (path) => ipcRenderer.invoke('fs:reveal', path),
  searchTree: (root, query) => ipcRenderer.invoke('fs:search', root, query),
  statPath: (path) => ipcRenderer.invoke('path:stat', path),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  patchSettings: (patch) => ipcRenderer.invoke('settings:patch', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  pendingFile: () => ipcRenderer.invoke('app:pending-file'),
  assocStatus: () => ipcRenderer.invoke('assoc:status'),
  assocRegister: () => ipcRenderer.invoke('assoc:register'),
  assocUnregister: () => ipcRenderer.invoke('assoc:unregister'),
  openDefaultApps: () => ipcRenderer.invoke('assoc:open-defaults'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openPath: (path) => ipcRenderer.invoke('shell:open-path', path),
  appInfo: () => ipcRenderer.invoke('app:info'),
  editAction: (action) => ipcRenderer.send('edit:action', action),
  confirmClose: () => ipcRenderer.send('app:close-confirm'),
  onDocOpen: (cb) => subscribe('doc:open-request', cb),
  onDocChanged: (cb) => subscribe('doc:changed', cb),
  onDocDeleted: (cb) => subscribe('doc:deleted', cb),
  onCloseRequest: (cb) => subscribe('app:close-request', cb),
  onPathsDropped: (cb) => subscribe('fs:paths-dropped', cb)
}

contextBridge.exposeInMainWorld('mdv', api)

window.addEventListener('dragover', (event) => {
  event.preventDefault()
})

window.addEventListener('drop', (event) => {
  event.preventDefault()
  event.stopPropagation()
  const files = Array.from(event.dataTransfer?.files ?? [])
  const paths: string[] = []
  for (const file of files) {
    try {
      const filePath = webUtils.getPathForFile(file)
      if (filePath) paths.push(filePath)
    } catch {
      // ignore files without a local path
    }
  }
  if (paths.length) ipcRenderer.send('fs:paths-dropped', paths)
})
