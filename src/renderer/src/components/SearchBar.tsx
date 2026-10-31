import { useEffect, useRef, useState, type RefObject } from 'react'
import { collectMatches } from '../lib/findInDoc'
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, SearchIcon } from './Icons'

interface Props {
  open: boolean
  docKey: string
  scroller: RefObject<HTMLDivElement | null>
  onClose: () => void
}

const ALL_KEY = 'mdv-find'
const ACTIVE_KEY = 'mdv-find-active'

interface HighlightLike {
  add(range: Range): void
}

type HighlightCtor = new () => HighlightLike

function highlightApi(): {
  highlights: { set(name: string, value: unknown): void; delete(name: string): void }
  create: HighlightCtor
} | null {
  const highlights = (CSS as unknown as { highlights?: { set: Function; delete: Function } })
    .highlights
  const create = (window as unknown as { Highlight?: HighlightCtor }).Highlight
  if (!highlights || !create) return null
  return {
    highlights: highlights as unknown as {
      set(name: string, value: unknown): void
      delete(name: string): void
    },
    create
  }
}

function clearHighlights(): void {
  const api = highlightApi()
  if (!api) return
  api.highlights.delete(ALL_KEY)
  api.highlights.delete(ACTIVE_KEY)
}

export function SearchBar({ open, docKey, scroller, onClose }: Props): React.JSX.Element | null {
  const [text, setText] = useState('')
  const [total, setTotal] = useState(0)
  const [current, setCurrent] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const rangesRef = useRef<Range[]>([])
  const indexRef = useRef(0)
  const revealedRef = useRef(-1)

  const paint = (ranges: Range[], active: number): void => {
    const api = highlightApi()
    if (!api) return
    if (!ranges.length) {
      clearHighlights()
      return
    }
    const all = new api.create()
    for (const range of ranges) all.add(range)
    api.highlights.set(ALL_KEY, all)
    const target = ranges[active]
    if (target) {
      const one = new api.create()
      one.add(target)
      api.highlights.set(ACTIVE_KEY, one)
    }
  }

  const reveal = (range: Range): void => {
    const el = scroller.current
    if (!el) return
    const rect = range.getBoundingClientRect()
    const view = el.getBoundingClientRect()
    const margin = 28
    if (rect.top >= view.top + margin && rect.bottom <= view.bottom - margin) return
    const target = el.scrollTop + (rect.top - view.top) - view.height / 3
    el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }

  const reset = (): void => {
    rangesRef.current = []
    indexRef.current = 0
    revealedRef.current = -1
    setTotal(0)
    setCurrent(0)
    clearHighlights()
  }

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      inputRef.current?.select()
    } else {
      setText('')
      reset()
    }
    return clearHighlights
  }, [open])

  useEffect(() => {
    if (!open) return
    const query = text.trim()
    if (!query) {
      reset()
      return
    }
    const timer = window.setTimeout(() => {
      const root = scroller.current?.querySelector<HTMLElement>('.markdown-body') ?? null
      const ranges = root ? collectMatches(root, query) : []
      rangesRef.current = ranges
      indexRef.current = 0
      revealedRef.current = -1
      setTotal(ranges.length)
      setCurrent(ranges.length ? 1 : 0)
      paint(ranges, 0)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [text, open, docKey])

  const step = (forward: boolean): void => {
    const ranges = rangesRef.current
    if (!ranges.length) return
    let next = indexRef.current
    if (revealedRef.current >= 0) {
      next = (indexRef.current + (forward ? 1 : -1) + ranges.length) % ranges.length
    }
    indexRef.current = next
    revealedRef.current = next
    setCurrent(next + 1)
    paint(ranges, next)
    reveal(ranges[next])
    inputRef.current?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      step(!event.shiftKey)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="search-bar">
      <SearchIcon className="search-icon" />
      <input
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="在文档中查找"
        spellCheck={false}
      />
      <span className="search-count">
        {text.trim() ? (total > 0 ? `${current || 1}/${total}` : '0/0') : ''}
      </span>
      <button
        type="button"
        className="mini-btn"
        title="上一个 (Shift+Enter)"
        onClick={() => step(false)}
        disabled={!total}
      >
        <ArrowUpIcon />
      </button>
      <button
        type="button"
        className="mini-btn"
        title="下一个 (Enter)"
        onClick={() => step(true)}
        disabled={!total}
      >
        <ArrowDownIcon />
      </button>
      <button type="button" className="mini-btn" title="关闭 (Esc)" onClick={onClose}>
        <CloseIcon />
      </button>
    </div>
  )
}
