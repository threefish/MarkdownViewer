const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'BR',
  'CAPTION',
  'DD',
  'DETAILS',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'SUMMARY',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL'
])

interface TextSpan {
  node: Text
  start: number
  length: number
}

function buildHaystack(root: HTMLElement): { text: string; spans: TextSpan[] } {
  const spans: TextSpan[] = []
  let text = ''

  const walk = (parent: Node): void => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        const node = child as Text
        if (!node.data) continue
        spans.push({ node, start: text.length, length: node.data.length })
        text += node.data
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as HTMLElement
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
      const block = BLOCK_TAGS.has(el.tagName)
      if (block) text += '\n'
      walk(el)
      if (block) text += '\n'
    }
  }

  walk(root)
  return { text, spans }
}

function locate(spans: TextSpan[], pos: number): { node: Text; offset: number } | null {
  let low = 0
  let high = spans.length - 1
  let found: TextSpan | null = null
  while (low <= high) {
    const mid = (low + high) >> 1
    const span = spans[mid]
    if (span.start <= pos) {
      found = span
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  if (!found) return null
  return { node: found.node, offset: Math.min(pos - found.start, found.length) }
}

/** Collect text matches across inline nodes; block boundaries are treated as line breaks. */
export function collectMatches(root: HTMLElement, query: string): Range[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const { text, spans } = buildHaystack(root)
  if (!text) return []
  const haystack = text.toLowerCase()
  const matches: Range[] = []
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) break
    const end = at + needle.length
    from = end
    if (text.slice(at, end).includes('\n')) continue
    const start = locate(spans, at)
    const finish = locate(spans, end)
    if (!start || !finish) continue
    const range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(finish.node, finish.offset)
    matches.push(range)
  }
  return matches
}
