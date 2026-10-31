import { useEffect, useState } from 'react'

interface OutlineItem {
  id: string
  text: string
  level: number
}

interface Props {
  docKey: string
  scrollRef: React.RefObject<HTMLDivElement | null>
}

export function Outline({ docKey, scrollRef }: Props): React.JSX.Element {
  const [items, setItems] = useState<OutlineItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [scanned, setScanned] = useState(false)

  useEffect(() => {
    setItems([])
    setActiveId('')
    if (!docKey) {
      setScanned(false)
      return
    }
    setScanned(false)
    let frame = 0
    frame = requestAnimationFrame(() => {
      const rootEl = document.querySelector('.markdown-body')
      if (!rootEl) return
      const headings = Array.from(rootEl.querySelectorAll<HTMLElement>('h1, h2, h3, h4'))
      const parsed = headings
        .map((heading) => ({
          id: heading.id,
          text: (heading.textContent ?? '').trim(),
          level: Number(heading.tagName.slice(1)) || 1
        }))
        .filter((item) => item.id && item.text)
      setItems(parsed)
      setScanned(true)
      if (parsed[0]) setActiveId(parsed[0].id)
    })
    return () => cancelAnimationFrame(frame)
  }, [docKey])

  useEffect(() => {
    if (!items.length) return
    const rootEl = scrollRef.current
    if (!rootEl) return
    const visible = new Set<string>()
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el))
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = items.find((item) => visible.has(item.id))
        if (first) setActiveId(first.id)
      },
      { root: rootEl, rootMargin: '-64px 0px -62% 0px', threshold: 0 }
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items, scrollRef])

  const go = (id: string): void => {
    const target = document.getElementById(id)
    const reader = scrollRef.current
    if (!target || !reader) return
    const top =
      target.getBoundingClientRect().top - reader.getBoundingClientRect().top + reader.scrollTop - 28
    reader.scrollTo({ top, behavior: 'smooth' })
    setActiveId(id)
  }

  if (!docKey) {
    return (
      <div className="tree-hint">
        <p>还没有打开文档</p>
        <span>打开文档后，这里会列出标题结构</span>
      </div>
    )
  }

  if (scanned && !items.length) {
    return <div className="tree-hint">这份文档没有标题</div>
  }

  return (
    <div className="outline">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`outline-item${activeId === item.id ? ' active' : ''}`}
          style={{ paddingLeft: 8 + (item.level - 1) * 13 }}
          onClick={() => go(item.id)}
          title={item.text}
        >
          {item.text}
        </button>
      ))}
    </div>
  )
}
