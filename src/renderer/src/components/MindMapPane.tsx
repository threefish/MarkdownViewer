import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import MindMap from 'simple-mind-map'
import MindMapThemes from 'simple-mind-map-plugin-themes'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import Select from 'simple-mind-map/src/plugins/Select.js'
import RichText from 'simple-mind-map/src/plugins/RichText.js'
import Export from 'simple-mind-map/src/plugins/Export.js'
import ExportXMind from 'simple-mind-map/src/plugins/ExportXMind.js'
import { ContextMenu } from './ContextMenu'
import { ShortcutHelp } from './ShortcutHelp'
import { MINDMAP_SHORTCUTS } from '../lib/shortcuts'
import { patchCatalogOrganizationLayout } from '../lib/mindmapCatalogLayout'
import {
  MindMapStylePanel,
  STYLE_PANEL_WIDTH,
  toHexColor,
  type MindMapStyleValues
} from './MindMapStylePanel'
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
  center(): void
  exportAs(kind: 'xmind' | 'png' | 'svg'): void
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

// 配色主题：从官方主题库精选 20 套（浅色 13 + 深色 7），模板名随文件保存
const LIGHT_THEME_ORDER = [
  'classicGreen',
  'classicBlue',
  'blueSky',
  'freshGreen',
  'mint',
  'vitalityOrange',
  'coffee',
  'autumn',
  'romanticPurple',
  'rose',
  'shallowSea',
  'morandi',
  'simpleBlack'
]
const DARK_THEME_ORDER = [
  'classic',
  'blackGold',
  'lateNightOffice',
  'neonLamp',
  'darkNightLceBlade',
  'dark',
  'orangeJuice'
]

function curateThemes(
  source: { value: string; name: string }[],
  order: string[]
): { value: string; label: string }[] {
  const picked: { value: string; label: string }[] = []
  for (const value of order) {
    const item = source.find((theme) => theme.value === value)
    if (item) picked.push({ value: item.value, label: item.name })
  }
  return picked
}

const THEME_LIGHT = curateThemes(MindMapThemes.lightList, LIGHT_THEME_ORDER)
const THEME_DARK = curateThemes(MindMapThemes.darkList, DARK_THEME_ORDER)

const NODE_STYLE_KEYS = [
  'fontSize',
  'fontFamily',
  'color',
  'fillColor',
  'borderColor',
  'borderWidth',
  'borderRadius',
  'fontWeight',
  'fontStyle',
  'textDecoration',
  'shape'
] as const

// 节点层只有一个 getStyle 暴露给外部，派生的读值/写值都走它
interface StyleNode {
  getStyle(prop: string): unknown
}

interface RendererExtras {
  activeNodeList?: StyleNode[]
  textEdit?: { show(params: { node: StyleNode }): void }
}

function rendererExtras(map: MindMap): RendererExtras {
  return map.renderer as unknown as RendererExtras
}

interface QuillBinding {
  key: string | number
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  handler?: (range: unknown, context: unknown) => unknown
}

interface QuillKeyboard {
  bindings?: Record<string, QuillBinding[]>
}

interface RichTextPlugin {
  quill?: { keyboard?: QuillKeyboard }
  showEditText?: (params: unknown) => void
}

// 节点编辑用 Quill，库把 Enter 重定义成“结束编辑”，只给 Shift+Enter 注册了换行；
// 这里补上更常见的 Ctrl/Cmd+Enter，复用库的处理逻辑以保留行内格式。
// Quill 按顺序取第一个匹配的 binding，库自带的“忽略其他修饰键”binding 排在前面，
// 因此必须插到数组最前，否则事件会先被它拦掉。
function enableCtrlEnterLineBreak(rich: RichTextPlugin): void {
  const bindings = rich.quill?.keyboard?.bindings?.Enter
  if (!bindings) return
  if (bindings.some((binding) => binding.ctrlKey === true && binding.key === 'Enter')) return
  const shiftEnter = bindings.find((binding) => binding.shiftKey && binding.key === 'Enter')
  if (!shiftEnter?.handler) return
  bindings.unshift(
    { key: 'Enter', ctrlKey: true, handler: shiftEnter.handler },
    { key: 'Enter', metaKey: true, handler: shiftEnter.handler }
  )
}

