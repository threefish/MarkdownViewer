import { memo, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { localFileUrl } from '../lib/pathResolve'
import { buildPdfOutline, type PdfOutlineEntry } from '../lib/pdfOutline'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  SearchIcon,
  ZoomInIcon,
  ZoomOutIcon
} from './Icons'

// worker 以 blob 形式内联，避免 file:// 生产环境下跨源加载 worker 被拦截。
// 每个文档独享 worker：LoadingTask.destroy() 会连带销毁 worker，
// 全局共享 worker 时打开第二个 PDF 会触发 “worker is being destroyed”。
function createWorker(): pdfjsLib.PDFWorker {
  return pdfjsLib.PDFWorker.create({ port: new PdfWorker() })
}

const CMAP_URL = 'mdv://pdfasset/cmaps/'
const STANDARD_FONT_URL = 'mdv://pdfasset/standard_fonts/'
const MIN_SCALE = 0.25
const MAX_SCALE = 5
// 视口上下各预留 1100px 的预渲染带；离开该带就释放位图，长文档滚动内存才不会膨胀。
const NEAR_MARGIN = '1100px 0px'

interface PageProps {
  doc: PDFDocumentProxy
  pageNumber: number
  scale: number
  fallback: { w: number; h: number }
  rootRef: React.RefObject<HTMLDivElement | null>
  register: (pageNumber: number, el: HTMLDivElement | null) => void
  query: string
  hitOrdinal: number | null
}

