import { useEffect, useRef, useState } from 'react'
import type { ThemeMode } from '../../../shared/types'
import { isDarkTheme } from '../../../shared/themes'
import { errorMessage } from '../lib/text'

let loader: Promise<typeof import('@excalidraw/excalidraw')> | null = null

function loadExcalidraw(): Promise<typeof import('@excalidraw/excalidraw')> {
  if (!loader) loader = import('@excalidraw/excalidraw')
  return loader
}

const MAX_SCENE_CHARS = 2_000_000

interface Props {
  path: string
  theme: ThemeMode
  onOpen: (href: string) => void
}

function samePath(a: string, b: string): boolean {
  return a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()
}

export function ExcalidrawEmbed({ path, theme, onOpen }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const element = hostRef.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '600px 0px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    return window.mdv.onDocChanged((payload) => {
      if (payload && samePath(payload.path, path)) setRevision((value) => value + 1)
    })
  }, [path])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setSvg('')
    setError('')
    setNote('')
    void (async () => {
      let content: string
      try {
        content = (await window.mdv.readScene(path)).content
      } catch (err) {
        if (cancelled) return
        const message = errorMessage(err)
        setError(/ENOENT|no such file/i.test(message) ? '画板文件不存在' : `画板读取失败：${message}`)
        return
      }
      if (cancelled) return
      if (!content.trim()) {
        setNote('空白画板')
        return
      }
      if (content.length > MAX_SCENE_CHARS) {
        setNote('画板过大，点击打开查看')
        return
      }
      let data: unknown
      try {
        data = JSON.parse(content)
      } catch {
        setError('画板文件无法解析')
        return
      }
      if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray((data as { elements?: unknown }).elements)
      ) {
        setError('画板文件无法解析')
        return
      }
      try {
        const { exportToSvg, restore } = await loadExcalidraw()
        if (cancelled) return
        const scene = restore(data as Parameters<typeof restore>[0], null, null)
        if (cancelled) return
        if (!scene.elements.length) {
          setNote('空白画板')
          return
        }
        const result = await exportToSvg({
          elements: scene.elements,
          appState: {
            ...scene.appState,
            exportBackground: true,
            exportWithDarkMode: isDarkTheme(theme)
          },
          files: scene.files
        })
        if (!cancelled) setSvg(result.outerHTML)
      } catch (err) {
        if (!cancelled) setError(`画板渲染失败：${errorMessage(err)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [visible, path, theme, revision])

  const open = (): void => onOpen(path)

  return (
    <span
      className="excalidraw-embed"
      ref={hostRef}
      role="button"
      tabIndex={0}
      title="点击打开画板"
      onClick={open}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        open()
      }}
    >
      {error ? (
        <span className="excalidraw-embed-error">{error}</span>
      ) : note ? (
        <span className="excalidraw-embed-note">{note}</span>
      ) : svg ? (
        <span className="excalidraw-embed-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <span className="excalidraw-embed-note">正在渲染画板…</span>
      )}
    </span>
  )
}