// Quill 实例每次进入编辑都会重建（画布缩放也会），包一层 showEditText 以在创建后补注册
function patchRichTextEnter(map: MindMap): void {
  const rich = (map as unknown as { richText?: RichTextPlugin }).richText
  const showEditText = rich?.showEditText
  if (!rich || typeof showEditText !== 'function') return
  rich.showEditText = function (params?: unknown): void {
    showEditText.call(rich, params)
    enableCtrlEnterLineBreak(rich)
  }
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNodeStyle(node: StyleNode): MindMapStyleValues {
  return {
    fontSize: toNumber(node.getStyle('fontSize'), 14),
    fontFamily: toText(node.getStyle('fontFamily')),
    color: toHexColor(node.getStyle('color'), '#333333'),
    fillColor: toText(node.getStyle('fillColor')),
    borderColor: toHexColor(node.getStyle('borderColor'), '#888888'),
    borderWidth: toNumber(node.getStyle('borderWidth'), 0),
    borderRadius: toNumber(node.getStyle('borderRadius'), 5),
    fontWeight: node.getStyle('fontWeight') === 'bold' ? 'bold' : 'normal',
    fontStyle: node.getStyle('fontStyle') === 'italic' ? 'italic' : 'normal',
    textDecoration: node.getStyle('textDecoration') === 'underline' ? 'underline' : 'none',
    shape: toText(node.getStyle('shape'))
  }
}

type MapCtor = new (opt: {
  el: HTMLElement
  data: MapNode
  layout?: string
  theme?: string
  readonly?: boolean
  enableShortcutOnlyWhenMouseInSvg?: boolean
  // 画布拖拽时阻止默认行为，否则拖动脑图会顺带选中页面文字
  mousedownEventPreventDefault?: boolean
}) => MindMap

for (const plugin of [Drag, Select, RichText, Export, ExportXMind]) {
  MindMap.usePlugin(plugin)
}
MindMapThemes.init(MindMap)
patchCatalogOrganizationLayout()

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
  const [theme, setTheme] = useState('default')
  const [nodeMenu, setNodeMenu] = useState<{
    x: number
    y: number
    rect?: { left: number; top: number; right: number; bottom: number }
  } | null>(null)
  const [stylePanel, setStylePanel] = useState<{
    x: number
    y: number
    values: MindMapStyleValues
    multi: boolean
  } | null>(null)
  const styleTargetRef = useRef<StyleNode | null>(null)
  const helpBtnRef = useRef<HTMLButtonElement>(null)
  const [helpPos, setHelpPos] = useState<{ x: number; y: number } | null>(null)
  // 面板打开期间节点保持激活（选中高亮沿用库自带外框），目标列表单独保存
  const styleTargetsRef = useRef<StyleNode[]>([])
  // 导出走文件菜单调用，句柄需要拿到最新一次渲染的闭包（baseName / 提示回调）
  const exportRef = useRef<(kind: 'xmind' | 'png' | 'svg') => Promise<void>>(async () => {})

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
        enableShortcutOnlyWhenMouseInSvg: false,
        mousedownEventPreventDefault: true
      })
      if (parsed.theme?.config) map.setThemeConfig(parsed.theme.config)
    } catch (err) {
      setError(err instanceof Error ? err.message : PARSE_ERROR)
      return
    }
    mapRef.current = map
    setLayout(parsed.layout)
    setTheme(map.getTheme())
    propsRef.current.onReady?.({
      undo: () => map.execCommand('BACK'),
      redo: () => map.execCommand('FORWARD'),
      copy: () => map.renderer.copy(),
      cut: () => map.renderer.cut(),
      paste: () => void map.renderer.paste(),
      selectAll: () => map.execCommand('SELECT_ALL'),
      center: () => map.view.reset(),
      exportAs: (kind) => void exportRef.current(kind)
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

    patchRichTextEnter(map)

    const onNodeContextMenu = (event: MouseEvent, node: StyleNode): void => {
      if (mapRef.current !== map) return
      styleTargetRef.current = node
      const target = event.target as Element | null
      const group = target && typeof target.closest === 'function' ? target.closest('.smm-node') : null
      const box = (group ?? target)?.getBoundingClientRect?.()
      setNodeMenu({
        x: event.clientX,
        y: event.clientY,
        rect: box
          ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
          : undefined
      })
    }
    map.on('node_contextmenu', onNodeContextMenu)

    const onNodeClick = (node: StyleNode): void => {
      if (mapRef.current !== map) return
      styleTargetRef.current = node
      const active = rendererExtras(map).activeNodeList ?? []
      const targets = active.length ? [...active] : [node]
      styleTargetsRef.current = targets
      setStylePanel((panel) =>
        panel ? { ...panel, values: readNodeStyle(node), multi: targets.length > 1 } : panel
      )
    }
    map.on('node_click', onNodeClick)

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
      map.off('node_contextmenu', onNodeContextMenu)
      map.off('node_click', onNodeClick)
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
      setNodeMenu(null)
      setStylePanel(null)
      setHelpPos(null)
      styleTargetsRef.current = []
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
      setTheme(map.getTheme())
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

  const changeTheme = (next: string): void => {
    const map = mapRef.current
    if (!map || next === theme) return
    setTheme(next)
    map.setTheme(next)
    emitCurrent()
  }

  const styleTargets = (): StyleNode[] => styleTargetsRef.current

  // 面板默认贴在节点右侧；右侧放不下就翻到左侧，且始终限制在画布区域内
  const panelPosition = (rect?: {
    left: number
    top: number
    right: number
    bottom: number
  }): { x: number; y: number } => {
    const host = hostRef.current?.getBoundingClientRect()
    const bounds =
      host && host.width > 0 && host.height > 0
        ? { left: host.left, top: host.top, right: host.right, bottom: host.bottom, width: host.width }
        : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth }
    const minX = bounds.left + 8
    const maxX = Math.max(minX, bounds.right - STYLE_PANEL_WIDTH - 8)
    if (!rect) {
      return {
        x: Math.min(Math.max(bounds.left + bounds.width / 2 - STYLE_PANEL_WIDTH / 2, minX), maxX),
        y: bounds.top + 8
      }
    }
    const gap = 14
    let x = rect.right + gap
    if (x > maxX) x = rect.left - STYLE_PANEL_WIDTH - gap
    x = Math.min(Math.max(x, minX), maxX)
    const y = Math.min(Math.max(rect.top - 8, bounds.top + 8), bounds.bottom - 120)
    return { x, y }
  }

  const openStylePanel = (): void => {
    const node = styleTargetRef.current
    const map = mapRef.current
    if (!node || !map || !nodeMenu) return
    const active = rendererExtras(map).activeNodeList ?? []
    const targets = active.length ? [...active] : [node]
    styleTargetsRef.current = targets
    const anchor = panelPosition(nodeMenu.rect)
    setStylePanel({
      x: anchor.x,
      y: anchor.y,
      values: readNodeStyle(node),
      multi: targets.length > 1
    })
  }

  const closeStylePanel = (): void => {
    setStylePanel(null)
    styleTargetsRef.current = []
  }

  const applyNodeStyle = (patch: Partial<MindMapStyleValues>): void => {
    const map = mapRef.current
    if (!map) return
    const nodes = styleTargets()
    if (!nodes.length) return
    const data: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(patch)) {
      // 空字符串表示“跟随主题”，写 undefined 后保存时会从节点数据里消失
      data[key] = value === '' ? undefined : value
    }
    for (const node of nodes) map.execCommand('SET_NODE_STYLES', node, data)
    setStylePanel((panel) => (panel ? { ...panel, values: { ...panel.values, ...patch } } : panel))
  }

  const resetNodeStyle = (): void => {
    const map = mapRef.current
    if (!map) return
    const nodes = styleTargets()
    if (!nodes.length) return
    const data: Record<string, undefined> = {}
    for (const key of NODE_STYLE_KEYS) data[key] = undefined
    for (const node of nodes) map.execCommand('SET_NODE_STYLES', node, data)
    setStylePanel((panel) =>
      panel ? { ...panel, values: readNodeStyle(nodes[0]) } : panel
    )
  }

  const editNodeText = (): void => {
    const map = mapRef.current
    const node = styleTargetRef.current
    if (!map || !node) return
    rendererExtras(map).textEdit?.show({ node })
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
    if (!map) return
    const name = baseName || '思维导图'
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
    }
  }

  exportRef.current = exportFile

  const layoutOptions = LAYOUTS.some((option) => option.value === layout)
    ? LAYOUTS
    : [...LAYOUTS, { value: layout, label: layout }]

  const themeOptions =
    theme === 'default' || THEME_LIGHT.some((o) => o.value === theme) || THEME_DARK.some((o) => o.value === theme)
      ? null
      : { value: theme, label: theme }

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
            {editing ? (
              <div className="mindmap-toolbar" role="toolbar" aria-label="脑图操作">
                <div className="mindmap-select-wrap">
                  <select
                    className="mindmap-select"
                    aria-label="布局"
                    value={layout}
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
                <div className="mindmap-select-wrap">
                  <select
                    className="mindmap-select"
                    aria-label="主题"
                    value={theme}
                    onChange={(event) => {
                      changeTheme(event.target.value)
                      event.target.blur()
                    }}
                  >
                    <option value="default">默认</option>
                    {themeOptions ? (
                      <option value={themeOptions.value}>{themeOptions.label}</option>
                    ) : null}
                    <optgroup label="浅色">
                      {THEME_LIGHT.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="深色">
                      {THEME_DARK.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <ChevronIcon open className="mindmap-chevron" />
                </div>
                <span className="mindmap-sep" />
                <button
                  type="button"
                  className="mindmap-btn"
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
                  title="快捷键说明"
                  ref={helpBtnRef}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setHelpPos((current) =>
                      current ? null : { x: rect.right - 268, y: rect.bottom + 6 }
                    )
                  }}
                >
                  快捷键
                </button>
              </div>
            ) : null}
            {nodeMenu ? (
              <ContextMenu
                x={nodeMenu.x}
                y={nodeMenu.y}
                ariaLabel="节点操作"
                onClose={() => setNodeMenu(null)}
                items={[
                  { label: '编辑文字', onClick: editNodeText },
                  { separator: true },
                  { label: '插入子主题', onClick: insertChild },
                  { label: '插入同级主题', onClick: insertSibling },
                  { separator: true },
                  { label: '剪切', onClick: () => mapRef.current?.renderer.cut() },
                  { label: '复制', onClick: () => mapRef.current?.renderer.copy() },
                  { label: '粘贴', onClick: () => void mapRef.current?.renderer.paste() },
                  { separator: true },
                  { label: '节点样式…', onClick: openStylePanel },
                  { separator: true },
                  { label: '删除节点', danger: true, onClick: removeNode }
                ]}
              />
            ) : null}
            {helpPos ? (
              <ShortcutHelp
                x={helpPos.x}
                y={helpPos.y}
                title="脑图快捷键"
                shortcuts={MINDMAP_SHORTCUTS.shortcuts}
                anchorRef={helpBtnRef}
                onClose={() => setHelpPos(null)}
              />
            ) : null}
            {stylePanel ? (
              <MindMapStylePanel
                x={stylePanel.x}
                y={stylePanel.y}
                values={stylePanel.values}
                multi={stylePanel.multi}
                boundaryRef={hostRef}
                onChange={applyNodeStyle}
                onReset={resetNodeStyle}
                onClose={closeStylePanel}
              />
            ) : null}
          </>
        )}
      </PaneBoundary>
    </div>
  )
}
