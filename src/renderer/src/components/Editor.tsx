import { useEffect, useRef } from 'react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  placeholder
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands'
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap
} from '@codemirror/search'
import { HighlightStyle, bracketMatching, syntaxHighlighting } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { tags } from '@lezer/highlight'
import type { ThemeMode } from '../../../shared/types'
import { loadLanguage } from '../lib/codeLanguage'

export interface EditorHandle {
  focus(): void
  openSearch(): void
  undo(): void
  redo(): void
}

interface Props {
  value: string
  theme: ThemeMode
  wordWrap: boolean
  language: string
  readOnly: boolean
  lite: boolean
  onChange: (next: string) => void
  onReady: (handle: EditorHandle) => void
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
          padding: '34px 44px 150px',
          maxWidth: 'min(calc(var(--content-w) + 88px), 100%)',
          margin: '0 auto',
          caretColor: 'var(--accent)'
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
        '.cm-panel.cm-search': { padding: '6px 10px', fontSize: '12.5px' },
        '.cm-textfield': {
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border-strong)',
          borderRadius: '5px',
          color: 'var(--text)',
          padding: '2px 6px'
        },
        '.cm-button': {
          backgroundImage: 'none',
          backgroundColor: 'var(--bg-sidebar)',
          border: '1px solid var(--border)',
          borderRadius: '5px',
          color: 'var(--text-2)'
        },
        '.cm-placeholder': { color: 'var(--text-3)' }
      },
      { dark: theme === 'dark' }
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
  language,
  readOnly,
  lite,
  onChange,
  onReady
}: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const changeRef = useRef(onChange)
  const readyRef = useRef(onReady)
  const themeCompartment = useRef(new Compartment())
  const wrapCompartment = useRef(new Compartment())
  const langCompartment = useRef(new Compartment())
  const readCompartment = useRef(new Compartment())
  const featureCompartment = useRef(new Compartment())
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
    readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []

  const featureExtensions = (): Extension =>
    lite ? [] : [highlightActiveLine(), highlightSelectionMatches(), bracketMatching()]

  useEffect(() => {
    changeRef.current = onChange
  }, [onChange])

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
          featureCompartment.current.of(featureExtensions()),
          search({ top: true }),
          langCompartment.current.of(initialLang.current ?? []),
          readCompartment.current.of(readOnlyExtensions()),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
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
      }
    })
    return () => {
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
