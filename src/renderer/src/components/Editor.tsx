import { useEffect, useRef } from 'react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'

import {
  EditorView,
  ViewPlugin,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands'
import {
  SearchQuery,
  closeSearchPanel,
  getSearchQuery,
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
  searchPanelOpen,
  setSearchQuery
} from '@codemirror/search'
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  syntaxHighlighting
} from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { tags } from '@lezer/highlight'
import type { ThemeMode } from '../../../shared/types'
import { isDarkTheme } from '../../../shared/themes'
import { loadLanguage } from '../lib/codeLanguage'

const SEARCH_PHRASES = {
  Find: '查找',
  Replace: '替换为',
  next: '下一个',
  previous: '上一个',
  all: '全选匹配',
  'match case': '区分大小写',
  regexp: '正则',
  'by word': '全字匹配',
  replace: '替换',
  'replace all': '全部替换',
  close: '关闭',
  'Go to line': '跳转到行',
  go: '跳转',
  'current match': '当前匹配',
  'on line': '位于第',
  'replaced match on line $': '已替换第 $ 行的匹配',
  'replaced $ matches': '已替换 $ 处匹配',
  'Control character': '控制字符'
}

const replaceToggleExtension = ViewPlugin.fromClass(
  class {
    private observer: MutationObserver
    private expanded = false
    private rebuildQueued = false

    constructor(private view: EditorView) {
      this.observer = new MutationObserver(() => this.sync())
      this.observer.observe(view.dom, { childList: true, subtree: true })
    }

    update(update: { state: EditorState; startState: EditorState }): void {
      if (update.state.readOnly !== update.startState.readOnly) this.sync()
    }

    destroy(): void {
      this.observer.disconnect()
    }

    private sync(): void {
      const panel = this.view.dom.querySelector<HTMLElement>('.cm-panel.cm-search')
      if (!panel) return
      const existing = panel.querySelector<HTMLButtonElement>('.mdv-replace-toggle')
      if (this.view.state.readOnly) {
        existing?.remove()
        return
      }
      if (!panel.querySelector('input[name=replace]')) {
        this.scheduleRebuild()
        return
      }
      let button = existing
      if (!button) {
        button = document.createElement('button')
        button.type = 'button'
        button.className = 'cm-button mdv-replace-toggle'
        button.textContent = '替换'
        button.addEventListener('mousedown', (event) => event.preventDefault())
        button.addEventListener('click', () => {
          this.expanded = !this.expanded
          this.apply(panel, button!)
        })
        panel.insertBefore(button, panel.querySelector('label'))
      }
      this.apply(panel, button)
    }

    private apply(panel: HTMLElement, button: HTMLButtonElement): void {
      panel.classList.toggle('mdv-replace-open', this.expanded)
      button.setAttribute('aria-expanded', String(this.expanded))
      const title = this.expanded ? '隐藏替换栏' : '显示替换栏'
      button.title = title
      button.setAttribute('aria-label', title)
    }

    private scheduleRebuild(): void {
      if (this.rebuildQueued) return
      this.rebuildQueued = true
      queueMicrotask(() => {
        this.rebuildQueued = false
        if (this.view.state.readOnly || !searchPanelOpen(this.view.state)) return
        const panel = this.view.dom.querySelector<HTMLElement>('.cm-panel.cm-search')
        if (!panel || panel.querySelector('input[name=replace]')) return
        const searchInput = panel.querySelector<HTMLInputElement>('input[name=search]')
        const replaceInput = panel.querySelector<HTMLInputElement>('input[name=replace]')
        const current = getSearchQuery(this.view.state)
        const search = searchInput?.value ?? current.search
        const replace = replaceInput?.value ?? current.replace
        const focused = this.view.root.activeElement === searchInput
        const selectionStart = searchInput?.selectionStart ?? null
        const selectionEnd = searchInput?.selectionEnd ?? null
        closeSearchPanel(this.view)
        openSearchPanel(this.view)
        if (search) {
          this.view.dispatch({
            effects: setSearchQuery.of(
              new SearchQuery({
                search,
                replace,
                caseSensitive: current.caseSensitive,
                literal: current.literal,
                regexp: current.regexp,
                wholeWord: current.wholeWord
              })
            )
          })
        }
        if (focused) {
          const next = this.view.dom.querySelector<HTMLInputElement>('.cm-search input[name=search]')
          if (next) {
            next.focus()
            next.setSelectionRange(selectionStart ?? next.value.length, selectionEnd ?? next.value.length)
          }
        }
      })
    }
  }
)

