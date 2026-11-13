import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import MindMap from 'simple-mind-map'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import Select from 'simple-mind-map/src/plugins/Select.js'
import RichText from 'simple-mind-map/src/plugins/RichText.js'
import Export from 'simple-mind-map/src/plugins/Export.js'
import ExportXMind from 'simple-mind-map/src/plugins/ExportXMind.js'
import { ChevronIcon } from './Icons'

interface Props {
  content: string
  draft: string | null
  editing: boolean
  baseName: string
  onChange: (next: string | null) => void
  onNotice: (message: string) => void
  onReady?: (handle: MindMapHandle | null) => void
}

// 供菜单“编辑”项调用的画布级操作
export interface MindMapHandle {
  undo(): void
  redo(): void
  copy(): void
  cut(): void
  paste(): void
  selectAll(): void
}

type MapNode = { data?: { text?: string }; children?: MapNode[] }

interface ParsedMap {
  root: MapNode
  layout: string
  theme: { template?: string; config?: Record<string, unknown> } | null
}

const PARSE_ERROR = '无法解析脑图文件，文件可能已损坏。'
const DEFAULT_ROOT: MapNode = { data: { text: '中心主题' } }

const LAYOUTS = [
  { value: 'mindMap', label: '思维导图' },
  { value: 'logicalStructure', label: '逻辑结构图' },
  { value: 'logicalStructureLeft', label: '向左逻辑图' },
  { value: 'organizationStructure', label: '组织结构图' },
  { value: 'catalogOrganization', label: '目录组织图' },
  { value: 'timeline', label: '时间轴（水平）' },
  { value: 'fishbone', label: '鱼骨图' }
]

type MapCtor = new (opt: {
  el: HTMLElement
  data: MapNode
  layout?: string
  theme?: string
  readonly?: boolean
  enableShortcutOnlyWhenMouseInSvg?: boolean
}) => MindMap

for (const plugin of [Drag, Select, RichText, Export, ExportXMind]) {
  MindMap.usePlugin(plugin)
}

function parseMap(value: string): ParsedMap {
  if (!value.trim()) return { root: DEFAULT_ROOT, layout: 'mindMap', theme: null }
  const raw = JSON.parse(value) as unknown
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid')
  const file = raw as {
    root?: MapNode
    data?: MapNode['data']
    layout?: unknown
    theme?: unknown
  }
  let root = DEFAULT_ROOT
  if (file.root && typeof file.root === 'object') root = file.root
  else if (file.data && typeof file.data === 'object') root = file as MapNode
  const layout = typeof file.layout === 'string' ? file.layout : 'mindMap'
  const theme =
    file.theme && typeof file.theme === 'object'
      ? (file.theme as ParsedMap['theme'])
      : null
  return { root, layout, theme }
}

function serialize(map: MindMap): string {
  return JSON.stringify(map.getData(true), null, 2)
}

// view（平移/缩放）会随容器尺寸自适应变化，不参与“是否有未保存修改”的判断
function dataSnapshot(map: MindMap): string {
  const data = map.getData(true) as Record<string, unknown>
  return JSON.stringify({ layout: data.layout, root: data.root, theme: data.theme })
}

// CSP 未放行 data:，导出结果用 atob 解码而不是 fetch
function dataUrlToBytes(url: string): Uint8Array {
  const comma = url.indexOf(',')
  if (comma < 0) throw new Error('导出数据无效')
  const meta = url.slice(0, comma)
  const payload = url.slice(comma + 1)
  if (!meta.includes('base64')) {
    return new TextEncoder().encode(decodeURIComponent(payload))
  }
  const bin = atob(payload)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

class PaneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <div className="mindmap-message">脑图组件运行出错，请重新打开该文件。</div>
    }
    return this.props.children
  }
}