const PdfPage = memo(function PdfPage({
  doc,
  pageNumber,
  scale,
  fallback,
  rootRef,
  register,
  query,
  hitOrdinal
}: PageProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const taskRef = useRef<RenderTask | null>(null)
  const pageRef = useRef<PDFPageProxy | null>(null)
  const [near, setNear] = useState(false)
  const [base, setBase] = useState<{ w: number; h: number } | null>(null)
  const [textVersion, setTextVersion] = useState(0)

  useEffect(() => {
    register(pageNumber, wrapRef.current)
    return () => register(pageNumber, null)
  }, [pageNumber, register])

  useEffect(() => {
    const el = wrapRef.current
    const root = rootRef.current
    if (!el) return
    if (!root) {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setNear(entry.isIntersecting)
      },
      { root, rootMargin: NEAR_MARGIN }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootRef])

  useEffect(() => {
    if (!near) return
    let disposed = false
    doc
      .getPage(pageNumber)
      .then((page) => {
        if (disposed) return
        pageRef.current = page
        const viewport = page.getViewport({ scale: 1 })
        setBase({ w: viewport.width, h: viewport.height })
      })
      .catch(() => {})
    return () => {
      disposed = true
    }
  }, [near, doc, pageNumber])

  useEffect(() => {
    const page = pageRef.current
    const canvas = canvasRef.current
    if (!near || !page || !canvas || !base) return
    const viewport = page.getViewport({ scale })
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`
    const task = page.render({
      canvas,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
    })
    taskRef.current = task
    task.promise.catch(() => {})
    return () => {
      taskRef.current = null
      try {
        task.cancel()
      } catch {
        // 忽略已结束任务的取消
      }
    }
  }, [near, base, scale])

  // 文本层：透明文字覆盖在画布上，支持划选复制；离开预渲染带时随画布一起释放。
  useEffect(() => {
    const page = pageRef.current
    const container = textRef.current
    if (!near || !page || !container || !base) return
    const viewport = page.getViewport({ scale })
    container.style.setProperty('--total-scale-factor', String(scale))
    container.replaceChildren()
    let disposed = false
    let layer: pdfjsLib.TextLayer | null = null
    try {
      layer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport
      })
      layer
        .render()
        .then(() => {
          if (!disposed) setTextVersion((value) => value + 1)
        })
        .catch(() => {})
    } catch {
      // 页面销毁后忽略
    }
    return () => {
      disposed = true
      try {
        layer?.cancel()
      } catch {
        // ignore
      }
      container.replaceChildren()
    }
  }, [near, base, scale])

  // 搜索命中：给文本层中命中的片段加底色，并滚动到当前命中。
  useEffect(() => {
    const container = textRef.current
    if (!container) return
    const key = query.trim().toLowerCase()
    const spans = Array.from(container.querySelectorAll<HTMLElement>('span'))
    for (const span of spans) {
      span.classList.remove('pdf-find-hit', 'pdf-find-hit-active')
      if (key && (span.textContent ?? '').toLowerCase().includes(key)) span.classList.add('pdf-find-hit')
    }
    if (hitOrdinal === null) return
    const target = container.querySelectorAll<HTMLElement>('.pdf-find-hit')[hitOrdinal]
    if (!target) return
    target.classList.add('pdf-find-hit-active')
    const scroller = rootRef.current
    if (!scroller) return
    const rect = target.getBoundingClientRect()
    const view = scroller.getBoundingClientRect()
    if (rect.top < view.top + 48 || rect.bottom > view.bottom - 48) {
      scroller.scrollTo({
        top: Math.max(0, scroller.scrollTop + rect.top - view.top - view.height / 2),
        behavior: 'auto'
      })
    }
  }, [query, hitOrdinal, textVersion, rootRef])

  // 离开预渲染带：取消任务、清零 canvas 释放位图、清理页面对象，避免长文档内存膨胀。
  useEffect(() => {
    if (near) return
    const task = taskRef.current
    if (task) {
      taskRef.current = null
      try {
        task.cancel()
      } catch {
        // ignore
      }
    }
    const canvas = canvasRef.current
    if (canvas && canvas.width > 0) {
      canvas.width = 0
      canvas.height = 0
    }
    const page = pageRef.current
    if (page) {
      pageRef.current = null
      try {
        page.cleanup()
      } catch {
        // 页面尚在收尾时忽略，再次进入会重新 getPage
      }
    }
  }, [near])

  useEffect(
    () => () => {
      const page = pageRef.current
      pageRef.current = null
      if (page) {
        try {
          page.cleanup()
        } catch {
          // ignore
        }
      }
    },
    []
  )

  const w = Math.floor((base?.w ?? fallback.w) * scale)
  const h = Math.floor((base?.h ?? fallback.h) * scale)

  return (
    <div className="pdf-page" ref={wrapRef} style={{ width: `${w}px`, minHeight: `${h}px` }}>
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div className="pdf-text-layer" ref={textRef} />
    </div>
  )
})

interface Props {
  path: string
  reloadKey?: string
  jumpTarget?: { page: number; nonce: number } | null
  initialPage?: number
  findSignal?: number
  onOutline?: (path: string, items: PdfOutlineEntry[]) => void
  onPageChange?: (path: string, page: number) => void
}

interface PdfHit {
  page: number
}

export function PdfView({
  path,
  reloadKey,
  jumpTarget,
  initialPage,
  findSignal,
  onOutline,
  onPageChange
}: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef(new Map<number, HTMLDivElement>())
  const onOutlineRef = useRef(onOutline)
  const onPageChangeRef = useRef(onPageChange)
  onOutlineRef.current = onOutline
  onPageChangeRef.current = onPageChange
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [currentPage, setCurrentPage] = useState(() => Math.max(1, initialPage ?? 1))
  const [pageInput, setPageInput] = useState(() => String(Math.max(1, initialPage ?? 1)))
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [hits, setHits] = useState<PdfHit[]>([])
  const [hitIndex, setHitIndex] = useState(0)
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null)
  const findInputRef = useRef<HTMLInputElement>(null)

  const register = useCallback((pageNumber: number, el: HTMLDivElement | null) => {
    if (el) pagesRef.current.set(pageNumber, el)
    else pagesRef.current.delete(pageNumber)
  }, [])

  useEffect(() => {
    let disposed = false
    setStatus('loading')
    setErrorMsg('')
    setNumPages(0)
    setPageSize(null)
    onOutlineRef.current?.(path, [])
    let task: pdfjsLib.PDFDocumentLoadingTask
    try {
      task = pdfjsLib.getDocument({
        url: localFileUrl(path),
        worker: createWorker(),
        cMapUrl: CMAP_URL,
        cMapPacked: true,
        standardFontDataUrl: STANDARD_FONT_URL
      })
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
      return
    }
    task.promise
      .then(async (loaded) => {
        if (disposed) {
          void task.destroy()
          return
        }
        const first = await loaded.getPage(1)
        if (disposed) {
          void task.destroy()
          return
        }
        const firstViewport = first.getViewport({ scale: 1 })
        setPageSize({ w: firstViewport.width, h: firstViewport.height })
        setDoc(loaded)
        setNumPages(loaded.numPages)
        setStatus('ready')
        void buildPdfOutline(loaded)
          .then((items) => {
            if (!disposed) onOutlineRef.current?.(path, items)
          })
          .catch(() => {})
      })
      .catch((err: unknown) => {
        if (disposed) return
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : String(err))
      })
    return () => {
      disposed = true
      void task.destroy()
    }
  }, [path, reloadKey])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = (): void => setContainerWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitScale = useMemo(() => {
    if (!containerWidth || !pageSize) return 1
    // 适应宽度时不留两侧空白，页面正好贴满容器。
    return containerWidth / pageSize.w
  }, [containerWidth, pageSize])

  const scale = zoom === 'fit' ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, fitScale)) : zoom

  const jumpTo = useCallback(
    (pageNumber: number) => {
      const total = numPages
      const target = Math.max(1, Math.min(total, Math.round(pageNumber)))
      const el = pagesRef.current.get(target)
      const scroller = scrollRef.current
      if (el && scroller) {
        scroller.scrollTo({ top: el.offsetTop - 8, behavior: 'auto' })
      }
      setCurrentPage(target)
    },
    [numPages]
  )

  useEffect(() => {
    onPageChangeRef.current?.(path, currentPage)
  }, [path, currentPage])

  // 侧栏大纲点击后跳页；nonce 变化时再次执行。
  useEffect(() => {
    if (!jumpTarget || !numPages) return
    jumpTo(jumpTarget.page)
  }, [jumpTarget, numPages, jumpTo])

  // 文档加载完成后回到当前页码：首次挂载用于恢复离开前的页码，外部重载时也保持原位置。
  useEffect(() => {
    if (!numPages) return
    if (currentPage > 1) requestAnimationFrame(() => jumpTo(currentPage))
    // 仅在文档加载完成时执行一次，currentPage 取当时的值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, jumpTo])

  // Ctrl+F（以及菜单「查找」）由 App 递增信号触发。
  useEffect(() => {
    if (!findSignal) return
    setFindOpen(true)
    requestAnimationFrame(() => {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    })
  }, [findSignal])

  // 全文搜索：逐页提取文本，命中项在文本层高亮。
  useEffect(() => {
    if (!findOpen || !doc) return
    const query = findText.trim().toLowerCase()
    setHits([])
    setHitIndex(0)
    if (!query) {
      setScanProgress(null)
      setAppliedQuery('')
      return
    }
    let cancelled = false
    const found: PdfHit[] = []
    const total = doc.numPages
    let jumped = false
    setScanProgress({ done: 0, total })
    const timer = window.setTimeout(() => {
      setAppliedQuery(query)
      void (async () => {
        for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
          if (cancelled) return
          let items: Array<{ str?: string }> = []
          try {
            const page = await doc.getPage(pageNumber)
            const content = await page.getTextContent()
            items = content.items as Array<{ str?: string }>
          } catch {
            items = []
          }
          if (cancelled) return
          items.forEach((item) => {
            if (item.str && item.str.toLowerCase().includes(query)) {
              found.push({ page: pageNumber })
            }
          })
          if (pageNumber % 100 === 0 || pageNumber === total) {
            setHits([...found])
            setScanProgress(pageNumber === total ? null : { done: pageNumber, total })
          }
          if (!jumped && found.length) {
            jumped = true
            jumpTo(found[0].page)
          }
        }
        if (cancelled) return
        setHits([...found])
        setScanProgress(null)
      })()
    }, 260)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [findText, findOpen, doc, jumpTo])

  const closeFind = useCallback(() => {
    setFindOpen(false)
    setFindText('')
    setAppliedQuery('')
    setHits([])
    setHitIndex(0)
    setScanProgress(null)
  }, [])

  const stepHit = useCallback(
    (forward: boolean) => {
      if (!hits.length) return
      const next = (hitIndex + (forward ? 1 : -1) + hits.length) % hits.length
      setHitIndex(next)
      jumpTo(hits[next].page)
      findInputRef.current?.focus()
    },
    [hits, hitIndex, jumpTo]
  )

  const activeHit = hits[hitIndex] ?? null
  const hitOrdinalFor = useCallback(
    (pageNumber: number): number | null => {
      if (!activeHit || activeHit.page !== pageNumber) return null
      let ordinal = 0
      for (let index = 0; index < hitIndex; index++) {
        if (hits[index].page === pageNumber) ordinal++
      }
      return ordinal
    },
    [activeHit, hitIndex, hits]
  )

  const onScroll = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const position = scroller.scrollTop + scroller.clientHeight * 0.35
    let found = 1
    for (const [pageNumber, el] of pagesRef.current) {
      if (el.offsetTop <= position) found = Math.max(found, pageNumber)
    }
    setCurrentPage(found)
  }, [])

  useEffect(() => {
    setPageInput(String(currentPage))
  }, [currentPage])

  const changeZoom = useCallback(
    (delta: number) => {
      setZoom((previous) => {
        const base = previous === 'fit' ? scale : previous
        return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round((base + delta) * 100) / 100))
      })
    },
    [scale]
  )

  const pages = useMemo(
    () => Array.from({ length: numPages }, (_, index) => index + 1),
    [numPages]
  )

  const fallback = useMemo(() => pageSize ?? { w: 0, h: 0 }, [pageSize])

  return (
    <div className="pdf-pane">
      {status === 'error' ? (
        <div className="pdf-message">
          <strong>无法打开 PDF</strong>
          <span>{errorMsg || '文件可能已损坏或不存在'}</span>
        </div>
      ) : (
        <>
          <div
            className={`pdf-scroll${zoom === 'fit' ? ' fit' : ''}`}
            ref={scrollRef}
            onScroll={onScroll}
          >
            {status === 'loading' ? <div className="pdf-message">正在加载…</div> : null}
            {doc ? (
              <div className="pdf-pages">
                {pages.map((pageNumber) => (
                  <PdfPage
                    key={pageNumber}
                    doc={doc}
                    pageNumber={pageNumber}
                    scale={scale}
                    fallback={fallback}
                    rootRef={scrollRef}
                    register={register}
                    query={appliedQuery}
                    hitOrdinal={hitOrdinalFor(pageNumber)}
                  />
                ))}
              </div>
            ) : null}
          </div>
          {findOpen ? (
            <div className="search-bar pdf-search">
              <SearchIcon className="search-icon" />
              <input
                ref={findInputRef}
                value={findText}
                onChange={(event) => setFindText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    stepHit(!event.shiftKey)
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    closeFind()
                  }
                }}
                placeholder="在 PDF 中查找"
                spellCheck={false}
              />
              <span className="search-count">
                {scanProgress
                  ? `${scanProgress.done}/${scanProgress.total}`
                  : findText.trim()
                    ? hits.length
                      ? `${hitIndex + 1}/${hits.length}`
                      : '0/0'
                    : ''}
              </span>
              <button
                type="button"
                className="mini-btn"
                title="上一个 (Shift+Enter)"
                onClick={() => stepHit(false)}
                disabled={!hits.length}
              >
                <ArrowUpIcon />
              </button>
              <button
                type="button"
                className="mini-btn"
                title="下一个 (Enter)"
                onClick={() => stepHit(true)}
                disabled={!hits.length}
              >
                <ArrowDownIcon />
              </button>
              <button type="button" className="mini-btn" title="关闭 (Esc)" onClick={closeFind}>
                <CloseIcon />
              </button>
            </div>
          ) : null}
          <div className="pdf-toolbar">
            <button
              type="button"
              className="pdf-btn"
              title="查找 (Ctrl+F)"
              aria-label="在 PDF 中查找"
              onClick={() => {
                setFindOpen(true)
                requestAnimationFrame(() => findInputRef.current?.focus())
              }}
            >
              <SearchIcon />
            </button>
            <span className="pdf-divider" />
            <button
              type="button"
              className="pdf-btn"
              title="上一页"
              disabled={currentPage <= 1}
              onClick={() => jumpTo(currentPage - 1)}
            >
              <ChevronLeftIcon />
            </button>
            <span className="pdf-page-field">
              <input
                className="pdf-page-input"
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value.replace(/[^\d]/g, ''))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') jumpTo(Number(pageInput))
                }}
                onBlur={() => setPageInput(String(currentPage))}
                aria-label="页码"
              />
              <span className="pdf-page-total">/ {numPages || '–'}</span>
            </span>
            <button
              type="button"
              className="pdf-btn"
              title="下一页"
              disabled={numPages === 0 || currentPage >= numPages}
              onClick={() => jumpTo(currentPage + 1)}
            >
              <ChevronRightIcon />
            </button>
            <span className="pdf-divider" />
            <button
              type="button"
              className="pdf-btn"
              title="缩小"
              disabled={scale <= MIN_SCALE}
              onClick={() => changeZoom(-0.25)}
            >
              <ZoomOutIcon />
            </button>
            <button
              type="button"
              className="pdf-btn pdf-zoom-label"
              title="适应宽度"
              onClick={() => setZoom('fit')}
            >
              {zoom === 'fit' ? '适应' : `${Math.round(scale * 100)}%`}
            </button>
            <button
              type="button"
              className="pdf-btn"
              title="放大"
              disabled={scale >= MAX_SCALE}
              onClick={() => changeZoom(0.25)}
            >
              <ZoomInIcon />
            </button>
            <button
              type="button"
              className="pdf-btn pdf-btn-text"
              title="适应宽度"
              disabled={zoom === 'fit'}
              onClick={() => setZoom('fit')}
            >
              <ArrowUpIcon className="pdf-fit-icon" />
              适应宽度
            </button>
          </div>
        </>
      )}
    </div>
  )
}
