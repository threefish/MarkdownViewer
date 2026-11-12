import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeMode } from '../../../shared/types'
import { MarkdownDocument } from '../lib/markdown'

const DEBOUNCE_MS = 250
const SYNC_SUPPRESS_MS = 150

export interface SplitPreviewHandle {
  syncToLine(line: number, fraction?: number): void
}

interface Anchor {
  line: number
  top: number
}

interface Props {
  draft: string
  baseDir: string
  theme: ThemeMode
  onLink: (href: string) => void
  onEditScene?: (path: string) => void
  onTaskToggle?: (line: number, checked: boolean) => void
  scrollerRef: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
  leaderRef: React.RefObject<'editor' | 'preview'>
  guardRef: React.RefObject<{ editor: number; preview: number }>
  getEditorTopLine: () => number | null
  scrollEditorToLine: (line: number) => void
  onReady: (handle: SplitPreviewHandle) => void
}

function topForLine(anchors: Anchor[], line: number): number | null {
  if (!anchors.length) return null
  if (line <= anchors[0].line) return 0
  let lo = 0
  let hi = anchors.length - 1
  let idx = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (anchors[mid].line <= line) {
      idx = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  const a = anchors[idx]
  const b = anchors[idx + 1]
  if (!b) return a.top
  const ratio = (line - a.line) / (b.line - a.line)
  return a.top + ratio * (b.top - a.top)
}

function lineForTop(anchors: Anchor[], top: number): number | null {
  if (!anchors.length) return null
  let lo = 0
  let hi = anchors.length - 1
  let idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (anchors[mid].top <= top + 1) {
      idx = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (idx < 0) return anchors[0].line
  const a = anchors[idx]
  const b = anchors[idx + 1]
  if (!b || b.top <= a.top) return a.line
  const ratio = Math.min(1, Math.max(0, (top - a.top) / (b.top - a.top)))
  return a.line + ratio * (b.line - a.line)
}

export function SplitPreview({
  draft,
  baseDir,
  theme,
  onLink,
  onEditScene,
  onTaskToggle,
  scrollerRef,
  onScroll,
  leaderRef,
  guardRef,
  getEditorTopLine,
  scrollEditorToLine,
  onReady
}: Props): React.JSX.Element {
  const docRef = useRef<HTMLDivElement>(null)
  const [content, setContent] = useState(draft)
  const anchorsRef = useRef<Anchor[]>([])
  const dirtyRef = useRef(true)
  const lastLineRef = useRef(1)
  const lastFractionRef = useRef(0)
  const repinFrameRef = useRef(0)
  const onScrollRef = useRef(onScroll)
  const onReadyRef = useRef(onReady)
  const getEditorTopLineRef = useRef(getEditorTopLine)
  const scrollEditorToLineRef = useRef(scrollEditorToLine)

  useEffect(() => {
    onScrollRef.current = onScroll
  }, [onScroll])

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    getEditorTopLineRef.current = getEditorTopLine
  }, [getEditorTopLine])

  useEffect(() => {
    scrollEditorToLineRef.current = scrollEditorToLine
  }, [scrollEditorToLine])

  useEffect(() => {
    const timer = window.setTimeout(() => setContent(draft), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft])

  const collectAnchors = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const base = scroller.getBoundingClientRect().top
    const scrollTop = scroller.scrollTop
    const anchors: Anchor[] = []
    scroller.querySelectorAll<HTMLElement>('[data-line]').forEach((element) => {
      const line = Number(element.dataset.line)
      if (!Number.isFinite(line) || line <= 0) return
      anchors.push({ line, top: element.getBoundingClientRect().top - base + scrollTop })
    })
    anchors.sort((a, b) => a.line - b.line || a.top - b.top)
    anchorsRef.current = anchors
    dirtyRef.current = false
  }, [scrollerRef])

  const syncToLine = useCallback(
    (line: number, fraction = 0) => {
      const scroller = scrollerRef.current
      if (!scroller) return
      lastLineRef.current = line
      lastFractionRef.current = fraction
      if (dirtyRef.current) collectAnchors()
      const top = topForLine(anchorsRef.current, line)
      if (top === null) return
      guardRef.current.preview = performance.now() + SYNC_SUPPRESS_MS
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      const target = top - Math.min(1, Math.max(0, fraction)) * scroller.clientHeight
      scroller.scrollTop = Math.min(max, Math.max(0, target))
    },
    [collectAnchors, guardRef, scrollerRef]
  )

  useEffect(() => {
    lastLineRef.current = getEditorTopLineRef.current() ?? 1
    lastFractionRef.current = 0
    onReadyRef.current({ syncToLine })
  }, [syncToLine])

  // 防抖内容落地后重收集锚点；编辑区为 leader 时按上次行号重钉，避免上方块撑高后视口漂移。
  useEffect(() => {
    dirtyRef.current = true
    const frame = window.requestAnimationFrame(() => {
      collectAnchors()
      if (leaderRef.current === 'editor') syncToLine(lastLineRef.current, lastFractionRef.current)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [content, collectAnchors, leaderRef, syncToLine])

  useEffect(() => {
    const doc = docRef.current
    if (!doc || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      dirtyRef.current = true
      if (repinFrameRef.current) return
      repinFrameRef.current = window.requestAnimationFrame(() => {
        repinFrameRef.current = 0
        collectAnchors()
        if (leaderRef.current === 'editor') syncToLine(lastLineRef.current, lastFractionRef.current)
      })
    })
    observer.observe(doc)
    return () => {
      observer.disconnect()
      if (repinFrameRef.current) window.cancelAnimationFrame(repinFrameRef.current)
      repinFrameRef.current = 0
    }
  }, [collectAnchors, leaderRef, syncToLine])

  const handleScrollInternal = useCallback(() => {
    onScrollRef.current?.()
    const scroller = scrollerRef.current
    if (!scroller) return
    if (leaderRef.current !== 'preview') return
    if (performance.now() < guardRef.current.preview) return
    if (dirtyRef.current) collectAnchors()
    const line = lineForTop(anchorsRef.current, scroller.scrollTop)
    if (line !== null) scrollEditorToLineRef.current(Math.max(1, Math.floor(line)))
  }, [collectAnchors, guardRef, leaderRef, scrollerRef])

  return (
    <div className="reader" ref={scrollerRef} onScroll={handleScrollInternal}>
      <div className="doc" ref={docRef}>
        <article className="markdown-body">
          <MarkdownDocument
            content={content}
            baseDir={baseDir}
            theme={theme}
            onLink={onLink}
            onEditScene={onEditScene}
            onTaskToggle={onTaskToggle}
            lineAnchors
          />
        </article>
      </div>
    </div>
  )
}