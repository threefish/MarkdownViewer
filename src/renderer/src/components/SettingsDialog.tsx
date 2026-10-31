import { useEffect, useRef, useState } from 'react'
import type { AssocInfo, AppInfo, ContentFont, Settings, ThemePreference } from '../../../shared/types'
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

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'sepia', label: '护眼米色' }
]

const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 24

const MIN_LEADING = 1.5
const MAX_LEADING = 2
const LEADING_STEP = 0.02

const MIN_EDITOR_FONT = 12
const MAX_EDITOR_FONT = 20
const EDITOR_FONT_STEP = 0.5

const FONT_OPTIONS: Array<{ value: ContentFont; label: string }> = [
  { value: 'sans', label: '默认' },
  { value: 'serif', label: '衬线' },
  { value: 'songti', label: '宋体' },
  { value: 'kaiti', label: '楷体' },
  { value: 'fangsong', label: '仿宋' }
]

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
  const fontSize = fontPreview ?? settings.contentFontSize
  const leading = leadingPreview ?? settings.contentLineHeight
  const editorFont = editorFontPreview ?? settings.editorFontSize

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

  return (
    <aside
      ref={drawerRef}
      className="settings-drawer"
      role="dialog"
      aria-label="设置"
      tabIndex={-1}
    >
      <header className="drawer-head">
        <h2>设置</h2>
        <button type="button" className="icon-btn" title="关闭 (Esc)" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="drawer-body">
        <section className="modal-section">
          <div className="section-title">外观</div>
          <div className="segmented">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={settings.themeMode === option.value ? 'active' : ''}
                onClick={() => void onPatch({ themeMode: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="setting-row">
            <span className="setting-row-label">正文字体</span>
            <div className="segmented font-options">
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

        <section className="modal-section">
          <div className="section-title">编辑器</div>
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
        </section>

        <section className="modal-section">
          <div className="section-title">启动</div>
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
        </section>

        <section className="modal-section">
          <div className="section-title">文件树</div>
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
        </section>

        <section className="modal-section">
          <div className="section-title">文件关联</div>
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

        <section className="modal-section">
          <div className="section-title">关于</div>
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
        </section>

        <section className="modal-section">
          <div className="section-title">最近打开</div>
          <button
            type="button"
            className="btn"
            disabled={!settings.recents.length}
            onClick={() => void onPatch({ recents: [] })}
          >
            清空最近记录
          </button>
        </section>

        <section className="modal-section">
          <div className="section-title">重置</div>
          <button
            type="button"
            className={`btn${resetArmed ? ' primary' : ''}`}
            onClick={() => void handleReset()}
          >
            {resetArmed ? '再次点击确认恢复' : '恢复默认设置'}
          </button>
          <div className="hint">
            恢复主题、字体、行距、正文宽度、编辑器与启动行为；不清空文件树、标签页、最近记录和窗口位置。
          </div>
          {resetNote ? <div className="note">{resetNote}</div> : null}
        </section>
      </div>
    </aside>
  )
}
