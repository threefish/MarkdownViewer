import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX
} from 'react'
import type { AppInfo, ContentFont, DocPayload, FsEntry, Settings, ThemeMode } from '../../shared/types'
import { isThemePreference } from '../../shared/themes'
import { isMarkdownFile } from '../../shared/fileKinds'
import { AboutDialog } from './components/AboutDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import type { EditorHandle } from './components/Editor'
import { EmptyState } from './components/EmptyState'
import { HiddenRestoreDialog } from './components/HiddenRestoreDialog'
import { CloseIcon, EyeIcon, PencilIcon, SearchIcon } from './components/Icons'
import type { MenuAction, MenuState } from './components/MenuBar'
import { NewEntryDialog } from './components/NewEntryDialog'
import { SearchBar } from './components/SearchBar'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { TabBar, type TabInfo } from './components/TabBar'
import { TitleBar } from './components/TitleBar'
import { WidthControl } from './components/WidthControl'
import { MarkdownDocument } from './lib/markdown'
import { languageKeyForPath } from './lib/codeLanguage'
import { docTier, hasVeryLongLine, isLargeDoc } from './lib/largeFile'
import { classifyHref } from './lib/pathResolve'
import { applyTaskToggle, errorMessage } from './lib/text'

const Editor = lazy(() =>
  import('./components/Editor').then((module) => ({ default: module.Editor }))
)

const INITIAL_SETTINGS: Settings = {
  themeMode: 'system',
  sidebarCollapsed: false,
  sidebarWidth: 284,
  settingsWidth: 460,
  contentWidth: 860,
  contentFontSize: 16,
  contentFontFamily: 'sans',
  contentLineHeight: 1.78,
  editorFontSize: 13.5,
  editorWordWrap: true,
  editorLineNumbers: true,
  newFileExt: 'md',
  restoreSession: true,
  hideNoisyEntries: true,
  rememberWindowBounds: true,
  windowBounds: null,
  windowMaximized: false,
  roots: [],
  openTabs: [],
  activeTab: null,
  expandedDirs: [],
  hiddenTreePaths: [],
  recents: [],
  assocBackup: null
}

const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 520

const PROSE_FONTS: Record<ContentFont, string> = {
  sans: 'var(--font-sans)',
  serif: "Georgia, 'Times New Roman', 'Songti SC', 'Noto Serif CJK SC', 'SimSun', serif",
  songti: "'Songti SC', 'Noto Serif CJK SC', 'SimSun', 'STSong', serif",
  kaiti: "'Kaiti SC', 'STKaiti', 'KaiTi', 'Noto Serif CJK SC', 'SimSun', serif",
  fangsong: "'FangSong', 'STFangsong', 'Noto Serif CJK SC', 'SimSun', serif"
}

type SidebarTab = 'files' | 'outline'

const MIN_CONTENT_WIDTH = 600
const MAX_CONTENT_WIDTH = 1200

interface DocTab {
  path: string
  root: string
  name: string
  content: string
  mtimeMs: number
  draft: string | null
  editing: boolean
  searchOpen: boolean
  externalChanged: boolean
  externalDisk: { diskContent: string; diskMtimeMs: number } | null
  banner: string | null
  largeEditOk?: boolean
}

interface Conflict {
  path: string
  name: string
  diskContent: string
  diskMtimeMs: number
}

type Prompt =
  | { kind: 'close-tab'; path: string; name: string }
  | { kind: 'quit'; path: string; name: string }

function isDirty(tab: DocTab): boolean {
  return tab.draft !== null && tab.draft !== tab.content
}

function ratioOf(element: HTMLElement | null): number {
  if (!element) return 0
  const max = element.scrollHeight - element.clientHeight
  return max > 0 ? element.scrollTop / max : 0
}

function samePath(a: string, b: string): boolean {
  return a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()
}

