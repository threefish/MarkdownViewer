import { Fragment } from 'react'
import type { FormatAction } from '../lib/mdFormat'
import {
  CodeIcon,
  CodeBlockIcon,
  QuoteIcon,
  ListIcon,
  ListOlIcon,
  TaskIcon,
  LinkIcon,
  ImageIcon,
  TableIcon,
  HrIcon,
  HighlightIcon,
  SigmaIcon,
  MathBlockIcon,
  DetailsIcon,
  FootnoteIcon
} from './Icons'

interface ToolButton {
  action: FormatAction
  title: string
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  glyph?: string
  glyphStyle?: React.CSSProperties
}

const GROUPS: ToolButton[][] = [
  [
    {
      action: 'heading',
      title: '标题（# 文字，点击循环 H1→H6→正文）',
      glyph: 'H',
      glyphStyle: { fontWeight: 700 }
    }
  ],
  [
    { action: 'bold', title: '粗体（**文字**）', glyph: 'B', glyphStyle: { fontWeight: 700 } },
    { action: 'italic', title: '斜体（*文字*）', glyph: 'I', glyphStyle: { fontStyle: 'italic' } },
    {
      action: 'strike',
      title: '删除线（~~文字~~）',
      glyph: 'S',
      glyphStyle: { textDecoration: 'line-through' }
    },
    {
      action: 'underline',
      title: '下划线（<u>文字</u>）',
      glyph: 'U',
      glyphStyle: { textDecoration: 'underline' }
    },
    { action: 'highlight', title: '高亮（<mark>文字</mark>）', icon: HighlightIcon }
  ],
  [
    { action: 'code', title: '行内代码（`代码`）', icon: CodeIcon },
    { action: 'codeBlock', title: '代码块（``` 包裹多行）', icon: CodeBlockIcon },
    { action: 'quote', title: '引用（> 文字）', icon: QuoteIcon }
  ],
  [
    { action: 'ul', title: '无序列表（- 条目）', icon: ListIcon },
    { action: 'ol', title: '有序列表（1. 条目）', icon: ListOlIcon },
    { action: 'task', title: '任务列表（- [ ] 待办）', icon: TaskIcon }
  ],
  [
    { action: 'link', title: '链接（[文字](地址)）', icon: LinkIcon },
    { action: 'image', title: '图片（![描述](地址)）', icon: ImageIcon },
    { action: 'table', title: '表格（插入 3 列表格骨架）', icon: TableIcon },
    { action: 'hr', title: '分隔线（---）', icon: HrIcon }
  ],
  [
    { action: 'inlineMath', title: '行内公式（$公式$）', icon: SigmaIcon },
    { action: 'blockMath', title: '块级公式（$$ 包裹多行）', icon: MathBlockIcon }
  ],
  [
    { action: 'details', title: '折叠块（<details> 包裹内容）', icon: DetailsIcon },
    { action: 'footnote', title: '脚注（插入 [^1] 引用与文末定义）', icon: FootnoteIcon }
  ]
]

interface Props {
  onFormat: (action: FormatAction) => void
}

export function MdToolbar({ onFormat }: Props): React.JSX.Element {
  return (
    <div className="md-toolbar" role="toolbar" aria-label="Markdown 格式">
      {GROUPS.map((group, index) => (
        <Fragment key={index}>
          {index > 0 ? <span className="md-tool-sep" aria-hidden="true" /> : null}
          {group.map((tool) => (
            <button
              key={tool.action}
              type="button"
              className="md-tool-btn"
              title={tool.title}
              aria-label={tool.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onFormat(tool.action)}
            >
              {tool.icon ? (
                <tool.icon />
              ) : (
                <span className="md-tool-glyph" style={tool.glyphStyle}>
                  {tool.glyph}
                </span>
              )}
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  )
}