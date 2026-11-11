export type FormatAction =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'underline'
  | 'highlight'
  | 'code'
  | 'codeBlock'
  | 'quote'
  | 'ul'
  | 'ol'
  | 'task'
  | 'link'
  | 'image'
  | 'table'
  | 'hr'
  | 'inlineMath'
  | 'blockMath'
  | 'details'
  | 'footnote'

export interface FormatChange {
  from: number
  to: number
  insert: string
}

export interface FormatResult extends FormatChange {
  selFrom: number
  selTo: number
  extra?: FormatChange[]
}

type WrapAction = 'bold' | 'italic' | 'strike' | 'underline' | 'highlight' | 'code' | 'inlineMath'

const WRAP_MARKS: Record<WrapAction, { open: string; close: string; placeholder: string }> = {
  bold: { open: '**', close: '**', placeholder: '粗体' },
  italic: { open: '*', close: '*', placeholder: '斜体' },
  strike: { open: '~~', close: '~~', placeholder: '删除线' },
  underline: { open: '<u>', close: '</u>', placeholder: '下划线' },
  highlight: { open: '<mark>', close: '</mark>', placeholder: '高亮' },
  code: { open: '`', close: '`', placeholder: '代码' },
  inlineMath: { open: '$', close: '$', placeholder: '公式' }
}

const HEADING_PREFIX = /^(\s*)(#{1,6})[ \t]+/
const LINE_PREFIX = /^(\s*)(>[ \t]?)?((?:[-*+][ \t]+\[[ xX]\][ \t]+)|(?:[-*+][ \t]+)|(?:\d+[.)][ \t]+))?/

type LineKind = 'none' | 'quote' | 'ul' | 'ol' | 'task'

function lineStartAt(source: string, pos: number): number {
  return source.lastIndexOf('\n', pos - 1) + 1
}

function lineEndAt(source: string, pos: number): number {
  const index = source.indexOf('\n', pos)
  return index === -1 ? source.length : index
}

function selectedBlock(source: string, from: number, to: number): { start: number; end: number; lines: string[] } {
  const effectiveTo = to > from && source[to - 1] === '\n' ? to - 1 : to
  const start = lineStartAt(source, from)
  const end = lineEndAt(source, effectiveTo)
  return { start, end, lines: source.slice(start, end).split('\n') }
}

function prefixOf(line: string): { kind: LineKind; indent: string; rest: string; checkbox: string } {
  const match = LINE_PREFIX.exec(line)
  const indent = match?.[1] ?? ''
  const quote = match?.[2]
  const list = match?.[3]
  if (list) {
    const box = /^[-*+][ \t]+(\[[ xX]\])[ \t]+/.exec(list)
    if (box) return { kind: 'task', indent, rest: line.slice((match?.[0] ?? '').length), checkbox: box[1] }
    if (/^\d/.test(list)) return { kind: 'ol', indent, rest: line.slice((match?.[0] ?? '').length), checkbox: '' }
    return { kind: 'ul', indent, rest: line.slice((match?.[0] ?? '').length), checkbox: '' }
  }
  if (quote) return { kind: 'quote', indent, rest: line.slice((match?.[0] ?? '').length), checkbox: '' }
  return { kind: 'none', indent, rest: line, checkbox: '' }
}

function wrapInline(source: string, from: number, to: number, action: WrapAction): FormatResult {
  const { open, close, placeholder } = WRAP_MARKS[action]
  const openSize = open.length
  const closeSize = close.length
  const isItalic = action === 'italic'
  if (from === to) {
    const before = source.slice(Math.max(0, from - openSize), from)
    const after = source.slice(to, to + closeSize)
    const italicGuard = !isItalic || (source[from - 2] !== '*' && source[to + 1] !== '*')
    if (before === open && after === close && italicGuard) {
      return { from: from - openSize, to: to + closeSize, insert: '', selFrom: from - openSize, selTo: from - openSize }
    }
    const insert = open + placeholder + close
    return { from, to, insert, selFrom: from + openSize, selTo: from + openSize + placeholder.length }
  }
  const selected = source.slice(from, to)
  const innerWrapped =
    selected.length >= openSize + closeSize &&
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    (!isItalic || !selected.startsWith('**'))
  if (innerWrapped) {
    const inner = selected.slice(openSize, selected.length - closeSize)
    return { from, to, insert: inner, selFrom: from, selTo: from + inner.length }
  }
  const outerBefore = source.slice(Math.max(0, from - openSize), from)
  const outerAfter = source.slice(to, to + closeSize)
  const outerGuard = !isItalic || (source[from - openSize - 1] !== '*' && source[to + closeSize] !== '*')
  if (outerBefore === open && outerAfter === close && outerGuard) {
    return { from: from - openSize, to: to + closeSize, insert: selected, selFrom: from - openSize, selTo: from - openSize + selected.length }
  }
  const insert = open + selected + close
  return { from, to, insert, selFrom: from + openSize, selTo: from + openSize + selected.length }
}