export function MindMapPane({
  content,
  draft,
  editing,
  baseName,
  onChange,
  onNotice,
  onReady
}: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MindMap | null>(null)
  const [error, setError] = useState('')
  const [layout, setLayout] = useState('mindMap')
  const [busy, setBusy] = useState<string | null>(null)

  const baselineRef = useRef<string | null>(null)
  const lastValueRef = useRef(draft ?? content)
  const lastContentRef = useRef(content)
  const lastEmittedRef = useRef<string | null>(null)
  // 本组件发出的草稿会回流成 draft，需要识别出来，避免 setFullData 重建画布
  const lastEmittedContentRef = useRef<string | null>(null)
  // 进入编辑态时库会入栈一次渲染后的数据（含 uid/expand），用这次变更刷新基线
  const modeInitRef = useRef(false)
  // 富文本插件初始化会改写节点数据，打开文件不应直接显示未保存；
  // 在用户真正动手之前，把首次序列化结果当作基线。
  const adoptRef = useRef(true)
  const propsRef = useRef({ content, draft, onChange, onNotice, onReady })
  propsRef.current = { content, draft, onChange, onNotice, onReady }

  const emitCurrent = useCallback((): void => {
    const map = mapRef.current
    if (!map) return
    let snapshot: string
    try {
      snapshot = dataSnapshot(map)
    } catch {
      return
    }
    const current = propsRef.current
    if (snapshot === lastEmittedRef.current) return
    lastEmittedRef.current = snapshot
    if (snapshot === baselineRef.current) {
      lastEmittedContentRef.current = null
      if (current.draft !== null) current.onChange(null)
      return
    }
    const serialized = serialize(map)
    lastEmittedContentRef.current = serialized
    current.onChange(serialized)
  }, [])

  useEffect(() => {
    const disarm = (): void => {
      adoptRef.current = false
    }
    window.addEventListener('pointerdown', disarm, true)
    window.addEventListener('keydown', disarm, true)
    return () => {
      window.removeEventListener('pointerdown', disarm, true)
      window.removeEventListener('keydown', disarm, true)
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let parsed: ParsedMap
    try {
      parsed = parseMap(draft ?? content)
    } catch {
      setError(PARSE_ERROR)
      return
    }
    let map: MindMap
    try {
      const MapClass = MindMap as unknown as MapCtor
      map = new MapClass({
        el: host,
        data: parsed.root,
        layout: parsed.layout,
        theme: parsed.theme?.template ?? 'default',
        readonly: !editing,
        // 工具栏浮在画布上方，鼠标常驻工具栏时也要能响应快捷键
        enableShortcutOnlyWhenMouseInSvg: false
      })
      if (parsed.theme?.config) map.setThemeConfig(parsed.theme.config)
    } catch (err) {
      setError(err instanceof Error ? err.message : PARSE_ERROR)
      return
    }
    mapRef.current = map
    setLayout(parsed.layout)
    propsRef.current.onReady?.({
      undo: () => map.execCommand('BACK'),
      redo: () => map.execCommand('FORWARD'),
      copy: () => map.renderer.copy(),
      cut: () => map.renderer.cut(),
      paste: () => void map.renderer.paste(),
      selectAll: () => map.execCommand('SELECT_ALL')
    })

    const onDataChange = (): void => {
      if (mapRef.current !== map) return
      let snapshot: string
      try {
        snapshot = dataSnapshot(map)
      } catch {
        return
      }
      if (modeInitRef.current || adoptRef.current) {
        modeInitRef.current = false
        baselineRef.current = snapshot
        lastEmittedRef.current = snapshot
        return
      }
      emitCurrent()
    }
    map.on('data_change', onDataChange)

    try {
      baselineRef.current = dataSnapshot(map)
      lastEmittedRef.current = baselineRef.current
    } catch {
      baselineRef.current = null
      lastEmittedRef.current = null
    }
    adoptRef.current = true

    const observer = new ResizeObserver(() => {
      if (mapRef.current === map) map.resize()
    })
    observer.observe(host)

    return () => {
      observer.disconnect()
      map.off('data_change', onDataChange)
      map.destroy()
      mapRef.current = null
      propsRef.current.onReady?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (editing) {
      modeInitRef.current = true
      map.setMode('edit')
      modeInitRef.current = false
    } else {
      map.setMode('readonly')
    }
  }, [editing])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const value = draft ?? content
    if (value === lastValueRef.current) {
      if (content !== lastContentRef.current) {
        lastContentRef.current = content
        try {
          baselineRef.current = dataSnapshot(map)
        } catch {
          // 忽略：容器尚未就绪
        }
      }
      return
    }
    if (draft === lastEmittedContentRef.current) {
      // 自己发出的草稿回流，保持画布状态不动
      lastValueRef.current = value
      lastContentRef.current = content
      return
    }
    lastValueRef.current = value
    lastContentRef.current = content
    try {
      const parsed = parseMap(value)
      map.setFullData({
        root: parsed.root,
        layout: parsed.layout,
        theme: parsed.theme ?? undefined
      })
      setLayout(parsed.layout)
      baselineRef.current = dataSnapshot(map)
      lastEmittedRef.current = baselineRef.current
      lastEmittedContentRef.current = draft ?? null
      adoptRef.current = draft === null || draft === content
      setError('')
    } catch {
      setError(PARSE_ERROR)
    }
  }, [content, draft])

  const changeLayout = (next: string): void => {
    const map = mapRef.current
    if (!map || next === layout) return
    setLayout(next)
    map.setLayout(next)
    emitCurrent()
  }

  const insertChild = (): void => {
    mapRef.current?.execCommand('INSERT_CHILD_NODE')
  }

  const insertSibling = (): void => {
    mapRef.current?.execCommand('INSERT_NODE')
  }

  const removeNode = (): void => {
    mapRef.current?.execCommand('REMOVE_NODE')
  }

  const exportFile = async (kind: 'xmind' | 'png' | 'svg'): Promise<void> => {
    const map = mapRef.current
    if (!map || busy) return
    const name = baseName || '思维导图'
    setBusy(kind)
    try {
      const defaultName = `${name}.${kind}`
      const filterName =
        kind === 'xmind' ? 'XMind 脑图' : kind === 'svg' ? 'SVG 图片' : 'PNG 图片'
      const url = await map.export(kind, false, name)
      if (typeof url !== 'string') throw new Error('导出失败')
      const data = dataUrlToBytes(url)
      const result = await window.mdv.saveAs({
        defaultName,
        filterName,
        extensions: [kind],
        data
      })
      if (result.canceled) return
      onNotice(
        result.ok
          ? `已导出：${result.path ?? defaultName}`
          : `导出失败：${result.message ?? '未知错误'}`
      )
    } catch (err) {
      onNotice(`导出失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const layoutOptions = LAYOUTS.some((option) => option.value === layout)
    ? LAYOUTS
    : [...LAYOUTS, { value: layout, label: layout }]

  return (
    <div className="mindmap-pane">
      <PaneBoundary>
        {error ? (
          <div className="mindmap-message">
            <strong>无法打开脑图</strong>
            <span>{error}</span>
            <span>按 F5 重新加载，或用其他编辑器修正该文件。</span>
          </div>
        ) : (
          <>
            <div
              className="mindmap-canvas"
              ref={hostRef}
              onDoubleClick={(event) => event.stopPropagation()}
            />
            <div className="mindmap-toolbar" role="toolbar" aria-label="脑图操作">
              <div className="mindmap-select-wrap">
                <select
                  className="mindmap-select"
                  aria-label="布局"
                  value={layout}
                  disabled={!editing}
                  onChange={(event) => {
                    changeLayout(event.target.value)
                    event.target.blur()
                  }}
                >
                  {layoutOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronIcon open className="mindmap-chevron" />
              </div>
              <span className="mindmap-sep" />
              <button
                type="button"
                className="mindmap-btn"
                disabled={!editing}
                title="插入子主题（Tab）"
                onClick={(event) => {
                  insertChild()
                  event.currentTarget.blur()
                }}
              >
                子主题
              </button>
              <button
                type="button"
                className="mindmap-btn"
                disabled={!editing}
                title="插入同级主题（Enter）"
                onClick={(event) => {
                  insertSibling()
                  event.currentTarget.blur()
                }}
              >
                同级
              </button>
              <button
                type="button"
                className="mindmap-btn"
                disabled={!editing}
                title="删除节点（Delete）"
                onClick={(event) => {
                  removeNode()
                  event.currentTarget.blur()
                }}
              >
                删除
              </button>
              <span className="mindmap-sep" />
              <button
                type="button"
                className="mindmap-btn"
                disabled={busy !== null}
                title="导出为 XMind"
                onClick={(event) => {
                  event.currentTarget.blur()
                  void exportFile('xmind')
                }}
              >
                {busy === 'xmind' ? '导出中…' : 'XMind'}
              </button>
              <button
                type="button"
                className="mindmap-btn"
                disabled={busy !== null}
                title="导出为 PNG 图片"
                onClick={(event) => {
                  event.currentTarget.blur()
                  void exportFile('png')
                }}
              >
                {busy === 'png' ? '导出中…' : 'PNG'}
              </button>
              <button
                type="button"
                className="mindmap-btn"
                disabled={busy !== null}
                title="导出为 SVG 图片"
                onClick={(event) => {
                  event.currentTarget.blur()
                  void exportFile('svg')
                }}
              >
                {busy === 'svg' ? '导出中…' : 'SVG'}
              </button>
            </div>
          </>
        )}
      </PaneBoundary>
    </div>
  )
}
