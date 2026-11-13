export type ThemeMode =
  | 'light'
  | 'dark'
  | 'sepia'
  | 'github-light'
  | 'github-dark'
  | 'vscode-light'
  | 'vscode-dark'
  | 'one-dark'
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
  settingsWidth: number
  contentWidth: number
  contentFontSize: number
  contentFontFamily: ContentFont
  contentLineHeight: number
  editorFontSize: number
  editorWordWrap: boolean
  editorLineNumbers: boolean
  editPreview: boolean
  editSplitRatio: number
  pastedImageDir: string
  newFileExt: string
  restoreSession: boolean
  hideNoisyEntries: boolean
  rememberWindowBounds: boolean
  windowBounds: WindowBounds | null
  windowMaximized: boolean
  roots: string[]
  openTabs: string[]
  activeTab: string | null
  expandedDirs: string[]
  hiddenTreePaths: string[]
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
  isPdf: boolean
  isImage: boolean
  isXmind: boolean
}

export interface PdfMeta {
  path: string
  root: string
  name: string
  mtimeMs: number
}

export interface ImageMeta {
  path: string
  root: string
  name: string
  mtimeMs: number
}

export interface RestoreResult {
  ok: boolean
  mtimeMs?: number
  reason?: 'exists' | 'error'
  message?: string
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

export interface RenameEntryResult {
  ok: boolean
  path?: string
  message?: string
}

export interface CopyEntryResult {
  ok: boolean
  path?: string
  message?: string
}

export type SavePastedImageResult =
  | { ok: true; relative: string; absolute: string }
  | { ok: false; message: string }

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

export interface PrintPayload {
  content: string
  baseDir: string
  theme: ThemeMode
}

export interface PdfExportResult {
  ok: boolean
  message?: string
  path?: string
  canceled?: boolean
}

export interface BinaryFilePayload {
  path: string
  name: string
  data: Uint8Array
}

export interface SaveAsPayload {
  defaultName: string
  filterName: string
  extensions: string[]
  content?: string
  data?: Uint8Array
}

export interface SaveAsResult {
  ok: boolean
  path?: string
  canceled?: boolean
  message?: string
}

export interface MdvApi {
  openDialog(mode: 'file' | 'folder' | 'image' | 'drawing' | 'xmind'): Promise<string | null>
  readDoc(path: string): Promise<DocPayload>
  readScene(path: string): Promise<DocPayload>
  readBinary(path: string): Promise<BinaryFilePayload>
  saveAs(payload: SaveAsPayload): Promise<SaveAsResult>
  pdfMeta(path: string): Promise<PdfMeta>
  imageMeta(path: string): Promise<ImageMeta>
  unwatchDoc(path: string): Promise<void>
  writeDoc(payload: {
    path: string
    content: string
    baseMtimeMs: number
    force?: boolean
  }): Promise<WriteResult>
  savePastedImage(payload: {
    docPath: string
    mimeType: string
    data: Uint8Array
  }): Promise<SavePastedImageResult>
  importAsset(payload: { docPath: string; sourcePath: string }): Promise<SavePastedImageResult>
  restoreDoc(payload: { path: string; content: string }): Promise<RestoreResult>
  listDir(dir: string): Promise<FsEntry[]>
  watchDir(dir: string): Promise<void>
  unwatchDir(dir: string): Promise<void>
  createEntry(payload: { dir: string; name: string; kind: 'file' | 'dir' }): Promise<CreateEntryResult>
  renameEntry(payload: { path: string; name: string }): Promise<RenameEntryResult>
  copyEntry(payload: { source: string; targetDir: string }): Promise<CopyEntryResult>
  copyText(text: string): Promise<boolean>
  trashPath(path: string): Promise<TrashResult>
  revealPath(path: string): Promise<void>
  searchTree(root: string, query: string): Promise<SearchResult>
  statPath(path: string): Promise<PathStat>
  exportPdf(payload: { path: string; content: string; baseDir: string }): Promise<PdfExportResult>
  printPayload(): Promise<PrintPayload | null>
  getSettings(): Promise<SettingsBundle>
  patchSettings(patch: Partial<Settings>): Promise<SettingsBundle>
  resetSettings(): Promise<SettingsBundle>
  pendingFile(): Promise<string | null>
  zenInfo(): Promise<{ path: string | null }>
  openMainWindow(): void
  assocStatus(): Promise<AssocInfo>
  assocRegister(): Promise<AssocInfo>
  assocUnregister(): Promise<AssocInfo>
  openDefaultApps(): Promise<void>
  openExternal(url: string): Promise<void>
  openPath(path: string): Promise<void>
  appInfo(): Promise<AppInfo>
  editAction(action: 'cut' | 'copy' | 'paste'): void
  confirmClose(): void
  minimizeWindow(): void
  toggleMaximizeWindow(): void
  closeWindow(): void
  isWindowMaximized(): Promise<boolean>
  onWindowMaximized(cb: (maximized: boolean) => void): () => void
  onDocOpen(cb: (path: string) => void): () => void
  onDocChanged(cb: (payload: { path: string; mtimeMs: number } | null) => void): () => void
  onDocDeleted(cb: (payload: { path: string }) => void): () => void
  onDirChanged(cb: (payload: { dir: string }) => void): () => void
  onCloseRequest(cb: () => void): () => void
  onPathsDropped(cb: (paths: string[]) => void): () => void
}