export interface EditorHandle {
  focus(): void
  openSearch(): void
  undo(): void
  redo(): void
  selectAll(): void
}

interface Props {
  value: string
  theme: ThemeMode
  wordWrap: boolean
  showLineNumbers: boolean
  language: string
  readOnly: boolean
  lite: boolean
  onChange: (next: string) => void
  onReady: (handle: EditorHandle) => void
  onPasteImage?: (file: File) => Promise<string | null>
  initialScrollLine?: number
  onScrollLine?: (line: number) => void
}

function editorTheme(theme: ThemeMode): Extension {
  return [
    EditorView.theme(
      {
        '&': {
          height: '100%',
          backgroundColor: 'transparent',
          color: 'var(--text)'
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': {
          fontFamily: 'var(--font-mono)',
          lineHeight: '1.8',
          overflow: 'auto'
        },
        '.cm-content': {
          padding: '0 32px 150px 0',
          caretColor: 'var(--accent)'
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          color: 'var(--text-3)',
          border: 'none',
          paddingLeft: '2px'
        },
        '.cm-lineNumbers .cm-gutterElement': {
          padding: '0 8px 0 10px',
          minWidth: '38px',
          textAlign: 'right'
        },
        '.cm-foldGutter .cm-gutterElement': {
          padding: '0 3px',
          cursor: 'pointer'
        },
        '.cm-foldGutter span': { color: 'var(--text-3)' },
        '.cm-foldGutter .cm-gutterElement:hover span': { color: 'var(--text)' },
        '.cm-activeLineGutter': {
          backgroundColor: 'var(--hover)',
          color: 'var(--text)'
        },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
        '.cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: 'var(--accent-weak)'
        },
        '&.cm-focused .cm-selectionBackground': {
          backgroundColor: 'var(--accent-weak)'
        },
        '.cm-activeLine': { backgroundColor: 'var(--hover)' },
        '.cm-selectionMatch': { backgroundColor: 'var(--accent-weak)' },
        '.cm-searchMatch': {
          backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
          borderRadius: '3px'
        },
        '.cm-searchMatch.cm-searchMatch-selected': {
          backgroundColor: 'color-mix(in srgb, var(--accent) 36%, transparent)'
        },
        '.cm-panels': {
          backgroundColor: 'var(--bg-elev)',
          color: 'var(--text)',
          borderColor: 'var(--border)'
        },
        '.cm-panels-top': { borderBottom: '1px solid var(--border)' },
        '.cm-panel.cm-search': {
          position: 'relative',
          display: 'block',
          padding: '8px 42px 8px 10px',
          fontSize: '12.5px',
          lineHeight: '1'
        },
        '.cm-search > input, .cm-search > button, .cm-search > label': {
          verticalAlign: 'middle',
          margin: '3px 6px 3px 0'
        },
        '.cm-search br': { display: 'none' },
        '.cm-search input[name=replace], .cm-search button[name=replace], .cm-search button[name=replaceAll]': {
          display: 'none'
        },
        '.cm-search.mdv-replace-open br': {
          display: 'block',
          height: '0',
          lineHeight: '0',
          margin: '0'
        },
        '.cm-search.mdv-replace-open input[name=replace]': { display: 'inline-block' },
        '.cm-search.mdv-replace-open button[name=replace], .cm-search.mdv-replace-open button[name=replaceAll]': {
          display: 'inline-block'
        },
        '&[data-readonly="true"] .cm-panel.cm-search::after': {
          content: '"只读模式不可替换，按 Ctrl+E 进入编辑"',
          display: 'block',
          marginTop: '6px',
          color: 'var(--text-3)',
          fontSize: '11.5px'
        },
        '.cm-search .cm-textfield': {
          width: '190px',
          height: '28px',
          padding: '0 10px',
          fontSize: '12.5px',
          color: 'var(--text)',
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border-strong)',
          borderRadius: '7px',
          outline: 'none'
        },
        '.cm-search input[name=search]': {
          paddingLeft: '30px',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239197a1' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='6.5'/%3E%3Cpath d='M16 16l4.5 4.5'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: '9px center',
          backgroundSize: '13px'
        },
        '.cm-search .cm-textfield::placeholder': { color: 'var(--text-3)' },
        '.cm-search .cm-textfield:focus': {
          borderColor: 'var(--accent)',
          boxShadow: '0 0 0 3px var(--accent-weak)'
        },
        '.cm-search .cm-button': {
          height: '28px',
          padding: '0 10px',
          backgroundImage: 'none',
          backgroundColor: 'var(--bg-sidebar)',
          border: '1px solid var(--border)',
          borderRadius: '7px',
          color: 'var(--text-2)',
          fontSize: '12px',
          lineHeight: '1',
          cursor: 'pointer',
          transition: 'background-color .15s, color .15s, border-color .15s'
        },
        '.cm-search .cm-button:hover': {
          backgroundColor: 'var(--hover)',
          color: 'var(--text)',
          borderColor: 'var(--border-strong)'
        },
        '.cm-search .mdv-replace-toggle': {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px'
        },
        '.cm-search .mdv-replace-toggle::after': {
          content: '"▸"',
          fontSize: '9px',
          lineHeight: '1',
          opacity: '0.65'
        },
        '.cm-search .mdv-replace-toggle[aria-expanded="true"]': {
          backgroundColor: 'var(--accent-weak)',
          borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)',
          color: 'var(--accent)'
        },
        '.cm-search .mdv-replace-toggle[aria-expanded="true"]:hover': {
          backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent) 55%, transparent)',
          color: 'var(--accent)'
        },
        '.cm-search .mdv-replace-toggle[aria-expanded="true"]::after': {
          content: '"▾"'
        },
        '.cm-search label': {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          height: '28px',
          padding: '0 10px 0 8px',
          border: '1px solid var(--border)',
          borderRadius: '999px',
          color: 'var(--text-2)',
          fontSize: '12px',
          lineHeight: '14px',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          userSelect: 'none'
        },
        '.cm-search label:hover': { backgroundColor: 'var(--hover)', color: 'var(--text)' },
        '.cm-search label:has(input:checked)': {
          backgroundColor: 'var(--accent-weak)',
          borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)',
          color: 'var(--accent)'
        },
        '.cm-search label:has(input:focus-visible)': {
          boxShadow: '0 0 0 2px var(--accent-weak)'
        },
        '.cm-search label input[type=checkbox]': {
          appearance: 'none',
          flex: '0 0 auto',
          display: 'block',
          width: '14px',
          height: '14px',
          margin: '0 !important',
          padding: '0',
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border-strong)',
          borderRadius: '4px',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundSize: '10px 10px',
          cursor: 'pointer'
        },
        '.cm-search label input[type=checkbox]:checked': {
          backgroundColor: 'var(--accent)',
          borderColor: 'var(--accent)',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.4 8.3l3.1 3.1 6.2-6.8' fill='none' stroke='%23fff' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")"
        },
        '.cm-search button[name=close]': {
          position: 'absolute',
          right: '8px',
          top: '9px',
          display: 'grid',
          placeItems: 'center',
          width: '26px',
          height: '26px',
          margin: '0',
          padding: '0',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '7px',
          color: 'var(--text-3)',
          fontSize: '16px',
          lineHeight: '1',
          cursor: 'pointer'
        },
        '.cm-search button[name=close]:hover': {
          backgroundColor: 'var(--hover)',
          color: 'var(--text)'
        },
        '.cm-search .cm-button:focus-visible, .cm-search button[name=close]:focus-visible': {
          outline: '2px solid var(--accent)',
          outlineOffset: '1px'
        },
        '.cm-placeholder': { color: 'var(--text-3)' }
      },
      { dark: isDarkTheme(theme) }
    ),
    syntaxHighlighting(
      HighlightStyle.define([
        { tag: tags.heading1, color: 'var(--accent)', fontWeight: '700', fontSize: '1.28em' },
        { tag: tags.heading2, color: 'var(--accent)', fontWeight: '700', fontSize: '1.16em' },
        { tag: tags.heading3, color: 'var(--accent)', fontWeight: '650', fontSize: '1.06em' },
        {
          tag: [tags.heading4, tags.heading5, tags.heading6],
          color: 'var(--text)',
          fontWeight: '650'
        },
        { tag: tags.strong, fontWeight: '700' },
        { tag: tags.emphasis, fontStyle: 'italic' },
        { tag: [tags.link, tags.url], color: 'var(--accent)' },
        { tag: tags.monospace, color: 'var(--hl-title)' },
        { tag: tags.quote, color: 'var(--text-2)', fontStyle: 'italic' },
        { tag: [tags.meta, tags.processingInstruction, tags.annotation], color: 'var(--text-3)' },
        { tag: tags.contentSeparator, color: 'var(--border-strong)' },
        { tag: tags.strikethrough, textDecoration: 'line-through' },
        { tag: tags.list, color: 'var(--accent)' },
        {
          tag: [
            tags.keyword,
            tags.modifier,
            tags.controlKeyword,
            tags.operatorKeyword,
            tags.definitionKeyword,
            tags.moduleKeyword,
            tags.self
          ],
          color: 'var(--hl-keyword)'
        },
        {
          tag: [
            tags.string,
            tags.docString,
            tags.character,
            tags.attributeValue,
            tags.regexp,
            tags.escape
          ],
          color: 'var(--hl-string)'
        },
        {
          tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
          color: 'var(--hl-comment)',
          fontStyle: 'italic'
        },
        {
          tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null, tags.atom, tags.unit],
          color: 'var(--hl-number)'
        },
        {
          tag: [tags.typeName, tags.className, tags.namespace, tags.definition(tags.typeName)],
          color: 'var(--hl-title)'
        },
        { tag: [tags.propertyName, tags.attributeName], color: 'var(--hl-attr)' },
        {
          tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
          color: 'var(--hl-title)'
        },
        {
          tag: [tags.standard(tags.variableName), tags.standard(tags.name)],
          color: 'var(--hl-builtin)'
        },
        {
          tag: [tags.definition(tags.variableName), tags.local(tags.variableName)],
          color: 'var(--hl-variable)'
        },
        { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket], color: 'var(--text-2)' },
        { tag: tags.invalid, color: 'var(--danger)' }
      ])
    )
  ]
}

