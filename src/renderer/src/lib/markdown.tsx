import { Children, isValidElement, useMemo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'
import type { PluggableList } from 'unified'
import type { Schema } from 'hast-util-sanitize'
import type { ThemeMode } from '../../../shared/types'
import { MermaidBlock } from '../components/MermaidBlock'
import { rewriteLocalImages } from './rewriteUrls'
import { stripFrontmatter } from './text'

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
    span: [...(defaultSchema.attributes?.span ?? []), 'className'],
    div: [...(defaultSchema.attributes?.div ?? []), 'className'],
    input: ['type', 'checked', 'disabled'],
    details: ['open']
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ['http', 'https', 'data', 'mdv'],
    href: ['http', 'https', 'mailto', 'mdv', 'tel', 'irc', 'ircs', 'xmpp']
  }
}

const remarkPlugins: PluggableList = [remarkGfm, [remarkMath]]

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
}

export function MarkdownDocument({ content, baseDir, theme, onLink }: Props): React.JSX.Element {
  const body = useMemo(() => stripFrontmatter(content), [content])

  const rehypePlugins = useMemo<PluggableList>(
    () => [
      rehypeRaw,
      [rewriteLocalImages, { baseDir }],
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
      img: ({ node: _node, ...rest }) => <img {...rest} loading="lazy" decoding="async" />,
      table: ({ node: _node, children, ...rest }) => (
        <div className="table-wrap">
          <table {...rest}>{children}</table>
        </div>
      ),
      input: ({ node: _node, ...rest }) => <input {...rest} readOnly />,
      pre: ({ node: _node, children, ...rest }) => (
        <CodeBlock {...rest} theme={theme}>
          {children}
        </CodeBlock>
      )
    }),
    [onLink, theme]
  )

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
      urlTransform={(url) => url}
    >
      {body}
    </ReactMarkdown>
  )
}
