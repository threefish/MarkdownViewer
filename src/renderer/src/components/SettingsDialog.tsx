import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { AssocInfo, AppInfo, ContentFont, Settings, ThemePreference } from '../../../shared/types'
import { THEME_DEFS, type ThemePreview } from '../../../shared/themes'
import { errorMessage } from '../lib/text'
import { CloseIcon } from './Icons'

interface Props {
  open: boolean
  settings: Settings
  onClose: () => void
  onPatch: (patch: Partial<Settings>) => Promise<void>
  onReset: () => Promise<void>
}

const ASSOC_TEXT: Record<AssocInfo['state'], string> = {
  ok: '已关联，双击 .md 会使用本应用打开',
  stale: '关联指向旧位置（程序目录被移动过），请修复',
  notRegistered: '尚未注册 .md 文件关联',
  otherApp: '系统仍优先用其他应用打开 .md'
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; preview: ThemePreview | null }> = [
  { value: 'system', label: '跟随系统', preview: null },
  ...THEME_DEFS.map((theme) => ({
    value: theme.value as ThemePreference,
    label: theme.label,
    preview: theme.preview
  }))
]

const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 24

const MIN_LEADING = 1.5
const MAX_LEADING = 2
const LEADING_STEP = 0.02

const MIN_EDITOR_FONT = 12
const MAX_EDITOR_FONT = 20
const EDITOR_FONT_STEP = 0.5

const MIN_DRAWER_WIDTH = 360
const MAX_DRAWER_WIDTH = 720

const FONT_OPTIONS: Array<{ value: ContentFont; label: string }> = [
  { value: 'sans', label: '默认' },
  { value: 'serif', label: '衬线' },
  { value: 'songti', label: '宋体' },
  { value: 'kaiti', label: '楷体' },
  { value: 'fangsong', label: '仿宋' }
]

const NEW_FILE_EXTS: Array<{ value: string; label: string }> = [
  { value: 'md', label: 'Markdown (.md)' },
  { value: 'markdown', label: 'Markdown (.markdown)' },
  { value: 'excalidraw', label: 'Excalidraw 画板 (.excalidraw)' },
  { value: 'txt', label: '纯文本 (.txt)' },
  { value: 'log', label: '日志 (.log)' },
  { value: 'csv', label: 'CSV (.csv)' },
  { value: 'json', label: 'JSON (.json)' },
  { value: 'yml', label: 'YAML (.yml)' },
  { value: 'toml', label: 'TOML (.toml)' },
  { value: 'html', label: 'HTML (.html)' },
  { value: 'css', label: 'CSS (.css)' },
  { value: 'js', label: 'JavaScript (.js)' },
  { value: 'ts', label: 'TypeScript (.ts)' },
  { value: 'py', label: 'Python (.py)' },
  { value: 'java', label: 'Java (.java)' },
  { value: 'go', label: 'Go (.go)' },
  { value: 'rs', label: 'Rust (.rs)' },
  { value: 'sh', label: 'Shell (.sh)' },
  { value: 'sql', label: 'SQL (.sql)' }
]

function splitPath(value: string): { name: string; dir: string } {
  const normalized = value.replace(/[\\/]+$/, '')
  const index = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  return {
    name: index >= 0 ? normalized.slice(index + 1) : normalized,
    dir: index > 0 ? normalized.slice(0, index) : ''
  }
}

