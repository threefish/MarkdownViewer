import { app, nativeTheme } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ContentFont, Settings, ThemeMode, ThemePreference, WindowBounds } from '../shared/types'
import { isTextFile } from '../shared/fileKinds'
import { isDarkTheme, isThemePreference } from '../shared/themes'

function systemTheme(): ThemeMode {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function normalizeTheme(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : 'system'
}

export function resolveThemeMode(preference: ThemePreference): ThemeMode {
  if (preference === 'system') return systemTheme()
  return preference
}

export function applyNativeTheme(preference: ThemePreference): void {
  nativeTheme.themeSource =
    preference === 'system' ? 'system' : isDarkTheme(preference) ? 'dark' : 'light'
}

const CONTENT_FONTS = new Set<ContentFont>(['sans', 'serif', 'songti', 'kaiti', 'fangsong'])

function normalizeFontFamily(value: unknown): ContentFont {
  return typeof value === 'string' && CONTENT_FONTS.has(value as ContentFont)
    ? (value as ContentFont)
    : 'sans'
}

function normalizeBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeNewFileExt(value: unknown): string {
  if (typeof value !== 'string') return 'md'
  const ext = value.trim().replace(/^\./, '').toLowerCase()
  if (!/^[a-z0-9]+$/.test(ext) || !isTextFile(`new.${ext}`)) return 'md'
  return ext
}

// 空串表示与文档同目录；非法路径回落到默认 assets，避免把图片写到文档目录之外。
function normalizePastedImageDir(value: unknown): string {
  if (typeof value !== 'string') return 'assets'
  const dir = value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '')
  if (!dir || dir === '.') return ''
  if (dir.length > 120 || /^[a-zA-Z]:/.test(dir) || dir.startsWith('/')) return 'assets'
  if (/[<>:"|?*%#\u0000-\u001f]/.test(dir)) return 'assets'
  const segments = dir.split('/')
  if (segments.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part))) {
    return 'assets'
  }
  return dir
}

let cache: Settings | null = null

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

const MIN_WIDTH = 600
const MAX_WIDTH = 1200
export const DEFAULT_WIDTH = 860

const MIN_SIDEBAR = 220
const MAX_SIDEBAR = 520
export const DEFAULT_SIDEBAR = 284

const MIN_SETTINGS_DRAWER = 360
const MAX_SETTINGS_DRAWER = 720
export const DEFAULT_SETTINGS_DRAWER = 460

const MIN_FONT = 12
const MAX_FONT = 24
export const DEFAULT_FONT = 16

const MIN_LEADING = 1.5
const MAX_LEADING = 2
export const DEFAULT_LEADING = 1.78

const MIN_EDITOR_FONT = 12
const MAX_EDITOR_FONT = 20
export const DEFAULT_EDITOR_FONT = 13.5

const MIN_WINDOW_WIDTH = 760
const MIN_WINDOW_HEIGHT = 480

function normalizeWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_WIDTH
  if (value === 0) return 0
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)))
}

function normalizeSidebar(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SIDEBAR
  return Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, Math.round(value)))
}

function normalizeSettingsDrawer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS_DRAWER
  return Math.min(MAX_SETTINGS_DRAWER, Math.max(MIN_SETTINGS_DRAWER, Math.round(value)))
}

function normalizeFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_FONT
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(value)))
}

function normalizeLeading(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LEADING
  return Math.round(Math.min(MAX_LEADING, Math.max(MIN_LEADING, value)) * 100) / 100
}

function normalizeEditorFont(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_EDITOR_FONT
  return Math.round(Math.min(MAX_EDITOR_FONT, Math.max(MIN_EDITOR_FONT, value)) * 2) / 2
}

function normalizeBounds(value: unknown): WindowBounds | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<WindowBounds>
  const parts = [raw.x, raw.y, raw.width, raw.height]
  if (!parts.every((item) => typeof item === 'number' && Number.isFinite(item))) return null
  return {
    x: Math.round(raw.x as number),
    y: Math.round(raw.y as number),
    width: Math.max(MIN_WINDOW_WIDTH, Math.round(raw.width as number)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.round(raw.height as number))
  }
}

function normalizePathList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string' || !path.isAbsolute(item)) continue
    const clean = item.replace(/[\\/]+$/, '')
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
    if (out.length >= max) break
  }
  return out
}

function normalizeActive(value: unknown, tabs: string[]): string | null {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return null
  return tabs.some((tab) => tab.toLowerCase() === value.toLowerCase()) ? value : null
}

