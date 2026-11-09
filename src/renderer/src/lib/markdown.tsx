import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'
import type { PluggableList } from 'unified'
import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'
import type { Schema } from 'hast-util-sanitize'
import type { ThemeMode } from '../../../shared/types'
import { ImageLightbox } from '../components/ImageLightbox'
import { MermaidBlock } from '../components/MermaidBlock'
import { ExcalidrawEmbed } from '../components/ExcalidrawEmbed'
import { markExcalidrawEmbeds, SCENE_PATH } from './rehypeExcalidrawEmbeds'
import { remarkExcalidrawWiki } from './remarkExcalidrawWiki'
import { rewriteLocalImages } from './rewriteUrls'
import { stripFrontmatter } from './text'

const TASK_LINE = 'mdvtaskline'

const schema: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary', 'kbd', 'mark', 'sup', 'sub', 'ins', 'del'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className'],
    a: [...(defaultSchema.attributes?.a ?? []), 'href', 'title'],
    img: [...(defaultSchema.attributes?.img ?? []), 'src', 'alt', 'title', 'width', 'height'],
    th: [...(defaultSchema.attributes?.th ?? []), 'align'],
    td: [...(defaultSchema.attributes?.td ?? []), 'align'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    pre: [...(defaultSchema.attributes?.pre ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className', SCENE_PATH],
    div: [...(defaultSchema.attributes?.div ?? []), 'className'],
    input: ['type', 'checked', 'disabled', TASK_LINE],
    details: ['open']
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ['http', 'https', 'data', 'mdv'],
    href: ['http', 'https', 'mailto', 'mdv', 'tel', 'irc', 'ircs', 'xmpp']
  }
}

const remarkPlugins: PluggableList = [remarkGfm, [remarkMath], remarkExcalidrawWiki]

function isTaskListItem(node: Element): boolean {
  const className = node.properties?.className
  const names = Array.isArray(className) ? className : [className]
  return names.some((name) => String(name) === 'task-list-item')
}

function firstCheckbox(nodes: Element['children']): Element | null {
  for (const child of nodes) {
    if (child.type !== 'element') continue
    if (child.tagName === 'input') return child
    const nested = firstCheckbox(child.children)
    if (nested) return nested
  }
  return null
}

// remark-gfm 合成的复选框不带位置信息，把所在任务项的源码行号写进它的属性。
function markTaskCheckboxLines() {
  return (tree: Root): void => {
    const claimed = new Set<Element>()
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'li' && isTaskListItem(node)) {
        const line = node.position?.start.line
        const box = firstCheckbox(node.children)
        if (box && line) {
          box.properties[TASK_LINE] = String(line)
          claimed.add(box)
        }
        return
      }
      if (node.tagName === 'input' && !claimed.has(node)) delete node.properties[TASK_LINE]
    })
  }
}