function heading(source: string, from: number, to: number): FormatResult {
  const { start, end, lines } = selectedBlock(source, from, to)
  if (lines.length === 1 && lines[0].trim() === '') {
    return { from: start, to: end, insert: '# ', selFrom: start + 2, selTo: start + 2 }
  }
  const levels = lines
    .filter((line) => line.trim() !== '')
    .map((line) => HEADING_PREFIX.exec(line)?.[2].length ?? 0)
  const uniform = levels.length > 0 && levels.every((level) => level === levels[0])
  const next = uniform ? (levels[0] >= 6 ? 0 : levels[0] + 1) : 1
  const insert = lines
    .map((line) => {
      if (line.trim() === '') return line
      const base = line.replace(HEADING_PREFIX, '$1')
      return next === 0 ? base : `${'#'.repeat(next)} ${base.trimStart()}`
    })
    .join('\n')
  const cursor = start + insert.length
  return from === to
    ? { from: start, to: end, insert, selFrom: cursor, selTo: cursor }
    : { from: start, to: end, insert, selFrom: start, selTo: cursor }
}

function linePrefix(source: string, from: number, to: number, target: 'quote' | 'ul' | 'ol' | 'task'): FormatResult {
  const { start, end, lines } = selectedBlock(source, from, to)
  if (lines.length === 1 && lines[0].trim() === '') {
    const marker = target === 'quote' ? '> ' : target === 'ul' ? '- ' : target === 'ol' ? '1. ' : '- [ ] '
    return { from: start, to: end, insert: marker, selFrom: start + marker.length, selTo: start + marker.length }
  }
  const parsed = lines.map(prefixOf)
  const nonEmpty = parsed.filter((_, index) => lines[index].trim() !== '')
  const toggleOff = nonEmpty.length > 0 && nonEmpty.every((item) => item.kind === target)
  let order = 0
  const insert = lines
    .map((line, index) => {
      if (line.trim() === '') return line
      const { kind, indent, rest, checkbox } = parsed[index]
      if (toggleOff) return indent + rest
      order += 1
      if (target === 'quote') return `${indent}> ${rest}`
      if (target === 'ul') return `${indent}- ${rest}`
      if (target === 'ol') return `${indent}${order}. ${rest}`
      return `${indent}- ${kind === 'task' && checkbox ? checkbox : '[ ]'} ${rest}`
    })
    .join('\n')
  const cursor = start + insert.length
  return from === to
    ? { from: start, to: end, insert, selFrom: cursor, selTo: cursor }
    : { from: start, to: end, insert, selFrom: start, selTo: cursor }
}

function fenceBlock(source: string, from: number, to: number, fence: string): FormatResult {
  const escaped = fence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (from !== to) {
    const selected = source.slice(from, to)
    const fenceOpen = new RegExp(`^${escaped}[^\\n]*\\n`).exec(selected)
    const fenceClose = new RegExp(`\\n${escaped}[ \\t]*$`).exec(selected)
    if (fenceOpen && fenceClose) {
      const inner = selected.slice(fenceOpen[0].length, selected.length - fenceClose[0].length)
      return { from, to, insert: inner, selFrom: from, selTo: from + inner.length }
    }
    const body = selected.endsWith('\n') ? selected : selected + '\n'
    const insert = fence + '\n' + body + fence
    return { from, to, insert, selFrom: from + fence.length, selTo: from + fence.length }
  }
  const start = lineStartAt(source, from)
  const end = lineEndAt(source, from)
  const line = source.slice(start, end)
  if (line.trimStart().startsWith(fence)) {
    return { from: start, to: end, insert: '', selFrom: start, selTo: start }
  }
  const blank = line.trim() === ''
  const at = blank ? start : end
  const rangeTo = blank ? end : at
  const after = source.slice(rangeTo)
  const lead = blank ? '' : '\n'
  const tail = after === '' || after.startsWith('\n') ? '' : '\n'
  const insert = lead + fence + '\n\n' + fence + tail
  const cursor = at + lead.length + fence.length + 1
  return { from: at, to: rangeTo, insert, selFrom: cursor, selTo: cursor }
}