export function SettingsDialog({
  open,
  settings,
  onClose,
  onPatch,
  onReset
}: Props): React.JSX.Element | null {
  const drawerRef = useRef<HTMLElement>(null)
  const [assoc, setAssoc] = useState<AssocInfo | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [fontPreview, setFontPreview] = useState<number | null>(null)
  const [leadingPreview, setLeadingPreview] = useState<number | null>(null)
  const [editorFontPreview, setEditorFontPreview] = useState<number | null>(null)
  const [resetArmed, setResetArmed] = useState(false)
  const [resetNote, setResetNote] = useState<string | null>(null)
  const [drawerWidth, setDrawerWidth] = useState(settings.settingsWidth)
  const [imageDirDraft, setImageDirDraft] = useState(settings.pastedImageDir)
  const fontSize = fontPreview ?? settings.contentFontSize
  const leading = leadingPreview ?? settings.contentLineHeight
  const editorFont = editorFontPreview ?? settings.editorFontSize
  const newFileExts = NEW_FILE_EXTS.some((option) => option.value === settings.newFileExt)
    ? NEW_FILE_EXTS
    : [...NEW_FILE_EXTS, { value: settings.newFileExt, label: `.${settings.newFileExt}` }]

  useEffect(() => {
    setDrawerWidth(settings.settingsWidth)
  }, [settings.settingsWidth])

  useEffect(() => {
    setImageDirDraft(settings.pastedImageDir)
  }, [settings.pastedImageDir])

  useEffect(() => {
    if (!open) return
    setNote(null)
    void window.mdv.appInfo().then(setInfo).catch(() => setInfo(null))
    void window.mdv
      .assocStatus()
      .then(setAssoc)
      .catch(() => setAssoc(null))
  }, [open])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    drawerRef.current?.focus()
    return () => {
      previous?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('.modal[aria-modal="true"]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (fontPreview === null) return
    document.documentElement.style.setProperty('--prose-size', `${fontPreview}px`)
  }, [fontPreview])

  useEffect(() => {
    if (fontPreview !== null && fontPreview === settings.contentFontSize) setFontPreview(null)
  }, [fontPreview, settings.contentFontSize])

  useEffect(() => {
    if (leadingPreview === null) return
    document.documentElement.style.setProperty('--prose-leading', leadingPreview.toFixed(2))
  }, [leadingPreview])

  useEffect(() => {
    if (leadingPreview !== null && leadingPreview === settings.contentLineHeight)
      setLeadingPreview(null)
  }, [leadingPreview, settings.contentLineHeight])

  useEffect(() => {
    if (editorFontPreview === null) return
    document.documentElement.style.setProperty('--editor-size', `${editorFontPreview}px`)
  }, [editorFontPreview])

  useEffect(() => {
    if (editorFontPreview !== null && editorFontPreview === settings.editorFontSize)
      setEditorFontPreview(null)
  }, [editorFontPreview, settings.editorFontSize])

  useEffect(() => {
    if (open) return
    setFontPreview(null)
    setLeadingPreview(null)
    setEditorFontPreview(null)
    setResetArmed(false)
    setResetNote(null)
    document.documentElement.style.setProperty('--prose-size', `${settings.contentFontSize}px`)
    document.documentElement.style.setProperty('--prose-leading', settings.contentLineHeight.toFixed(2))
    document.documentElement.style.setProperty('--editor-size', `${settings.editorFontSize}px`)
  }, [open, settings.contentFontSize, settings.contentLineHeight, settings.editorFontSize])

  if (!open) return null

  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = drawerWidth
    let current = startWidth
    document.body.classList.add('settings-resizing')
    const onMove = (moveEvent: PointerEvent): void => {
      const max = Math.min(MAX_DRAWER_WIDTH, window.innerWidth - 80)
      current = Math.max(
        MIN_DRAWER_WIDTH,
        Math.min(max, Math.round(startWidth + moveEvent.clientX - startX))
      )
      setDrawerWidth(current)
    }
    const onUp = (): void => {
      document.body.classList.remove('settings-resizing')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (current !== settings.settingsWidth) void onPatch({ settingsWidth: current })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const commitFont = (): void => {
    if (fontPreview === null) return
    if (fontPreview === settings.contentFontSize) {
      setFontPreview(null)
      return
    }
    void onPatch({ contentFontSize: fontPreview })
  }

  const commitLeading = (): void => {
    if (leadingPreview === null) return
    if (leadingPreview === settings.contentLineHeight) {
      setLeadingPreview(null)
      return
    }
    void onPatch({ contentLineHeight: leadingPreview })
  }

  const commitEditorFont = (): void => {
    if (editorFontPreview === null) return
    if (editorFontPreview === settings.editorFontSize) {
      setEditorFontPreview(null)
      return
    }
    void onPatch({ editorFontSize: editorFontPreview })
  }

  const commitImageDir = (): void => {
    const next = imageDirDraft.trim()
    if (next === settings.pastedImageDir) {
      setImageDirDraft(settings.pastedImageDir)
      return
    }
    void onPatch({ pastedImageDir: next })
  }

  const handleReset = async (): Promise<void> => {
    if (!resetArmed) {
      setResetArmed(true)
      setResetNote(null)
      return
    }
    setResetArmed(false)
    try {
      await onReset()
      setFontPreview(null)
      setLeadingPreview(null)
      setEditorFontPreview(null)
      setResetNote('已恢复默认设置。')
    } catch (err) {
      setResetNote(errorMessage(err))
    }
  }

  const act = async (action: 'register' | 'unregister'): Promise<void> => {
    setBusy(true)
    setNote(null)
    try {
      const next =
        action === 'register' ? await window.mdv.assocRegister() : await window.mdv.assocUnregister()
      setAssoc(next)
      setNote(
        action === 'register'
          ? '已写入当前用户的注册表。若双击仍打开其他应用，请在“系统默认应用”里为 .md 选择 Markdown Viewer。'
          : '已移除本应用的文件关联。'
      )
    } catch (err) {
      setNote(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const restoreHidden = (path: string): void => {
    void onPatch({
      hiddenTreePaths: settings.hiddenTreePaths.filter((item) => item !== path)
    })
  }

  return (
    <aside
      ref={drawerRef}
      className="settings-drawer"
      style={{ width: drawerWidth }}
      role="dialog"
      aria-label="设置"
      tabIndex={-1}
    >
      <header className="drawer-head">
        <div className="drawer-title">
          <h2>设置</h2>
          <span>阅读、编辑器与文件树偏好</span>
        </div>
        <button type="button" className="icon-btn" title="关闭 (Esc)" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="drawer-body">
        <section className="settings-card">
          <h3 className="settings-card-title">外观</h3>
          <div className="settings-field">
            <span className="settings-field-label">主题</span>
            <div className="theme-grid" role="radiogroup" aria-label="主题">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.themeMode === option.value}
                  className={`theme-option${settings.themeMode === option.value ? ' active' : ''}`}
                  onClick={() => void onPatch({ themeMode: option.value })}
                >
                  {option.preview ? (
                    <span className="theme-swatch" style={{ background: option.preview.bg }}>
                      <span style={{ background: option.preview.surface }} />
                      <span style={{ background: option.preview.bg }} />
                      <span style={{ background: option.preview.accent }} />
                    </span>
                  ) : (
                    <span className="theme-swatch system" />
                  )}
                  <span className="theme-option-label">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="settings-field">
            <span className="settings-field-label">正文字体</span>
            <div className="segmented fill font-options">
              {FONT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={settings.contentFontFamily === option.value ? 'active' : ''}
                  onClick={() => void onPatch({ contentFontFamily: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span className="setting-row-label">正文字号</span>
            <input
              type="range"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              step={1}
              value={fontSize}
              aria-label="正文字号"
              onChange={(event) => setFontPreview(Number(event.target.value))}
              onPointerUp={commitFont}
              onKeyUp={commitFont}
              onBlur={commitFont}
            />
            <span className="setting-row-value">{fontSize} px</span>
          </div>
          <div className="setting-row">
            <span className="setting-row-label">正文行距</span>
            <input
              type="range"
              min={MIN_LEADING}
              max={MAX_LEADING}
              step={LEADING_STEP}
              value={leading}
              aria-label="正文行距"
              onChange={(event) => setLeadingPreview(Number(event.target.value))}
              onPointerUp={commitLeading}
              onKeyUp={commitLeading}
              onBlur={commitLeading}
            />
            <span className="setting-row-value">{leading.toFixed(2)}</span>
          </div>
        </section>

        <section className="settings-card">
          <h3 className="settings-card-title">编辑器与新建</h3>
          <div className="setting-row">
            <span className="setting-row-label">编辑器字号</span>
            <input
              type="range"
              min={MIN_EDITOR_FONT}
              max={MAX_EDITOR_FONT}
              step={EDITOR_FONT_STEP}
              value={editorFont}
              aria-label="编辑器字号"
              onChange={(event) => setEditorFontPreview(Number(event.target.value))}
              onPointerUp={commitEditorFont}
              onKeyUp={commitEditorFont}
              onBlur={commitEditorFont}
            />
            <span className="setting-row-value">{editorFont.toFixed(1)} px</span>
          </div>
          <div className="setting-row">
            <span className="setting-row-label">显示行号</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.editorLineNumbers}
              aria-label="编辑器与代码阅读显示行号"
              className={`switch${settings.editorLineNumbers ? ' on' : ''}`}
              onClick={() => void onPatch({ editorLineNumbers: !settings.editorLineNumbers })}
            />
          </div>
          <div className="hint">行号与当前行提示显示在编辑器、代码阅读和 Markdown 源码视图中。</div>
          <div className="setting-row">
            <span className="setting-row-label">自动换行</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.editorWordWrap}
              aria-label="编辑器自动换行"
              className={`switch${settings.editorWordWrap ? ' on' : ''}`}
              onClick={() => void onPatch({ editorWordWrap: !settings.editorWordWrap })}
            />
          </div>
          <div className="hint">关闭自动换行后，长行在编辑器内横向滚动。</div>
          <div className="setting-row">
            <span className="setting-row-label">编辑时显示预览</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.editPreview}
              aria-label="编辑时显示预览"
              className={`switch${settings.editPreview ? ' on' : ''}`}
              onClick={() => void onPatch({ editPreview: !settings.editPreview })}
            />
          </div>
          <div className="hint">
            编辑 Markdown 时在右侧显示实时预览，可用 Ctrl+Shift+E 临时切换。大文件与只读模式不适用。
          </div>
          <div className="setting-row">
            <label className="setting-row-label" htmlFor="setting-new-file-ext">
              默认格式
            </label>
            <select
              id="setting-new-file-ext"
              className="setting-select"
              value={settings.newFileExt}
              onChange={(event) => void onPatch({ newFileExt: event.target.value })}
            >
              {newFileExts.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="hint">
            双击标签栏空白处，或点击标签栏右侧的 + 新建文件；文件名会按此格式预填，仍可手动修改。
          </div>
          <div className="setting-row">
            <label className="setting-row-label" htmlFor="setting-pasted-image-dir">
              粘贴图片目录
            </label>
            <input
              id="setting-pasted-image-dir"
              className="setting-input"
              type="text"
              value={imageDirDraft}
              placeholder="assets"
              spellCheck={false}
              onChange={(event) => setImageDirDraft(event.target.value)}
              onBlur={commitImageDir}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                commitImageDir()
                event.currentTarget.blur()
              }}
            />
          </div>
          <div className="hint">
            粘贴截图或剪贴板图片的保存位置，相对当前文档所在目录，如 assets、images；留空表示与文档同目录。
          </div>
        </section>

        <section className="settings-card">
          <h3 className="settings-card-title">启动与文件树</h3>
          <div className="setting-row">
            <span className="setting-row-label">恢复上次会话</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.restoreSession}
              aria-label="启动时恢复上次会话"
              className={`switch${settings.restoreSession ? ' on' : ''}`}
              onClick={() => void onPatch({ restoreSession: !settings.restoreSession })}
            />
          </div>
          <div className="hint">关闭后每次启动从空白窗口开始，不恢复上次的标签页与文件树。</div>
          <div className="setting-row">
            <span className="setting-row-label">记住窗口大小与位置</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.rememberWindowBounds}
              aria-label="记住窗口大小与位置"
              className={`switch${settings.rememberWindowBounds ? ' on' : ''}`}
              onClick={() => void onPatch({ rememberWindowBounds: !settings.rememberWindowBounds })}
            />
          </div>
          <div className="hint">关闭后每次启动使用默认尺寸并居中显示。</div>
          <div className="setting-row">
            <span className="setting-row-label">隐藏点文件与 node_modules</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.hideNoisyEntries}
              aria-label="文件树隐藏点文件与 node_modules"
              className={`switch${settings.hideNoisyEntries ? ' on' : ''}`}
              onClick={() => void onPatch({ hideNoisyEntries: !settings.hideNoisyEntries })}
            />
          </div>
          <div className="hint">仅影响文件树浏览；搜索始终忽略点目录和构建产物。</div>

          <div className="hidden-block">
            <div className="hidden-head">
              <span className="hidden-title">已隐藏的项目</span>
              <button
                type="button"
                className="text-btn"
                disabled={!settings.hiddenTreePaths.length}
                onClick={() => void onPatch({ hiddenTreePaths: [] })}
              >
                全部恢复
              </button>
            </div>
            {settings.hiddenTreePaths.length ? (
              <ul className="hidden-list">
                {settings.hiddenTreePaths.map((path) => {
                  const { name, dir } = splitPath(path)
                  return (
                    <li key={path} className="hidden-row" title={path}>
                      <span className="hidden-name">{name}</span>
                      <span className="hidden-dir">{dir}</span>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => restoreHidden(path)}
                      >
                        恢复
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="hidden-empty">
                暂无隐藏项目。在文件树中右键文件或文件夹，选择“从文件树隐藏”。
              </p>
            )}
          </div>
        </section>

        <section className="settings-card">
          <h3 className="settings-card-title">文件关联</h3>
          <div className="assoc-status">
            <span className={`dot ${assoc?.state ?? 'unknown'}`} />
            <span>{assoc ? ASSOC_TEXT[assoc.state] : '正在读取…'}</span>
          </div>
          {assoc?.state === 'otherApp' && assoc.userChoiceProgId ? (
            <div className="hint">系统当前关联：{assoc.userChoiceProgId}</div>
          ) : null}
          <div className="assoc-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void act('register')}
            >
              {assoc?.state === 'stale' ? '修复关联' : '注册关联'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void act('unregister')}>
              取消关联
            </button>
            <button type="button" className="btn" onClick={() => void window.mdv.openDefaultApps()}>
              系统默认应用
            </button>
          </div>
          <div className="hint">
            Windows 10/11 不允许程序静默设为默认：注册后若仍被其他应用接管，请在系统“默认应用”中为 .md
            选择 Markdown Viewer，只需一次。
          </div>
          {note ? <div className="note">{note}</div> : null}
        </section>

        <section className="settings-card">
          <h3 className="settings-card-title">关于与数据</h3>
          <div className="meta-row">
            <span>版本</span>
            <span>{info?.version ?? '—'}</span>
          </div>
          <div className="meta-row">
            <span>程序位置</span>
            <span className="mono path" title={info?.exePath ?? ''}>
              {info?.exePath ?? '—'}
            </span>
          </div>
          <div className="meta-row">
            <span>运行方式</span>
            <span>{info ? (info.isPackaged ? '绿色版' : '开发模式') : '—'}</span>
          </div>

          <div className="settings-divider" />

          <div className="settings-inline">
            <span className="settings-field-label">最近打开</span>
            <span className="settings-inline-note">
              {settings.recents.length ? `${settings.recents.length} 项` : '暂无记录'}
            </span>
            <button
              type="button"
              className="text-btn"
              disabled={!settings.recents.length}
              onClick={() => void onPatch({ recents: [] })}
            >
              清空
            </button>
          </div>

          <div className="settings-divider" />

          <button
            type="button"
            className={`btn${resetArmed ? ' primary' : ''}`}
            onClick={() => void handleReset()}
          >
            {resetArmed ? '再次点击确认恢复' : '恢复默认设置'}
          </button>
          <div className="hint">
            恢复主题、字体、行距、正文宽度、编辑器、新建文件格式与启动行为；不清空文件树、标签页、最近记录、隐藏项目和窗口位置。
          </div>
          {resetNote ? <div className="note">{resetNote}</div> : null}
        </section>
      </div>

      <div
        className="settings-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整设置面板宽度"
        title="拖动调整设置面板宽度"
        onPointerDown={startResize}
      />
    </aside>
  )
}
