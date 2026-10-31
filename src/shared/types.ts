export type ThemeMode = 'light' | 'dark' | 'sepia'
export type ThemePreference = 'system' | ThemeMode
export type ContentFont = 'sans' | 'serif' | 'songti' | 'kaiti' | 'fangsong'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DocPayload {
  path: string
  root: string
  name: string
  content: string
  mtimeMs: number
}

export interface FsEntry {
  name: string
  path: string
  isDir: boolean
}

export interface RecentDoc {
  path: string
  name: string
  root: string
  at: number
}

export interface Settings {
  themeMode: ThemePreference
  sidebarCollapsed: boolean
  sidebarWidth: number
  contentWidth: number
  contentFontSize: number
  contentFontFamily: ContentFont
  contentLineHeight: number
  editorFontSize: number
  editorWordWrap: boolean
  editorLineNumbers: boolean
  restoreSession: boolean
  hideNoisyEntries: boolean
  rememberWindowBounds: boolean
  windowBounds: WindowBounds | null
  windowMaximized: boolean
  roots: string[]
  openTabs: string[]
  activeTab: string | null
  expandedDirs: string[]
  recents: RecentDoc[]
  assocBackup: { md: string | null; markdown: string | null } | null
}

export type AssocState = 'ok' | 'stale' | 'notRegistered' | 'otherApp'

export interface AssocInfo {
  state: AssocState
  exePath: string
  registeredExe: string | null
  userChoiceProgId: string | null
}

export interface AppInfo {
  version: string
  exePath: string
  isPackaged: boolean
}

export interface PathStat {
  kind: 'file' | 'dir' | 'none'
  isText: boolean
}

export interface SettingsBundle {
  settings: Settings
  theme: ThemeMode
}

export interface WriteResult {
  ok: boolean
  mtimeMs?: number
  reason?: 'conflict' | 'error'
  message?: string
  diskContent?: string
  diskMtimeMs?: number
}

export interface CreateEntryResult {
  ok: boolean
  path?: string
  message?: string
}

export interface TrashResult {
  ok: boolean
  message?: string
}

export interface SearchHit {
  line: number
  text: string
}

export interface SearchFileResult {
  path: string
  name: string
  rel: string
  hits: SearchHit[]
}

export interface SearchResult {
  nameMatches: FsEntry[]
  contentMatches: SearchFileResult[]
  truncated: boolean
}

export interface MdvApi {
  openDialog(mode: 'file' | 'folder'): Promise<string | null>
  readDoc(path: string): Promise<DocPayload>
  unwatchDoc(path: string): Promise<void>
  writeDoc(payload: {
    path: string
    content: string
    baseMtimeMs: number
    force?: boolean
  }): Promise<WriteResult>
  listDir(dir: string): Promise<FsEntry[]>
  createEntry(payload: { dir: string; name: string; kind: 'file' | 'dir' }): Promise<CreateEntryResult>
  trashPath(path: string): Promise<TrashResult>
  revealPath(path: string): Promise<void>
  searchTree(root: string, query: string): Promise<SearchResult>
  statPath(path: string): Promise<PathStat>
  getSettings(): Promise<SettingsBundle>
  patchSettings(patch: Partial<Settings>): Promise<SettingsBundle>
  resetSettings(): Promise<SettingsBundle>
  pendingFile(): Promise<string | null>
  assocStatus(): Promise<AssocInfo>
  assocRegister(): Promise<AssocInfo>
  assocUnregister(): Promise<AssocInfo>
  openDefaultApps(): Promise<void>
  openExternal(url: string): Promise<void>
  openPath(path: string): Promise<void>
  appInfo(): Promise<AppInfo>
  editAction(action: 'cut' | 'copy' | 'paste' | 'select-all'): void
  confirmClose(): void
  onDocOpen(cb: (path: string) => void): () => void
  onDocChanged(cb: (payload: { path: string; mtimeMs: number } | null) => void): () => void
  onDocDeleted(cb: (payload: { path: string }) => void): () => void
  onCloseRequest(cb: () => void): () => void
  onPathsDropped(cb: (paths: string[]) => void): () => void
}