export function Editor({
  value,
  theme,
  wordWrap,
  showLineNumbers,
  language,
  readOnly,
  lite,
  onChange,
  onReady,
  onPasteImage,
  initialScrollLine,
  onScrollLine
}: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const changeRef = useRef(onChange)
  const readyRef = useRef(onReady)
  const pasteImageRef = useRef(onPasteImage)
  const scrollLineRef = useRef(onScrollLine)
  const pasteModeRef = useRef({ language, readOnly })
  const themeCompartment = useRef(new Compartment())
  const wrapCompartment = useRef(new Compartment())
  const langCompartment = useRef(new Compartment())
  const readCompartment = useRef(new Compartment())
  const featureCompartment = useRef(new Compartment())
  const lineNumberCompartment = useRef(new Compartment())
  const foldCompartment = useRef(new Compartment())
  const initialLang = useRef<Extension | null>(null)
  if (initialLang.current === null) {
    initialLang.current = lite ? [] : language === 'markdown' ? markdown() : []
  }
  const mountedLangRef = useRef<string>(
    lite ? '' : language === 'markdown' ? 'markdown' : ''
  )
  const emittedRef = useRef<string | null>(value)
  const suppressRef = useRef(false)

  const readOnlyExtensions = (): Extension =>
    readOnly
      ? [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.editorAttributes.of({ 'data-readonly': 'true' })
        ]
      : []

  const featureExtensions = (): Extension =>
    lite ? [] : [highlightActiveLine(), highlightSelectionMatches(), bracketMatching()]

  const lineNumberExtensions = (): Extension =>
    showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []

  const foldExtensions = (): Extension => (lite ? [] : foldGutter())

  useEffect(() => {
    changeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    pasteImageRef.current = onPasteImage
  }, [onPasteImage])

  useEffect(() => {
    scrollLineRef.current = onScrollLine
  }, [onScrollLine])

  useEffect(() => {
    pasteModeRef.current = { language, readOnly }
  }, [language, readOnly])

  useEffect(() => {
    readyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          wrapCompartment.current.of(wordWrap ? EditorView.lineWrapping : []),
          drawSelection(),
          lineNumberCompartment.current.of(lineNumberExtensions()),
          foldCompartment.current.of(foldExtensions()),
          featureCompartment.current.of(featureExtensions()),
          search({ top: true }),
          replaceToggleExtension,
          EditorState.phrases.of(SEARCH_PHRASES),
          langCompartment.current.of(initialLang.current ?? []),
          readCompartment.current.of(readOnlyExtensions()),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            indentWithTab
          ]),
          // 粘贴截图或剪贴板图片时拦截默认行为，交给 App 保存并在原选区插入链接；
          // 只要剪贴板含图片就按图片处理（部分工具的截图会同时附带文本）。
          EditorView.domEventHandlers({
            paste: (event, view) => {
              const mode = pasteModeRef.current
              if (mode.language !== 'markdown' || mode.readOnly || view.state.readOnly) return false
              const item = Array.from(event.clipboardData?.items ?? []).find(
                (entry) => entry.kind === 'file' && entry.type.startsWith('image/')
              )
              const file = item?.getAsFile()
              const handle = pasteImageRef.current
              if (!file || !handle) return false
              event.preventDefault()
              const { from, to } = view.state.selection.main
              void handle(file)
                .then((snippet) => {
                  if (!snippet || viewRef.current !== view || !view.dom.isConnected) return
                  const start = Math.min(from, view.state.doc.length)
                  const end = Math.min(to, view.state.doc.length)
                  view.dispatch({
                    changes: { from: start, to: end, insert: snippet },
                    selection: { anchor: start + snippet.length },
                    scrollIntoView: true
                  })
                  view.focus()
                })
                .catch(() => {})
              return true
            }
          }),
          themeCompartment.current.of(editorTheme(theme)),
          EditorView.theme({ '&': { fontSize: 'var(--editor-size, 13.5px)' } }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            const next = update.state.doc.toString()
            emittedRef.current = next
            if (suppressRef.current) return
            changeRef.current(next)
          }),
          placeholder(language === 'markdown' ? '开始撰写 Markdown…' : '空文件')
        ]
      })
    })
    viewRef.current = view
    readyRef.current({
      focus: () => view.focus(),
      openSearch: () => openSearchPanel(view),
      undo: () => {
        undo(view)
        view.focus()
      },
      redo: () => {
        redo(view)
        view.focus()
      },
      selectAll: () => {
        view.focus()
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
      }
    })
    let scrollFrame = 0
    const trackScroll = (): void => {
      if (scrollFrame) return
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0
        if (!view.dom.isConnected) return
        const pos = view.lineBlockAtHeight(view.scrollDOM.scrollTop).from
        scrollLineRef.current?.(view.state.doc.lineAt(pos).number)
      })
    }
    view.scrollDOM.addEventListener('scroll', trackScroll, { passive: true })
    if (initialScrollLine && initialScrollLine > 1) {
      view.requestMeasure({
        read: (target) =>
          target.lineBlockAt(
            target.state.doc.line(Math.min(initialScrollLine, target.state.doc.lines)).from
          ).top,
        write: (top, target) => {
          if (top > 0) target.scrollDOM.scrollTop = top
        }
      })
    }
    return () => {
      window.cancelAnimationFrame(scrollFrame)
      view.scrollDOM.removeEventListener('scroll', trackScroll)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const target = lite ? '' : language
    if (mountedLangRef.current === target) return
    if (target === '') {
      mountedLangRef.current = ''
      view.dispatch({ effects: langCompartment.current.reconfigure([]) })
      return
    }
    if (target === 'markdown') {
      mountedLangRef.current = 'markdown'
      view.dispatch({ effects: langCompartment.current.reconfigure(markdown()) })
      return
    }
    let cancelled = false
    void loadLanguage(target).then((ext) => {
      if (cancelled) return
      mountedLangRef.current = target
      view.dispatch({ effects: langCompartment.current.reconfigure(ext) })
    })
    return () => {
      cancelled = true
    }
  }, [language, lite])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readCompartment.current.reconfigure(readOnlyExtensions())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(editorTheme(theme))
    })
  }, [theme])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(wordWrap ? EditorView.lineWrapping : [])
    })
  }, [wordWrap])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: featureCompartment.current.reconfigure(featureExtensions())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lite])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: lineNumberCompartment.current.reconfigure(lineNumberExtensions())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLineNumbers])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: foldCompartment.current.reconfigure(foldExtensions())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lite])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (value === emittedRef.current) return
    const current = view.state.doc.toString()
    if (current === value) {
      emittedRef.current = current
      return
    }
    suppressRef.current = true
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value }
    })
    suppressRef.current = false
    emittedRef.current = value
  }, [value])

  return <div className="editor-host" ref={hostRef} />
}