function lineOf(node: Element | undefined, offset: number): number {
  const raw = node?.properties?.[TASK_LINE]
  const bodyLine = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isInteger(bodyLine) && bodyLine > 0 ? bodyLine + offset : 0
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

type CodeBlockProps = React.HTMLAttributes<HTMLPreElement> & {
  children?: ReactNode
  theme: ThemeMode
}

function CodeBlock({ children, theme, ...rest }: CodeBlockProps): React.JSX.Element {
  const first = Children.toArray(children)[0]
  if (isValidElement(first)) {
    const props = first.props as { className?: string; children?: ReactNode }
    const language = /language-([\w-]+)/.exec(props.className ?? '')?.[1] ?? ''
    if (language === 'mermaid') {
      return <MermaidBlock code={textOf(props.children).trim()} theme={theme} />
    }
    return (
      <div className="code-block">
        {language ? (
          <div className="code-head">
            <span>{language}</span>
          </div>
        ) : null}
        <pre {...rest}>{children}</pre>
      </div>
    )
  }
  return (
    <div className="code-block">
      <pre {...rest}>{children}</pre>
    </div>
  )
}

interface Props {
  content: string
  baseDir: string
  theme: ThemeMode
  onLink: (href: string) => void
  onTaskToggle?: (line: number, checked: boolean) => void
}

export function MarkdownDocument({
  content,
  baseDir,
  theme,
  onLink,
  onTaskToggle
}: Props): React.JSX.Element {
  const { body, lineOffset } = useMemo(() => {
    const stripped = stripFrontmatter(content)
    const removed = content.length - stripped.length
    const offset = removed > 0 ? (content.slice(0, removed).match(/\n/g)?.length ?? 0) : 0
    return { body: stripped, lineOffset: offset }
  }, [content])
  const [viewer, setViewer] = useState<{
    images: Array<{ src: string; alt: string }>
    index: number
  } | null>(null)

  useEffect(() => {
    setViewer(null)
  }, [content, baseDir])

  const rehypePlugins = useMemo<PluggableList>(
    () => [
      rehypeRaw,
      [markExcalidrawEmbeds, { baseDir }],
      [rewriteLocalImages, { baseDir }],
      markTaskCheckboxLines,
      [rehypeSanitize, schema],
      [rehypeKatex, { throwOnError: false, errorColor: '#c95c5c' }],
      rehypeSlug,
      [rehypeHighlight, { detect: false, ignoreMissing: true }]
    ],
    [baseDir]
  )

  const components = useMemo<Components>(
    () => ({
      a: ({ node: _node, href, children, ...rest }) => (
        <a
          {...rest}
          href={href}
          onClick={(event) => {
            event.preventDefault()
            if (href) onLink(href)
          }}
        >
          {children}
        </a>
      ),
      img: ({ node: _node, src, alt, ...rest }) => (
        <img
          {...rest}
          src={src}
          alt={alt ?? ''}
          loading="lazy"
          decoding="async"
          onClick={(event) => {
            const image = event.currentTarget
            if (!image.getAttribute('src')) return
            event.preventDefault()
            event.stopPropagation()
            const scope = image.closest('.markdown-body') ?? document
            const images = Array.from(scope.querySelectorAll('img'))
              .map((node) => ({
                node,
                src: node.getAttribute('src') ?? '',
                alt: node.getAttribute('alt') ?? ''
              }))
              .filter((item) => item.src)
            const index = images.findIndex((item) => item.node === image)
            setViewer({
              images: images.map((item) => ({ src: item.src, alt: item.alt })),
              index: Math.max(0, index)
            })
          }}
        />
      ),
      span: ({ node, children, ...rest }) => {
        const className = node?.properties?.className
        const names = Array.isArray(className) ? className : [className]
        const scene = node?.properties?.[SCENE_PATH]
        if (names.some((name) => String(name) === 'excalidraw-embed') && typeof scene === 'string') {
          return <ExcalidrawEmbed path={scene} theme={theme} onOpen={onLink} />
        }
        return <span {...rest}>{children}</span>
      },
      table: ({ node: _node, children, ...rest }) => (
        <div className="table-wrap">
          <table {...rest}>{children}</table>
        </div>
      ),
      input: ({ node: _node, ...rest }) => {
        const line = lineOf(_node, lineOffset)
        if (!line || !onTaskToggle) return <input {...rest} readOnly />
        const { checked, disabled: _disabled, ...boxProps } = rest
        return (
          <input
            {...boxProps}
            checked={Boolean(checked)}
            onChange={(event) => onTaskToggle(line, event.currentTarget.checked)}
          />
        )
      },
      pre: ({ node: _node, children, ...rest }) => (
        <CodeBlock {...rest} theme={theme}>
          {children}
        </CodeBlock>
      )
    }),
    [onLink, theme, lineOffset, onTaskToggle]
  )

  return (
    <>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={(url) => url}
      >
        {body}
      </ReactMarkdown>
      {viewer ? (
        <ImageLightbox
          images={viewer.images}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </>
  )
}