function footnote(source: string, from: number, to: number): FormatResult {
  const used = new Set<number>()
  const pattern = /\[\^([^\]\n]+)\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    const id = Number.parseInt(match[1], 10)
    if (Number.isInteger(id) && String(id) === match[1]) used.add(id)
  }
  let next = 1
  while (used.has(next)) next += 1
  const ref = `[^${next}]`
  const insert = source.slice(from, to) + ref
  const delta = insert.length - (to - from)
  const lead = source === '' || source.endsWith('\n\n') ? '' : source.endsWith('\n') ? '\n' : '\n\n'
  const definition = `${lead}${ref}: 脚注内容\n`
  const selFrom = source.length + delta + lead.length + ref.length + 2
  return {
    from,
    to,
    insert,
    selFrom,
    selTo: selFrom + 4,
    extra: [{ from: source.length, to: source.length, insert: definition }]
  }
}

function linkLike(source: string, from: number, to: number, image: boolean): FormatResult {
  const bang = image ? '!' : ''
  const placeholder = image ? '图片描述' : '链接文字'
  if (from === to) {
    const insert = `${bang}[${placeholder}](url)`
    return { from, to, insert, selFrom: from + bang.length + 1, selTo: from + bang.length + 1 + placeholder.length }
  }
  const text = source.slice(from, to).replace(/\n/g, ' ')
  const insert = `${bang}[${text}](url)`
  const urlStart = from + bang.length + 1 + text.length + 2
  return { from, to, insert, selFrom: urlStart, selTo: urlStart + 3 }
}

function isolatedInsert(source: string, from: number, body: string, selectFrom: number, selectTo: number): FormatResult {
  const start = lineStartAt(source, from)
  const end = lineEndAt(source, from)
  const blank = source.slice(start, end).trim() === ''
  const at = blank ? start : end
  const to = blank ? end : at
  const before = source.slice(0, at)
  const after = source.slice(to)
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const tail = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  const insert = lead + body + tail
  return { from: at, to, insert, selFrom: at + lead.length + selectFrom, selTo: at + lead.length + selectTo }
}

export function formatMarkdown(source: string, from: number, to: number, action: FormatAction): FormatResult {
  const start = Math.max(0, Math.min(from, source.length))
  const end = Math.max(start, Math.min(to, source.length))
  switch (action) {
    case 'bold':
    case 'italic':
    case 'strike':
    case 'underline':
    case 'highlight':
    case 'code':
    case 'inlineMath':
      return wrapInline(source, start, end, action)
    case 'heading':
      return heading(source, start, end)
    case 'quote':
    case 'ul':
    case 'ol':
    case 'task':
      return linePrefix(source, start, end, action)
    case 'codeBlock':
      return fenceBlock(source, start, end, '```')
    case 'blockMath':
      return fenceBlock(source, start, end, '$$')
    case 'link':
      return linkLike(source, start, end, false)
    case 'image':
      return linkLike(source, start, end, true)
    case 'table': {
      const skeleton = '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |'
      return isolatedInsert(source, start, skeleton, 2, 5)
    }
    case 'hr':
      return isolatedInsert(source, start, '---', 3, 3)
    case 'details': {
      const skeleton = '<details>\n<summary>折叠标题</summary>\n\n折叠内容\n\n</details>'
      return isolatedInsert(source, start, skeleton, 19, 23)
    }
    case 'footnote':
      return footnote(source, start, end)
  }
}