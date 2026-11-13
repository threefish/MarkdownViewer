import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CaptureUpdateAction, Excalidraw, restore, serializeAsJSON } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import type { ThemeMode } from '../../../shared/types'
import { isDarkTheme } from '../../../shared/themes'

type Scene = ReturnType<typeof restore>

export interface ExcalidrawHandle {
  center(): void
}

interface Props {
  content: string
  draft: string | null
  editing: boolean
  theme: ThemeMode
  onChange: (next: string | null) => void
  onReady?: (handle: ExcalidrawHandle | null) => void
}

const PARSE_ERROR = '无法解析画板文件，文件可能已损坏。'

// saveToActiveFile 会绕过应用的原子写与 mtime 冲突检测；export/saveAsImage 含联网入口。
const UI_OPTIONS: ExcalidrawProps['UIOptions'] = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    export: false,
    toggleTheme: false
  }
}

function parseScene(value: string): Scene {
  if (!value.trim()) return restore(null, null, null)
  const data = JSON.parse(value) as { elements?: unknown } | null
  if (!data || typeof data !== 'object' || !Array.isArray(data.elements)) {
    throw new Error('invalid scene')
  }
  return restore(data as Parameters<typeof restore>[0], null, null)
}

function baselineOf(content: string): string {
  try {
    const scene = parseScene(content)
    return serializeAsJSON(scene.elements, scene.appState, scene.files, 'local')
  } catch {
    return ''
  }
}

class PaneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <div className="excalidraw-message">画板组件运行出错，请重新打开该文件。</div>
    }
    return this.props.children
  }
}

export function ExcalidrawPane({
  content,
  draft,
  editing,
  theme,
  onChange,
  onReady
}: Props): React.JSX.Element {
  const initial = useMemo(() => {
    try {
      return { scene: parseScene(draft ?? content), error: '' }
    } catch {
      return { scene: null, error: PARSE_ERROR }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [scene, setScene] = useState<Scene | null>(initial.scene)
  const [error, setError] = useState(initial.error)
  const [empty, setEmpty] = useState(initial.scene?.elements.length === 0)
  const [apiReady, setApiReady] = useState(false)
  // 打开文件时把内容居中，但不改变缩放；只做一次，后续平移/编辑保持用户视图
  const centeredRef = useRef(false)

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const baselineRef = useRef<string | null>(null)
  if (baselineRef.current === null) baselineRef.current = baselineOf(content)
  const lastValueRef = useRef(draft ?? content)
  const lastContentRef = useRef(content)
  const lastEmittedRef = useRef<string | null>(null)
  // Excalidraw 初始化时会补齐绑定关系，序列化结果可能与磁盘 JSON 不同；
  // 在用户真正动手之前，把画布回报的场景当作基线，避免打开文件即显示未保存。
  const adoptRef = useRef(draft === null || draft === content)
  const propsRef = useRef({ content, draft, onChange, onReady })
  propsRef.current = { content, draft, onChange, onReady }

  useEffect(
    () => () => {
      propsRef.current.onReady?.(null)
    },
    []
  )

  const center = useCallback((): void => {
    const api = apiRef.current
    if (!api) return
    const elements = api.getSceneElements().filter((element) => !element.isDeleted)
    if (!elements.length) return
    api.scrollToContent(elements, { fitToContent: false, animate: false })
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

  const handleChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>(
    (elements, appState, files) => {
      const next = serializeAsJSON(elements, appState, files, 'local')
      setEmpty(elements.length === 0)
      const current = propsRef.current
      if (adoptRef.current) {
        baselineRef.current = next
        lastEmittedRef.current = next
        lastValueRef.current = current.draft ?? current.content
        return
      }
      if (next === lastEmittedRef.current) return
      lastEmittedRef.current = next
      if (next === baselineRef.current) {
        lastValueRef.current = current.content
        if (current.draft !== null) current.onChange(null)
        return
      }
      lastValueRef.current = next
      current.onChange(next)
    },
    []
  )

  const handleApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api
    setApiReady(true)
    propsRef.current.onReady?.({ center })
  }, [center])

  useEffect(() => {
    if (!apiReady || centeredRef.current) return
    const api = apiRef.current
    if (!api || !scene) return
    centeredRef.current = true
    const elements = scene.elements.filter((element) => !element.isDeleted)
    if (!elements.length) return
    // 等画布完成首次布局，避免用 0 尺寸计算视口偏移
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        api.scrollToContent(elements, { fitToContent: false, animate: false })
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [apiReady, scene])

  useEffect(() => {
    const value = draft ?? content
    if (value === lastValueRef.current) {
      if (content !== lastContentRef.current) {
        lastContentRef.current = content
        baselineRef.current = baselineOf(content)
      }
      return
    }
    lastValueRef.current = value
    lastContentRef.current = content
    baselineRef.current = baselineOf(content)
    adoptRef.current = draft === null || draft === content

    let parsed: Scene
    try {
      parsed = parseScene(value)
    } catch {
      apiRef.current = null
      setScene(null)
      setError(PARSE_ERROR)
      return
    }
    setError('')
    setEmpty(parsed.elements.length === 0)
    const api = apiRef.current
    if (!api) {
      setScene(parsed)
      return
    }
    const files = Object.values(parsed.files)
    if (files.length) api.addFiles(files)
    api.updateScene({
      elements: parsed.elements,
      appState: {
        viewBackgroundColor: parsed.appState.viewBackgroundColor,
        gridSize: parsed.appState.gridSize,
        gridStep: parsed.appState.gridStep,
        gridModeEnabled: parsed.appState.gridModeEnabled,
        theme: isDarkTheme(theme) ? 'dark' : 'light'
      },
      captureUpdate: CaptureUpdateAction.NEVER
    })
  }, [content, draft, theme])

  if (error || !scene) {
    return (
      <div className="excalidraw-pane">
        <div className="excalidraw-message">
          <strong>无法打开画板</strong>
          <span>{error || PARSE_ERROR}</span>
          <span>按 F5 重新加载，或用其他编辑器修正该文件。</span>
        </div>
      </div>
    )
  }

  return (
    <div className="excalidraw-pane">
      <PaneBoundary>
        <Excalidraw
          initialData={scene}
          onChange={handleChange}
          excalidrawAPI={handleApi}
          viewModeEnabled={!editing}
          theme={isDarkTheme(theme) ? 'dark' : 'light'}
          langCode="zh-CN"
          aiEnabled={false}
          validateEmbeddable={false}
          UIOptions={UI_OPTIONS}
        />
      </PaneBoundary>
      {editing && empty ? (
        <div className="excalidraw-empty">空白画板 · 选择工具开始绘制，Ctrl+S 保存</div>
      ) : null}
    </div>
  )
}