function defaults(): Settings {
  return {
    themeMode: 'system',
    sidebarCollapsed: false,
    sidebarWidth: DEFAULT_SIDEBAR,
    settingsWidth: DEFAULT_SETTINGS_DRAWER,
    contentWidth: DEFAULT_WIDTH,
    contentFontSize: DEFAULT_FONT,
    contentFontFamily: 'sans',
    contentLineHeight: DEFAULT_LEADING,
    editorFontSize: DEFAULT_EDITOR_FONT,
    editorWordWrap: true,
    editorLineNumbers: true,
    pastedImageDir: 'assets',
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
}

export function getSettings(): Settings {
  if (cache) return cache
  try {
    const raw = readFileSync(settingsFile(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Settings> & { lastRoot?: unknown }
    const roots = normalizePathList(parsed.roots, 12)
    const legacyRoot = normalizePathList(parsed.lastRoot ? [parsed.lastRoot] : [], 1)
    const openTabs = normalizePathList(parsed.openTabs, 30)
    cache = {
      ...defaults(),
      ...parsed,
      themeMode: normalizeTheme(parsed.themeMode),
      contentWidth: normalizeWidth(parsed.contentWidth),
      contentFontSize: normalizeFontSize(parsed.contentFontSize),
      contentFontFamily: normalizeFontFamily(parsed.contentFontFamily),
      contentLineHeight: normalizeLeading(parsed.contentLineHeight),
      editorFontSize: normalizeEditorFont(parsed.editorFontSize),
      editorWordWrap: normalizeBool(parsed.editorWordWrap, true),
      editorLineNumbers: normalizeBool(parsed.editorLineNumbers, true),
      pastedImageDir: normalizePastedImageDir(parsed.pastedImageDir),
      newFileExt: normalizeNewFileExt(parsed.newFileExt),
      restoreSession: normalizeBool(parsed.restoreSession, true),
      hideNoisyEntries: normalizeBool(parsed.hideNoisyEntries, true),
      rememberWindowBounds: normalizeBool(parsed.rememberWindowBounds, true),
      windowBounds: normalizeBounds(parsed.windowBounds),
      windowMaximized: normalizeBool(parsed.windowMaximized, false),
      sidebarWidth: normalizeSidebar(parsed.sidebarWidth),
      settingsWidth: normalizeSettingsDrawer(parsed.settingsWidth),
      roots: roots.length ? roots : legacyRoot,
      openTabs,
      activeTab: normalizeActive(parsed.activeTab, openTabs),
      expandedDirs: normalizePathList(parsed.expandedDirs, 300),
      hiddenTreePaths: normalizePathList(parsed.hiddenTreePaths, 200),
      recents: Array.isArray(parsed.recents) ? parsed.recents.slice(0, 12) : []
    }
  } catch {
    cache = defaults()
  }
  return cache
}

export function patchSettings(patch: Partial<Settings>): Settings {
  const next: Settings = { ...getSettings(), ...patch }
  if (patch.themeMode !== undefined) next.themeMode = normalizeTheme(patch.themeMode)
  if (patch.contentWidth !== undefined) next.contentWidth = normalizeWidth(patch.contentWidth)
  if (patch.contentFontSize !== undefined)
    next.contentFontSize = normalizeFontSize(patch.contentFontSize)
  if (patch.contentFontFamily !== undefined)
    next.contentFontFamily = normalizeFontFamily(patch.contentFontFamily)
  if (patch.contentLineHeight !== undefined)
    next.contentLineHeight = normalizeLeading(patch.contentLineHeight)
  if (patch.editorFontSize !== undefined)
    next.editorFontSize = normalizeEditorFont(patch.editorFontSize)
  if (patch.editorWordWrap !== undefined)
    next.editorWordWrap = normalizeBool(patch.editorWordWrap, true)
  if (patch.editorLineNumbers !== undefined)
    next.editorLineNumbers = normalizeBool(patch.editorLineNumbers, true)
  if (patch.pastedImageDir !== undefined)
    next.pastedImageDir = normalizePastedImageDir(patch.pastedImageDir)
  if (patch.newFileExt !== undefined) next.newFileExt = normalizeNewFileExt(patch.newFileExt)
  if (patch.restoreSession !== undefined)
    next.restoreSession = normalizeBool(patch.restoreSession, true)
  if (patch.hideNoisyEntries !== undefined)
    next.hideNoisyEntries = normalizeBool(patch.hideNoisyEntries, true)
  if (patch.rememberWindowBounds !== undefined)
    next.rememberWindowBounds = normalizeBool(patch.rememberWindowBounds, true)
  if (patch.windowBounds !== undefined) next.windowBounds = normalizeBounds(patch.windowBounds)
  if (patch.windowMaximized !== undefined)
    next.windowMaximized = normalizeBool(patch.windowMaximized, false)
  if (patch.sidebarWidth !== undefined) next.sidebarWidth = normalizeSidebar(patch.sidebarWidth)
  if (patch.settingsWidth !== undefined)
    next.settingsWidth = normalizeSettingsDrawer(patch.settingsWidth)
  if (patch.roots !== undefined) next.roots = normalizePathList(patch.roots, 12)
  if (patch.openTabs !== undefined) next.openTabs = normalizePathList(patch.openTabs, 30)
  if (patch.expandedDirs !== undefined) next.expandedDirs = normalizePathList(patch.expandedDirs, 300)
  if (patch.hiddenTreePaths !== undefined)
    next.hiddenTreePaths = normalizePathList(patch.hiddenTreePaths, 200)
  if (patch.activeTab !== undefined) next.activeTab = normalizeActive(patch.activeTab, next.openTabs)
  cache = next
  try {
    const dir = path.dirname(settingsFile())
    mkdirSync(dir, { recursive: true })
    const tmp = settingsFile() + '.tmp'
    writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
    renameSync(tmp, settingsFile())
  } catch (err) {
    console.error('[settings] write failed', err)
  }
  return next
}

export function resetPreferences(): Settings {
  const base = defaults()
  return patchSettings({
    themeMode: base.themeMode,
    sidebarCollapsed: base.sidebarCollapsed,
    sidebarWidth: base.sidebarWidth,
    settingsWidth: base.settingsWidth,
    contentWidth: base.contentWidth,
    contentFontSize: base.contentFontSize,
    contentFontFamily: base.contentFontFamily,
    contentLineHeight: base.contentLineHeight,
    editorFontSize: base.editorFontSize,
    editorWordWrap: base.editorWordWrap,
    editorLineNumbers: base.editorLineNumbers,
    newFileExt: base.newFileExt,
    restoreSession: base.restoreSession,
    hideNoisyEntries: base.hideNoisyEntries,
    rememberWindowBounds: base.rememberWindowBounds
  })
}