function dirnameOf(file: string): string {
  const normalized = file.replace(/\//g, '\\').replace(/\\+$/, '')
  const index = normalized.lastIndexOf('\\')
  return index > 0 ? normalized.slice(0, index) : normalized
}

function isWithin(file: string, dir: string): boolean {
  const f = file.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  const d = dir.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  return f === d || f.startsWith(d + '\\')
}

function findRoot(file: string, roots: string[]): string | null {
  let best: string | null = null
  for (const root of roots) {
    if (!isWithin(file, root)) continue
    if (!best || root.length > best.length) best = root
  }
  return best
}

function dirChain(target: string, root: string): string[] {
  const chain: string[] = [root]
  let current = target
  while (isWithin(current, root) && !samePath(current, root)) {
    chain.push(current)
    const parent = dirnameOf(current)
    if (samePath(parent, current)) break
    current = parent
  }
  return chain
}

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS)
  const [theme, setTheme] = useState<ThemeMode>('light')
  const [contentWidth, setContentWidth] = useState(860)
  const [widthOpen, setWidthOpen] = useState(false)
  const [roots, setRoots] = useState<string[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [sidebarWidth, setSidebarWidth] = useState(284)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('files')
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [hiddenPickerDir, setHiddenPickerDir] = useState<string | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingHash, setPendingHash] = useState<string | null>(null)

  const [tabs, setTabsState] = useState<DocTab[]>([])
  const [activeId, setActiveIdState] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [batchClose, setBatchClose] = useState<{ paths: string[]; dirty: string[] } | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [createKind, setCreateKind] = useState<'file' | 'dir' | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [treeVersion, setTreeVersion] = useState(0)
  const [restoreTick, setRestoreTick] = useState(0)
  const [trashTarget, setTrashTarget] = useState<FsEntry | null>(null)
  const [createBaseDir, setCreateBaseDir] = useState<string | null>(null)
  const [hugeEdit, setHugeEdit] = useState<{ path: string; name: string } | null>(null)

  const tabsRef = useRef<DocTab[]>([])
  const activeIdRef = useRef<string | null>(null)
  const readerRef = useRef<HTMLDivElement>(null)
  const editorHandle = useRef<EditorHandle | null>(null)
  const rootsRef = useRef<string[]>([])
  const settingsRef = useRef<Settings>(INITIAL_SETTINGS)
  const restoredRef = useRef(false)
  const persistedTabsRef = useRef('')
  const scrollMap = useRef(new Map<string, number>())
  const pendingPrompt = useRef<Prompt | null>(null)
  const commandRef = useRef<(action: MenuAction, payload?: string) => void>(() => {})

  const setTabs = useCallback((updater: (prev: DocTab[]) => DocTab[]) => {
    const next = updater(tabsRef.current)
    tabsRef.current = next
    setTabsState(next)
  }, [])

  const setActiveId = useCallback((id: string | null) => {
    activeIdRef.current = id
    setActiveIdState(id)
  }, [])

  const updateTab = useCallback(
    (path: string, patch: Partial<DocTab> | ((tab: DocTab) => Partial<DocTab>)) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.path === path ? { ...tab, ...(typeof patch === 'function' ? patch(tab) : patch) } : tab
        )
      )
    },
    [setTabs]
  )

  const active = tabs.find((tab) => tab.path === activeId) ?? null
  const dirty = active ? isDirty(active) : false
  const previewContent = active ? active.draft ?? active.content : ''

  useEffect(() => {
    rootsRef.current = roots
  }, [roots])

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${sidebarWidth}px`)
  }, [sidebarWidth])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (settings.themeMode !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      if (settingsRef.current.themeMode !== 'system') return
      setTheme(query.matches ? 'dark' : 'light')
    }
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [settings.themeMode])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--content-w',
      contentWidth === 0 ? '100%' : `${contentWidth}px`
    )
  }, [contentWidth])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--prose-size',
      `${settings.contentFontSize}px`
    )
  }, [settings.contentFontSize])

  useEffect(() => {
    document.documentElement.style.setProperty('--prose-font', PROSE_FONTS[settings.contentFontFamily])
  }, [settings.contentFontFamily])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--prose-leading',
      String(settings.contentLineHeight)
    )
  }, [settings.contentLineHeight])

  useEffect(() => {
    document.documentElement.style.setProperty('--editor-size', `${settings.editorFontSize}px`)
  }, [settings.editorFontSize])


  useEffect(() => {
    if (!active) {
      document.title = 'Markdown Viewer'
      return
    }
    document.title = `${isDirty(active) ? '● ' : ''}${active.name} — Markdown Viewer`
  }, [active])

  const patchRecents = useCallback(async (payload: DocPayload) => {
    const previous = settingsRef.current
    const recents = [
      { path: payload.path, name: payload.name, root: payload.root, at: Date.now() },
      ...previous.recents.filter((item) => !samePath(item.path, payload.path))
    ].slice(0, 12)
    const bundle = await window.mdv.patchSettings({ recents })
    settingsRef.current = bundle.settings
    setSettings(bundle.settings)
  }, [])

  const addExpanded = useCallback((dirs: string[]) => {
    setExpandedDirs((previous) => {
      let next: Set<string> | null = null
      for (const dir of dirs) {
        if (previous.has(dir)) continue
        next ??= new Set(previous)
        next.add(dir)
      }
      return next ?? previous
    })
  }, [])

  const ensureRootFor = useCallback((file: string) => {
    const dir = dirnameOf(file)
    const current = rootsRef.current
    if (findRoot(file, current)) return
    const next = [...current.filter((root) => !isWithin(root, dir)), dir]
    rootsRef.current = next
    setRoots(next)
    addExpanded([dir])
  }, [addExpanded])

  const revealFile = useCallback(
    (file: string) => {
      const root = findRoot(file, rootsRef.current)
      if (!root) return
      addExpanded(dirChain(dirnameOf(file), root))
    },
    [addExpanded]
  )

  const addDirToTree = useCallback(
    (dir: string) => {
      const clean = dir.replace(/[\\/]+$/, '')
      const current = rootsRef.current
      if (current.some((root) => samePath(root, clean))) {
        addExpanded([clean])
        return
      }
      const next = [...current.filter((root) => !isWithin(root, clean)), clean]
      rootsRef.current = next
      setRoots(next)
      addExpanded([clean])
    },
    [addExpanded]
  )

  const activateTab = useCallback(
    (path: string, hash?: string) => {
      const currentId = activeIdRef.current
      if (currentId && currentId !== path) {
        const current = tabsRef.current.find((tab) => tab.path === currentId)
        if (current?.searchOpen) {
          updateTab(current.path, { searchOpen: false })
        }
      }
      if (currentId !== path) setActiveId(path)
      if (hash) setPendingHash(hash)
      revealFile(path)
    },
    [revealFile, setActiveId, updateTab]
  )

  const openDoc = useCallback(
    async (
      path: string,
      hash?: string,
      opts?: { quiet?: boolean; recents?: boolean; reveal?: boolean; attach?: boolean }
    ) => {
      const existing = tabsRef.current.find((tab) => samePath(tab.path, path))
      if (existing) {
        activateTab(existing.path, hash)
        return
      }
      try {
        const payload = await window.mdv.readDoc(path)
        const opened = tabsRef.current.find((tab) => samePath(tab.path, payload.path))
        if (opened) {
          activateTab(opened.path, hash)
          return
        }
        const tab: DocTab = {
          path: payload.path,
          root: payload.root,
          name: payload.name,
          content: payload.content,
          mtimeMs: payload.mtimeMs,
          draft: null,
          editing: false,
          searchOpen: false,
          externalChanged: false,
          externalDisk: null,
          banner: null
        }
        setTabs((prev) => [...prev, tab])
        setActiveId(tab.path)
        scrollMap.current.set(tab.path, 0)
        setNotice(null)
        if (hash) setPendingHash(hash)
        if (opts?.attach !== false) ensureRootFor(payload.path)
        if (opts?.reveal !== false) revealFile(payload.path)
        if (opts?.recents !== false) await patchRecents(payload)
      } catch (err) {
        if (!opts?.quiet) setNotice(`无法打开文件：${errorMessage(err)}`)
      }
    },
    [activateTab, ensureRootFor, patchRecents, revealFile, setActiveId, setTabs]
  )

  const openPath = useCallback(
    async (path: string) => {
      try {
        const stat = await window.mdv.statPath(path)
        if (stat.kind === 'dir') {
          addDirToTree(path)
          setNotice(null)
          return
        }
        if (stat.kind === 'file' && stat.isText) {
          await openDoc(path)
          return
        }
        if (stat.kind === 'file') {
          await window.mdv.openPath(path).catch(() => setNotice('无法打开该文件'))
          return
        }
        setNotice('目标文件或文件夹不存在')
      } catch (err) {
        setNotice(errorMessage(err))
      }
    },
    [addDirToTree, openDoc]
  )

  const openPaths = useCallback(
    async (paths: string[]) => {
      const list = paths.slice(0, 12)
      for (const path of list) {
        const stat = await window.mdv.statPath(path).catch(() => null)
        if (!stat) continue
        if (stat.kind === 'dir' || (stat.kind === 'file' && stat.isText)) {
          await openPath(path)
        } else if (stat.kind === 'file' && list.length === 1) {
          await openPath(path)
        }
      }
    },
    [openPath]
  )

  const closeTabsNow = useCallback(
    (paths: string[]) => {
      const closing = new Set(paths)
      const list = tabsRef.current
      if (!list.some((tab) => closing.has(tab.path))) return
      const index = activeIdRef.current
        ? list.findIndex((tab) => tab.path === activeIdRef.current)
        : -1
      const next = list.filter((tab) => !closing.has(tab.path))
      setTabs(() => next)
      if (activeIdRef.current && closing.has(activeIdRef.current)) {
        let fallback: DocTab | null = null
        for (let i = index + 1; i < list.length; i++) {
          if (!closing.has(list[i].path)) {
            fallback = list[i]
            break
          }
        }
        if (!fallback) {
          for (let i = index - 1; i >= 0; i--) {
            if (!closing.has(list[i].path)) {
              fallback = list[i]
              break
            }
          }
        }
        setActiveId(fallback ? fallback.path : null)
      }
      for (const path of closing) {
        scrollMap.current.delete(path)
        void window.mdv.unwatchDoc(path)
      }
    },
    [setActiveId, setTabs]
  )

  const closeTabNow = useCallback((path: string) => closeTabsNow([path]), [closeTabsNow])

  const requestCloseTab = useCallback((path: string) => {
    const tab = tabsRef.current.find((item) => item.path === path)
    if (!tab) return
    if (isDirty(tab)) {
      if (activeIdRef.current !== tab.path) setActiveId(tab.path)
      setPrompt({ kind: 'close-tab', path: tab.path, name: tab.name })
      return
    }
    closeTabNow(tab.path)
  }, [closeTabNow, setActiveId])

  const requestClosePaths = useCallback(
    (paths: string[]) => {
      const closing = new Set(paths)
      const targets = tabsRef.current.filter((tab) => closing.has(tab.path))
      if (!targets.length) return
      const dirtyNames = targets.filter(isDirty).map((tab) => tab.name)
      if (dirtyNames.length) {
        setBatchClose({ paths: targets.map((tab) => tab.path), dirty: dirtyNames })
        return
      }
      closeTabsNow(targets.map((tab) => tab.path))
    },
    [closeTabsNow]
  )

  const requestQuit = useCallback(() => {
    const dirtyTab = tabsRef.current.find(isDirty)
    if (!dirtyTab) {
      window.mdv.confirmClose()
      return
    }
    if (activeIdRef.current !== dirtyTab.path) setActiveId(dirtyTab.path)
    setPrompt({ kind: 'quit', path: dirtyTab.path, name: dirtyTab.name })
  }, [setActiveId])

  const saveTab = useCallback(
    async (path: string, force = false): Promise<'ok' | 'conflict' | 'error'> => {
      const tab = tabsRef.current.find((item) => item.path === path)
      if (!tab || tab.draft === null) return 'ok'
      const text = tab.draft
      if (!force && text === tab.content) return 'ok'
      const result = await window.mdv.writeDoc({
        path: tab.path,
        content: text,
        baseMtimeMs: tab.mtimeMs,
        force
      })
      if (result.ok) {
        updateTab(path, {
          content: text,
          mtimeMs: result.mtimeMs ?? tab.mtimeMs,
          externalChanged: false,
          externalDisk: null,
          banner: null
        })
        return 'ok'
      }
      if (result.reason === 'conflict') {
        setConflict({
          path,
          name: tab.name,
          diskContent: result.diskContent ?? '',
          diskMtimeMs: result.diskMtimeMs ?? 0
        })
        return 'conflict'
      }
      updateTab(path, { banner: `保存失败：${result.message ?? '未知错误'}` })
      return 'error'
    },
    [updateTab]
  )

  const continuePrompt = useCallback(
    (next: Prompt) => {
      if (next.kind === 'close-tab') closeTabNow(next.path)
      else requestQuit()
    },
    [closeTabNow, requestQuit]
  )

  const saveActive = useCallback(async () => {
    const current = tabsRef.current.find((tab) => tab.path === activeIdRef.current)
    if (current) await saveTab(current.path)
  }, [saveTab])

  const reloadActive = useCallback(async () => {
    const tab = tabsRef.current.find((item) => item.path === activeIdRef.current)
    if (!tab) return
    if (isDirty(tab)) {
      updateTab(tab.path, { banner: '有未保存的修改，未重新加载' })
      return
    }
    try {
      const payload = await window.mdv.readDoc(tab.path)
      updateTab(tab.path, (item) => ({
        content: payload.content,
        mtimeMs: payload.mtimeMs,
        draft: item.editing ? payload.content : null,
        externalChanged: false,
        externalDisk: null,
        banner: null
      }))
    } catch (err) {
      updateTab(tab.path, { banner: `无法重新加载：${errorMessage(err)}` })
    }
  }, [updateTab])

  const toggleEdit = useCallback(() => {
    const tab = tabsRef.current.find((item) => item.path === activeIdRef.current)
    if (!tab) return
    if (tab.editing) {
      updateTab(tab.path, { editing: false })
      return
    }
    if (docTier(tab.content.length) === 'huge' && !tab.largeEditOk) {
      setHugeEdit({ path: tab.path, name: tab.name })
      return
    }
    updateTab(tab.path, {
      editing: true,
      draft: tab.draft ?? tab.content,
      searchOpen: false
    })
  }, [updateTab])

  const confirmLargeEdit = useCallback(() => {
    const target = hugeEdit
    setHugeEdit(null)
    if (!target) return
    const tab = tabsRef.current.find((item) => item.path === target.path)
    if (!tab) return
    if (activeIdRef.current !== tab.path) setActiveId(tab.path)
    updateTab(tab.path, {
      largeEditOk: true,
      editing: true,
      draft: tab.draft ?? tab.content,
      searchOpen: false
    })
  }, [hugeEdit, setActiveId, updateTab])

  const openFind = useCallback(() => {
    const tab = tabsRef.current.find((item) => item.path === activeIdRef.current)
    if (!tab) return
    if (tab.editing || !isMarkdownFile(tab.path) || isLargeDoc(tab.content.length)) {
      editorHandle.current?.openSearch()
      return
    }
    updateTab(tab.path, { searchOpen: true })
  }, [updateTab])

  const closeSearch = useCallback(
    (path: string) => {
      updateTab(path, { searchOpen: false })
    },
    [updateTab]
  )

  const toggleSearch = useCallback(() => {
    const tab = tabsRef.current.find((item) => item.path === activeIdRef.current)
    if (!tab) return
    if (tab.editing || !isMarkdownFile(tab.path) || isLargeDoc(tab.content.length)) {
      editorHandle.current?.openSearch()
      return
    }
    if (tab.searchOpen) closeSearch(tab.path)
    else updateTab(tab.path, { searchOpen: true })
  }, [closeSearch, updateTab])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const bundle = await window.mdv.patchSettings(patch)
    settingsRef.current = bundle.settings
    setSettings(bundle.settings)
    setTheme(bundle.theme)
    if (patch.contentWidth !== undefined) setContentWidth(bundle.settings.contentWidth)
    if (patch.sidebarWidth !== undefined) setSidebarWidth(bundle.settings.sidebarWidth)
    if (patch.sidebarCollapsed !== undefined) setCollapsed(bundle.settings.sidebarCollapsed)
    if (patch.hideNoisyEntries !== undefined || patch.hiddenTreePaths !== undefined)
      setTreeVersion((value) => value + 1)
  }, [])

  const resetSettings = useCallback(async () => {
    const bundle = await window.mdv.resetSettings()
    settingsRef.current = bundle.settings
    setSettings(bundle.settings)
    setTheme(bundle.theme)
    setContentWidth(bundle.settings.contentWidth)
    setSidebarWidth(bundle.settings.sidebarWidth)
    setCollapsed(bundle.settings.sidebarCollapsed)
    setTreeVersion((value) => value + 1)
  }, [])

  const persistWidth = useCallback((next: number) => {
    setContentWidth(next)
    void window.mdv.patchSettings({ contentWidth: next }).then((bundle) => {
      settingsRef.current = bundle.settings
      setSettings(bundle.settings)
    })
  }, [])

  const persistSidebarWidth = useCallback(
    (next: number) => {
      const width = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(next)))
      setSidebarWidth(width)
      void window.mdv.patchSettings({ sidebarWidth: width }).then((bundle) => {
        settingsRef.current = bundle.settings
        setSettings(bundle.settings)
      })
    },
    []
  )

  const toggleWidthPanel = useCallback(() => setWidthOpen((open) => !open), [])
  const closeWidthPanel = useCallback(() => setWidthOpen(false), [])

  const toggleSidebar = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous
      void updateSettings({ sidebarCollapsed: next })
      return next
    })
  }, [updateSettings])

  const pickFile = useCallback(async () => {
    const picked = await window.mdv.openDialog('file')
    if (picked) await openPath(picked)
  }, [openPath])

  const pickFolder = useCallback(async () => {
    const picked = await window.mdv.openDialog('folder')
    if (picked) await openPath(picked)
  }, [openPath])

  const createTargetDir = useCallback((): string | null => {
    if (createBaseDir) return createBaseDir
    const current = tabsRef.current.find((tab) => tab.path === activeIdRef.current)
    return current ? dirnameOf(current.path) : (rootsRef.current[0] ?? null)
  }, [createBaseDir])

  const startCreate = useCallback(
    (kind: 'file' | 'dir', dir?: string) => {
      setCreateBaseDir(dir ?? null)
      const current = tabsRef.current.find((tab) => tab.path === activeIdRef.current)
      const target = dir ?? (current ? dirnameOf(current.path) : (rootsRef.current[0] ?? null))
      if (!target) {
        setNotice('请先打开文件或文件夹')
        return
      }
      setSidebarTab('files')
      if (collapsed) {
        setCollapsed(false)
        void updateSettings({ sidebarCollapsed: false })
      }
      setCreateError(null)
      setCreateBusy(false)
      setCreateKind(kind)
    },
    [collapsed, updateSettings]
  )

  const submitCreate = useCallback(
    async (name: string) => {
      const kind = createKind
      const dir = createTargetDir()
      if (!kind || !dir) return
      setCreateBusy(true)
      setCreateError(null)
      const result = await window.mdv.createEntry({ dir, name, kind })
      setCreateBusy(false)
      if (!result.ok || !result.path) {
        setCreateError(result.message ?? '创建失败')
        return
      }
      setCreateKind(null)
      setCreateBaseDir(null)
      setTreeVersion((value) => value + 1)
      if (kind === 'file') {
        await openDoc(result.path)
        const opened = tabsRef.current.find((tab) => samePath(tab.path, result.path!))
        if (opened) updateTab(opened.path, { editing: true })
      }
    },
    [createKind, createTargetDir, openDoc, updateTab]
  )

  const cancelCreate = useCallback(() => {
    setCreateKind(null)
    setCreateBaseDir(null)
    setCreateError(null)
    setCreateBusy(false)
  }, [])

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const removeRoot = useCallback((root: string) => {
    const next = rootsRef.current.filter((item) => !samePath(item, root))
    rootsRef.current = next
    setRoots(next)
  }, [])

  const handleTreeCreate = useCallback(
    (dir: string, kind: 'file' | 'dir') => {
      startCreate(kind, dir)
    },
    [startCreate]
  )

  const handleReveal = useCallback((path: string) => {
    void window.mdv.revealPath(path).catch((err) => setNotice(errorMessage(err)))
  }, [])

  const requestTrash = useCallback((entry: FsEntry) => {
    setTrashTarget(entry)
  }, [])

  const hideTreeEntry = useCallback(
    (entry: FsEntry) => {
      const hidden = settingsRef.current.hiddenTreePaths
      if (hidden.some((path) => samePath(path, entry.path))) return
      void updateSettings({ hiddenTreePaths: [...hidden, entry.path] }).then(() => {
        setNotice(`已隐藏「${entry.name}」，可在 设置 → 文件树 中恢复`)
      })
    },
    [updateSettings]
  )

  const openHiddenPicker = useCallback((dir: string) => {
    setHiddenPickerDir(dir)
  }, [])

  const restoreHiddenPaths = useCallback(
    (paths: string[]) => {
      if (!paths.length) return
      const hidden = settingsRef.current.hiddenTreePaths
      const remaining = hidden.filter(
        (path) => !paths.some((selected) => samePath(selected, path))
      )
      const restored = hidden.length - remaining.length
      setHiddenPickerDir(null)
      if (!restored) return
      void updateSettings({ hiddenTreePaths: remaining }).then(() => {
        setNotice(`已显示 ${restored} 个隐藏项目`)
      })
    },
    [updateSettings]
  )

  const hiddenPickerPaths = useMemo(() => {
    if (!hiddenPickerDir) return []
    return settings.hiddenTreePaths.filter(
      (path) => isWithin(path, hiddenPickerDir) && !samePath(path, hiddenPickerDir)
    )
  }, [hiddenPickerDir, settings.hiddenTreePaths])

  const confirmTrash = useCallback(async () => {
    const target = trashTarget
    if (!target) return
    setTrashTarget(null)
    const result = await window.mdv.trashPath(target.path).catch((err) => ({
      ok: false,
      message: errorMessage(err)
    }))
    if (!result.ok) {
      setNotice(`删除失败：${result.message ?? '未知错误'}`)
      return
    }
    const affected = tabsRef.current.filter((tab) => isWithin(tab.path, target.path))
    if (affected.length) closeTabsNow(affected.map((tab) => tab.path))
    if (rootsRef.current.some((root) => samePath(root, target.path))) removeRoot(target.path)
    setTreeVersion((value) => value + 1)
    setNotice(null)
  }, [closeTabsNow, removeRoot, trashTarget])

  const scrollToHeading = useCallback((id: string) => {
    const target = document.getElementById(id)
    const scroller = readerRef.current
    if (!target || !scroller) return
    const top =
      target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 28
    scroller.scrollTo({ top, behavior: 'smooth' })
  }, [])

  const handleLink = useCallback(
    (href: string) => {
      const tab = tabsRef.current.find((item) => item.path === activeIdRef.current)
      if (!tab) return
      const info = classifyHref(tab.root, href)
      if (info.kind === 'external') void window.mdv.openExternal(info.href)
      else if (info.kind === 'anchor') scrollToHeading(info.hash)
      else if (info.kind === 'doc') void openDoc(info.path, info.hash || undefined)
      else if (info.kind === 'file') {
        void window.mdv.openPath(info.path).catch(() => setNotice('无法打开链接目标'))
      }
    },
    [openDoc, scrollToHeading]
  )

  const handleTaskToggle = useCallback(
    (line: number, checked: boolean) => {
      const tab = tabsRef.current.find((item) => item.path === activeIdRef.current)
      if (!tab || tab.editing || !isMarkdownFile(tab.path)) return
      if (docTier(tab.content.length) !== 'normal') return
      const next = applyTaskToggle(tab.draft ?? tab.content, line, checked)
      if (next === null) return
      updateTab(tab.path, { draft: next })
    },
    [updateTab]
  )

  const handleScroll = useCallback(() => {
    const id = activeIdRef.current
    if (id) scrollMap.current.set(id, ratioOf(readerRef.current))
  }, [])

  const selectAllContent = useCallback(() => {
    const tab = tabsRef.current.find((item) => item.path === activeIdRef.current)
    if (!tab) return
    const editorShown =
      !isMarkdownFile(tab.path) || tab.editing || docTier(tab.content.length) !== 'normal'
    if (editorShown) {
      editorHandle.current?.selectAll()
      return
    }
    const article = document.querySelector('.markdown-body')
    if (!article) return
    const range = document.createRange()
    range.selectNodeContents(article)
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(range)
  }, [])

  const handleAction = useCallback(
    (action: MenuAction, payload?: string) => {
      switch (action) {
        case 'open-file':
          void pickFile()
          break
        case 'open-folder':
          void pickFolder()
          break
        case 'new-file':
          startCreate('file')
          break
        case 'new-folder':
          startCreate('dir')
          break
        case 'open-path':
          if (payload) void openPath(payload)
          break
        case 'save':
          void saveActive()
          break
        case 'toggle-edit':
          toggleEdit()
          break
        case 'close-tab':
          if (activeIdRef.current) requestCloseTab(activeIdRef.current)
          break
        case 'settings':
          setSettingsOpen((open) => !open)
          break
        case 'quit':
          requestQuit()
          break
        case 'undo':
          editorHandle.current?.undo()
          break
        case 'redo':
          editorHandle.current?.redo()
          break
        case 'cut':
          window.mdv.editAction('cut')
          break
        case 'copy':
          window.mdv.editAction('copy')
          break
        case 'paste':
          window.mdv.editAction('paste')
          break
        case 'select-all':
          selectAllContent()
          break
        case 'find':
          openFind()
          break
        case 'toggle-sidebar':
          toggleSidebar()
          break
        case 'set-theme':
          if (isThemePreference(payload)) {
            void updateSettings({ themeMode: payload })
          }
          break
        case 'reload':
          void reloadActive()
          break
        case 'about':
          setAboutOpen(true)
          break
        case 'clear-recents':
          void updateSettings({ recents: [] })
          break
        default:
          break
      }
    },
    [
      pickFile,
      pickFolder,
      openPath,
      startCreate,
      saveActive,
      toggleEdit,
      requestCloseTab,
      requestQuit,
      openFind,
      toggleSidebar,
      updateSettings,
      reloadActive,
      selectAllContent
    ]
  )

  useEffect(() => {
    commandRef.current = handleAction
  }, [handleAction])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const bundle = await window.mdv.getSettings()
        if (cancelled) return
        const saved = bundle.settings
        const restore = saved.restoreSession
        settingsRef.current = saved
        setSettings(saved)
        setTheme(bundle.theme)
        setContentWidth(saved.contentWidth)
        setSidebarWidth(saved.sidebarWidth)
        setCollapsed(saved.sidebarCollapsed)
        rootsRef.current = restore ? saved.roots : []
        setRoots(rootsRef.current)
        const expanded = new Set(restore ? saved.expandedDirs : [])
        if (restore && !expanded.size) saved.roots.forEach((root) => expanded.add(root))
        setExpandedDirs(expanded)
        void window.mdv.appInfo().then((info) => {
          if (!cancelled) setAppInfo(info)
        })
        const pending = await window.mdv.pendingFile()
        for (const path of restore ? saved.openTabs : []) {
          if (cancelled) return
          await openDoc(path, undefined, {
            quiet: true,
            recents: false,
            reveal: false,
            attach: false
          })
        }
        if (restore && saved.activeTab) {
          const tab = tabsRef.current.find((item) => samePath(item.path, saved.activeTab!))
          if (tab) activateTab(tab.path)
        }
        if (pending && !cancelled) await openPath(pending)
      } catch (err) {
        if (!cancelled) setNotice(errorMessage(err))
      } finally {
        if (!cancelled) {
          restoredRef.current = true
          setRestoreTick((value) => value + 1)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activateTab, openDoc, openPath])

  useEffect(() => {
    if (!restoredRef.current) return
    const paths = tabs.map((tab) => tab.path)
    const key = `${activeId ?? ''}\n${paths.join('\n')}`
    if (persistedTabsRef.current === key) return
    persistedTabsRef.current = key
    void updateSettings({ openTabs: paths, activeTab: activeId })
  }, [activeId, restoreTick, tabs, updateSettings])

  useEffect(() => {
    if (!restoredRef.current) return
    void updateSettings({ roots })
  }, [restoreTick, roots, updateSettings])

  useEffect(() => {
    if (!restoredRef.current) return
    void updateSettings({ expandedDirs: [...expandedDirs] })
  }, [expandedDirs, restoreTick, updateSettings])

  useEffect(() => {
    const offs = [
      window.mdv.onDocOpen((path) => {
        void openPath(path)
      }),
      window.mdv.onDocChanged((payload) => {
        if (!payload) return
        const tab = tabsRef.current.find((item) => samePath(item.path, payload.path))
        if (!tab || Math.abs(payload.mtimeMs - tab.mtimeMs) < 1) return
        void window.mdv
          .readDoc(payload.path)
          .then((next) => {
            const target = tabsRef.current.find((item) => samePath(item.path, payload.path))
            if (!target) return
            if (target.editing || target.draft !== null) {
              if (isDirty(target)) {
                updateTab(target.path, {
                  externalChanged: true,
                  externalDisk: { diskContent: next.content, diskMtimeMs: next.mtimeMs }
                })
              } else {
                updateTab(target.path, {
                  content: next.content,
                  mtimeMs: next.mtimeMs,
                  draft: next.content
                })
              }
              return
            }
            updateTab(target.path, { content: next.content, mtimeMs: next.mtimeMs })
          })
          .catch(() => {})
      }),
      window.mdv.onDocDeleted((payload) => {
        const tab = tabsRef.current.find((item) => samePath(item.path, payload.path))
        if (tab) {
          updateTab(tab.path, { banner: '文件已被删除或移动，保存将重新创建该文件。' })
        }
      }),
      window.mdv.onCloseRequest(() => requestQuit()),
      window.mdv.onPathsDropped((paths) => {
        void openPaths(paths)
      })
    ]
    return () => offs.forEach((off) => off())
  }, [openPath, openPaths, requestQuit, updateTab])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (document.querySelector('.modal[aria-modal="true"]')) return
      if (event.key === 'F5') {
        event.preventDefault()
        commandRef.current('reload')
        return
      }
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key.toLowerCase()
      if (key === 'o') {
        event.preventDefault()
        commandRef.current(event.shiftKey ? 'open-folder' : 'open-file')
      } else if (key === 's') {
        event.preventDefault()
        commandRef.current('save')
      } else if (key === 'e') {
        event.preventDefault()
        commandRef.current('toggle-edit')
      } else if (key === 'a') {
        const target = event.target as HTMLElement | null
        if (target?.closest?.('input, textarea, [contenteditable="true"]')) return
        event.preventDefault()
        commandRef.current('select-all')
      } else if (key === 'f') {
        event.preventDefault()
        commandRef.current('find')
      } else if (key === 'b') {
        event.preventDefault()
        commandRef.current('toggle-sidebar')
      } else if (key === 'w') {
        event.preventDefault()
        commandRef.current('close-tab')
      } else if (key === 'tab') {
        event.preventDefault()
        const list = tabsRef.current
        if (list.length < 2 || !activeIdRef.current) return
        const index = list.findIndex((tab) => tab.path === activeIdRef.current)
        if (index < 0) return
        const step = event.shiftKey ? -1 : 1
        const next = list[(index + step + list.length) % list.length]
        if (next) activateTab(next.path)
      } else if (key === ',') {
        event.preventDefault()
        commandRef.current('settings')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [activateTab])

  useLayoutEffect(() => {
    const scroller = readerRef.current
    if (!scroller || !active || active.editing || !isMarkdownFile(active.path)) return
    if (isLargeDoc(active.content.length)) return
    const ratio = scrollMap.current.get(active.path) ?? 0
    scroller.scrollTop = ratio * Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  }, [activeId, active?.content, active?.mtimeMs, active?.editing])

  useEffect(() => {
    const needsEditor =
      !!active &&
      (active.editing || !isMarkdownFile(active.path) || isLargeDoc(active.content.length))
    if (!needsEditor) {
      editorHandle.current = null
      return
    }
    if (!active?.editing) return
    const timer = window.setTimeout(() => editorHandle.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [activeId, active?.editing])

  useEffect(() => {
    if (!active || !pendingHash) return
    const hash = pendingHash
    const timer = window.setTimeout(() => {
      const target = document.getElementById(hash)
      const scroller = readerRef.current
      if (target && scroller) {
        const top =
          target.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop -
          28
        scroller.scrollTo({ top, behavior: 'smooth' })
      }
      setPendingHash(null)
    }, 140)
    return () => window.clearTimeout(timer)
  }, [active, pendingHash])

  const onPromptSave = async (): Promise<void> => {
    const current = prompt
    if (!current) return
    setPrompt(null)
    const result = await saveTab(current.path)
    if (result === 'ok') continuePrompt(current)
    else if (result === 'conflict') pendingPrompt.current = current
  }

  const onPromptDiscard = (): void => {
    const current = prompt
    if (!current) return
    setPrompt(null)
    updateTab(current.path, { draft: null, externalChanged: false, externalDisk: null })
    continuePrompt(current)
  }

  const cancelPrompt = (): void => {
    setPrompt(null)
  }

  const confirmBatchClose = (): void => {
    const current = batchClose
    if (!current) return
    setBatchClose(null)
    closeTabsNow(current.paths)
  }

  const resolveOverwrite = async (): Promise<void> => {
    const current = conflict
    const next = pendingPrompt.current
    setConflict(null)
    if (!current) return
    const result = await saveTab(current.path, true)
    if (result === 'ok' && next) {
      pendingPrompt.current = null
      continuePrompt(next)
    }
  }

  const resolveReload = (): void => {
    const current = conflict
    const next = pendingPrompt.current
    setConflict(null)
    pendingPrompt.current = null
    if (current) {
      updateTab(current.path, (tab) => ({
        content: current.diskContent,
        mtimeMs: current.diskMtimeMs,
        draft: tab.draft === null ? null : current.diskContent,
        externalChanged: false,
        externalDisk: null
      }))
    }
    if (next) continuePrompt(next)
  }

  const cancelConflict = (): void => {
    setConflict(null)
    pendingPrompt.current = null
  }

  const loadExternalDisk = (tab: DocTab): void => {
    const disk = tab.externalDisk
    if (!disk) return
    updateTab(tab.path, {
      content: disk.diskContent,
      mtimeMs: disk.diskMtimeMs,
      draft: tab.draft === null ? null : disk.diskContent,
      externalChanged: false,
      externalDisk: null
    })
  }

  const keepLocalEdit = (tab: DocTab): void => {
    updateTab(tab.path, { externalChanged: false, externalDisk: null })
  }

  const docKey = active
    ? `${active.path}#${active.mtimeMs}#${active.content.length}#${active.editing ? 'e' : 'v'}`
    : ''

  const activeIsMd = active ? isMarkdownFile(active.path) : false
  const activeTier = active ? docTier(active.content.length) : 'normal'
  const activeLite = activeTier !== 'normal'
  const activeHuge = activeTier === 'huge'
  const activeLongLine = useMemo(() => {
    const content = active?.content ?? ''
    return activeLite ? hasVeryLongLine(content) : false
  }, [active?.content, activeLite])
  const mdAsSource = activeIsMd && activeLite
  const showPreview = !!active && activeIsMd && !active.editing && !mdAsSource
  const showEditor = !!active && (!activeIsMd || mdAsSource || active.editing)
  const codeReadOnly = !!active && !active.editing && (!activeIsMd || mdAsSource)

  const statusLeft = !active
    ? ''
    : activeLite
      ? `${active.name} · 大文件模式${
          active.editing
            ? `${dirty ? ' · 未保存的修改' : ''}${
                active.externalChanged ? ' · 文件已在外部修改' : ''
              }`
            : ' · 只读'
        }`
      : codeReadOnly
        ? `${active.name} · 只读`
        : `${dirty ? '未保存的修改' : '已保存'}${
            active.externalChanged ? ' · 文件已在外部修改' : ''
          }`

  const statusRight = activeLite
    ? active?.editing
      ? 'Ctrl+S 保存 · Ctrl+E 阅读 · Ctrl+F 在编辑器内查找'
      : 'Ctrl+E 编辑 · Ctrl+F 查找'
    : codeReadOnly
      ? 'Ctrl+E 编辑 · Ctrl+F 查找'
      : 'Ctrl+S 保存 · Ctrl+E 阅读 · Ctrl+F 在编辑器内查找'

  const tabInfos: TabInfo[] = tabs.map((tab) => ({
    path: tab.path,
    name: tab.name,
    dirty: isDirty(tab)
  }))

  const menuState: MenuState = {
    hasDoc: !!active,
    editing: !!active?.editing,
    dirty,
    sidebarCollapsed: collapsed,
    themeMode: settings.themeMode,
    recents: settings.recents
  }

  const promptTab = prompt ? tabs.find((tab) => tab.path === prompt.path) : null
  const batchDirtyNames = batchClose?.dirty ?? []
  const batchDirtySummary = `${batchDirtyNames.slice(0, 3).join('、')}${
    batchDirtyNames.length > 3 ? ' 等' : ''
  }`
  const trashDirtyCount = trashTarget
    ? tabs.filter((tab) => isWithin(tab.path, trashTarget.path) && isDirty(tab)).length
    : 0

  return (
    <div className="app">
      <TitleBar
        state={menuState}
        onAction={handleAction}
        sidebarCollapsed={collapsed}
        onToggleSidebar={toggleSidebar}
      />

      <div className="app-body">
        <Sidebar
          roots={roots}
          tab={sidebarTab}
          onTab={setSidebarTab}
          currentPath={active?.path ?? null}
          docKey={docKey}
          collapsed={collapsed}
          width={sidebarWidth}
          treeVersion={treeVersion}
          expanded={expandedDirs}
          hiddenPaths={settings.hiddenTreePaths}
          scrollRef={readerRef}
          onToggleDir={toggleDir}
          onOpen={(path) => void openDoc(path)}
          onCreateIn={handleTreeCreate}
          onReveal={handleReveal}
          onTrash={requestTrash}
          onHideEntry={hideTreeEntry}
          onPickHidden={openHiddenPicker}
          onRemoveRoot={removeRoot}
          onResizeCommit={persistSidebarWidth}
        />

        <div className={`main${active?.editing ? ' editing' : ''}${showEditor ? ' has-editor' : ''}`}>
          <TabBar
            tabs={tabInfos}
            activePath={active?.path ?? null}
            onActivate={(path) => activateTab(path)}
            onClose={requestCloseTab}
            onClosePaths={requestClosePaths}
            onNew={() => startCreate('file')}
          />

          {notice || active?.banner || active?.externalChanged ? (
            <div className="banner-slot">
              {notice ? (
                <div className="banner">
                  <span className="banner-text">{notice}</span>
                  <span className="banner-actions">
                    <button
                      type="button"
                      className="mini-btn"
                      title="关闭"
                      onClick={() => setNotice(null)}
                    >
                      <CloseIcon />
                    </button>
                  </span>
                </div>
              ) : null}
              {active?.banner ? (
                <div className="banner">
                  <span className="banner-text">{active.banner}</span>
                  <span className="banner-actions">
                    <button
                      type="button"
                      className="mini-btn"
                      title="关闭"
                      onClick={() => updateTab(active.path, { banner: null })}
                    >
                      <CloseIcon />
                    </button>
                  </span>
                </div>
              ) : null}
              {active?.externalChanged ? (
                <div className="banner warn">
                  <span className="banner-text">文件已在外部被修改，当前编辑基于旧版本。</span>
                  <span className="banner-actions">
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => loadExternalDisk(active)}
                    >
                      加载磁盘版本
                    </button>
                    <button type="button" className="mini-btn" onClick={() => keepLocalEdit(active)}>
                      保留我的编辑
                    </button>
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={`reader-wrap${active && !showPreview ? ' is-hidden' : ''}`}>
            <div className="reader" ref={readerRef} onScroll={handleScroll}>
              {showPreview && active ? (
                <div className="doc">
                  <article className="markdown-body">
                    <MarkdownDocument
                      content={previewContent}
                      baseDir={active.root}
                      theme={theme}
                      onLink={handleLink}
                      onTaskToggle={handleTaskToggle}
                    />
                  </article>
                  <footer className="doc-foot">
                    {active.name} · {new Date(active.mtimeMs).toLocaleString('zh-CN')}
                    {dirty ? ' · 有未保存的修改' : ''}
                  </footer>
                </div>
              ) : active ? null : (
                <EmptyState
                  recents={settings.recents}
                  onOpen={(path) => void openDoc(path)}
                  onOpenFile={() => void pickFile()}
                  onOpenFolder={() => void pickFolder()}
                />
              )}
            </div>

            {showPreview && active ? (
              <SearchBar
                open={active.searchOpen}
                docKey={docKey}
                scroller={readerRef}
                onClose={() => closeSearch(active.path)}
              />
            ) : null}
          </div>

          {showEditor && active ? (
            <div className="editor-pane">
              <Suspense fallback={<div className="editor-fallback">正在加载编辑器…</div>}>
                <Editor
                  key={active.path}
                  value={active.draft ?? active.content}
                  theme={theme}
                  wordWrap={settings.editorWordWrap && !activeLongLine}
                  showLineNumbers={settings.editorLineNumbers}
                  language={activeIsMd ? 'markdown' : languageKeyForPath(active.path)}
                  readOnly={!active.editing}
                  lite={activeLite}
                  onChange={(next) => updateTab(active.path, { draft: next })}
                  onReady={(handle) => {
                    editorHandle.current = handle
                  }}
                />
              </Suspense>
              <div className="editor-status">
                <span>{statusLeft}</span>
                <span className="status-actions">
                  {statusRight}
                  {activeHuge && !active.editing ? (
                    <button type="button" className="mini-btn" onClick={toggleEdit}>
                      启用编辑
                    </button>
                  ) : null}
                </span>
              </div>
            </div>
          ) : null}

          {active ? (
            <div className="float-actions" role="toolbar" aria-label="文档操作">
              <button
                type="button"
                className={`float-btn${active.editing ? ' active' : ''}`}
                title={activeIsMd ? '编辑 Markdown (Ctrl+E)' : '编辑文本 (Ctrl+E)'}
                aria-pressed={active.editing}
                onClick={() => {
                  if (!active.editing) toggleEdit()
                }}
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                className={`float-btn${active.editing ? '' : ' active'}`}
                title="阅读模式 (Ctrl+E)"
                aria-pressed={!active.editing}
                onClick={() => {
                  if (active.editing) toggleEdit()
                }}
              >
                <EyeIcon />
              </button>
              <button
                type="button"
                className={`float-btn${active.searchOpen ? ' active' : ''}`}
                title="查找 (Ctrl+F)"
                aria-pressed={active.searchOpen}
                onClick={toggleSearch}
              >
                <SearchIcon />
              </button>
              <WidthControl
                open={widthOpen}
                width={contentWidth}
                min={MIN_CONTENT_WIDTH}
                max={MAX_CONTENT_WIDTH}
                onToggle={toggleWidthPanel}
                onChange={setContentWidth}
                onCommit={persistWidth}
                onClose={closeWidthPanel}
              />
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={!!prompt}
        title="保存修改？"
        message={`“${promptTab?.name ?? prompt?.name ?? ''}”有未保存的修改。`}
        detail={
          prompt?.kind === 'quit' ? '关闭应用将丢失这些修改。' : '关闭标签页将丢失这些修改。'
        }
        actions={[
          { label: '保存并继续', tone: 'primary', onClick: () => void onPromptSave() },
          { label: '不保存', onClick: onPromptDiscard },
          { label: '取消', tone: 'plain', onClick: cancelPrompt }
        ]}
        onCancel={cancelPrompt}
      />

      <ConfirmDialog
        open={!!trashTarget}
        title="移到回收站？"
        message={`“${trashTarget?.name ?? ''}”将被移到回收站。`}
        detail={
          trashTarget
            ? `${
                trashTarget.isDir
                  ? '该文件夹及其中的所有内容都会移到回收站，可从回收站恢复。'
                  : '可从系统回收站恢复。'
              }${trashDirtyCount ? `其中 ${trashDirtyCount} 个标签页的未保存修改会丢失。` : ''}`
            : ''
        }
        actions={[
          { label: '移到回收站', tone: 'danger', onClick: () => void confirmTrash() },
          { label: '取消', tone: 'plain', onClick: () => setTrashTarget(null) }
        ]}
        onCancel={() => setTrashTarget(null)}
      />

      <ConfirmDialog
        open={!!batchClose}
        title="关闭未保存的标签页？"
        message={`${batchDirtyNames.length} 个标签页有未保存的修改：${batchDirtySummary}`}
        detail="继续关闭将丢失这些修改。"
        actions={[
          { label: '不保存并关闭', tone: 'danger', onClick: confirmBatchClose },
          { label: '取消', tone: 'plain', onClick: () => setBatchClose(null) }
        ]}
        onCancel={() => setBatchClose(null)}
      />

      <ConfirmDialog
        open={!!conflict}
        title="文件已在外部被修改"
        message={`“${conflict?.name ?? ''}”在保存前已被其他程序改动，直接写入会覆盖这些改动。`}
        detail="可以选择覆盖磁盘，或放弃当前编辑并加载磁盘版本。"
        actions={[
          { label: '覆盖磁盘', tone: 'danger', onClick: () => void resolveOverwrite() },
          { label: '加载磁盘版本', onClick: resolveReload },
          { label: '取消', tone: 'plain', onClick: cancelConflict }
        ]}
        onCancel={cancelConflict}
      />

      <ConfirmDialog
        open={!!hugeEdit}
        title="编辑超大文件？"
        message={`“${hugeEdit?.name ?? ''}”超过 2000 万字符，默认以只读方式打开。`}
        detail="在这种规模下输入、查找与保存都可能明显变慢。仍要进入编辑模式吗？"
        actions={[
          { label: '仍然编辑', tone: 'primary', onClick: confirmLargeEdit },
          { label: '取消', tone: 'plain', onClick: () => setHugeEdit(null) }
        ]}
        onCancel={() => setHugeEdit(null)}
      />

      <HiddenRestoreDialog
        open={hiddenPickerDir !== null}
        dir={hiddenPickerDir}
        paths={hiddenPickerPaths}
        onConfirm={restoreHiddenPaths}
        onCancel={() => setHiddenPickerDir(null)}
      />

      <NewEntryDialog
        open={createKind !== null}
        kind={createKind ?? 'file'}
        dir={createKind ? createTargetDir() : null}
        defaultExt={settings.newFileExt}
        busy={createBusy}
        error={createError}
        onSubmit={(name) => void submitCreate(name)}
        onCancel={cancelCreate}
      />

      <AboutDialog
        open={aboutOpen}
        version={appInfo?.version ?? ''}
        onClose={() => setAboutOpen(false)}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onPatch={updateSettings}
        onReset={resetSettings}
      />
    </div>
  )
}
