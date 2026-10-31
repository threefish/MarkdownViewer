import { useEffect, useRef, useState } from 'react'
import type { ThemeMode } from '../../../shared/types'

const BACKGROUND: Record<ThemeMode, string> = {
  light: '#ffffff',
  dark: '#1b1f25',
  sepia: '#f8f3e8'
}

let counter = 0
let loader: Promise<(typeof import('mermaid'))['default']> | null = null

function loadMermaid(): Promise<(typeof import('mermaid'))['default']> {
  if (!loader) loader = import('mermaid').then((mod) => mod.default)
  return loader
}

interface Props {
  code: string
  theme: ThemeMode
}

export function MermaidBlock({ code, theme }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

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
          theme: theme === 'dark' ? 'dark' : 'default',
          fontFamily: 'inherit',
          themeVariables: {
            background: BACKGROUND[theme]
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

  return (
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
        <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="mermaid-placeholder">正在绘制图表…</div>
      )}
    </div>
  )
}
