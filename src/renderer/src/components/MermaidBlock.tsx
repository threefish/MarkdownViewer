import { useEffect, useRef, useState } from 'react'
import type { ThemeMode } from '../../../shared/types'
import { isDarkTheme, themeBackground } from '../../../shared/themes'
import { ScenePreview } from './ScenePreview'

let counter = 0
let loader: Promise<(typeof import('mermaid'))['default']> | null = null

function loadMermaid(): Promise<(typeof import('mermaid'))['default']> {
  if (!loader) loader = import('mermaid').then((mod) => mod.default)
  return loader
}

function diagramTitle(code: string): string {
  const head = (code.trim().split(/\s+/)[0] ?? '').toLowerCase()
  if (head.startsWith('flowchart') || head.startsWith('graph')) return '流程图'
  if (head.startsWith('sequencediagram')) return '时序图'
  if (head.startsWith('classdiagram')) return '类图'
  if (head.startsWith('statediagram')) return '状态图'
  if (head.startsWith('erdiagram')) return 'ER 图'
  if (head.startsWith('gantt')) return '甘特图'
  if (head.startsWith('pie')) return '饼图'
  if (head.startsWith('journey')) return '旅程图'
  if (head.startsWith('mindmap')) return '思维导图'
  if (head.startsWith('timeline')) return '时间线'
  if (head.startsWith('gitgraph')) return 'Git 图'
  return 'Mermaid 图表'
}

// 预览浮层为深色底，给 SVG 铺主题底色并按 viewBox 设定固有尺寸，保证浅色主题可读且缩放正确。
function previewSvg(svg: string, theme: ThemeMode): string {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
  if (root.nodeName === 'parsererror') return svg
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (box.length === 4 && box[2] > 0 && box[3] > 0) {
    root.setAttribute('width', String(box[2]))
    root.setAttribute('height', String(box[3]))
  }
  root.setAttribute('style', `background:${themeBackground(theme)}`)
  return root.outerHTML
}

interface Props {
  code: string
  theme: ThemeMode
  eager?: boolean
}

export function MermaidBlock({ code, theme, eager }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager ?? false)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (eager) return
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
  }, [eager])

  useEffect(() => {
    if (!visible) return
    if (!code) {
      setError('图表源码为空')
      return
    }
    if (code.length > 30000) {
      setError('图表源码超过 30KB，已跳过渲染')
      return
    }
    let cancelled = false
    const id = `mdv-mermaid-${++counter}`
    setSvg('')
    setError('')
    ;(async () => {
      try {
        const mermaid = await loadMermaid()
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: isDarkTheme(theme) ? 'dark' : 'default',
          fontFamily: 'inherit',
          themeVariables: {
            background: themeBackground(theme)
          }
        })
        const result = await mermaid.render(id, code)
        if (!cancelled) setSvg(result.svg)
      } catch (err) {
        document.getElementById(id)?.remove()
        document.getElementById(`d${id}`)?.remove()
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          setError(message.split('\n').slice(0, 6).join('\n'))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [visible, code, theme])

  const open = (): void => {
    if (svg) setPreview(previewSvg(svg, theme))
  }

  return (
    <>
      <div className="mermaid-block" ref={hostRef}>
        {error ? (
          <div className="mermaid-error">
            <div className="mermaid-error-title">图表渲染失败</div>
            <pre className="mermaid-error-message">{error}</pre>
            <details>
              <summary>查看源码</summary>
              <pre className="mermaid-error-source">{code}</pre>
            </details>
          </div>
        ) : svg ? (
          <div
            className="mermaid-svg"
            role="button"
            tabIndex={0}
            title="点击预览图表"
            onClick={open}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              open()
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="mermaid-placeholder">正在绘制图表…</div>
        )}
      </div>
      {preview ? (
        <ScenePreview svg={preview} name={diagramTitle(code)} onClose={() => setPreview(null)} />
      ) : null}
    </>
  )
}
