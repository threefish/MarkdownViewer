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
  DrawingIcon,
  TableIcon,
  HrIcon,
  HighlightIcon,
  SigmaIcon,
  MathBlockIcon,
  DetailsIcon,
  FootnoteIcon
} from './Icons'

export type InsertKind = 'image' | 'drawing'

interface ToolButton {
  id: string
  title: string
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  glyph?: string
  glyphStyle?: React.CSSProperties
  action?: FormatAction
  insert?: InsertKind
}

const GROUPS: ToolButton[][] = [
  [
    {
      id: 'heading',
      action: 'heading',
      title: '标题（# 文字，点击循环 H1→H6→正文）',
      glyph: 'H',
      glyphStyle: { fontWeight: 700 }
    }
  ],
  [
    { id: 'bold', action: 'bold', title: '粗体（**文字**）', glyph: 'B', glyphStyle: { fontWeight: 700 } },
    { id: 'italic', action: 'italic', title: '斜体（*文字*）', glyph: 'I', glyphStyle: { fontStyle: 'italic' } },
    {
      id: 'strike',
      action: 'strike',
      title: '删除线（~~文字~~）',
      glyph: 'S',
      glyphStyle: { textDecoration: 'line-through' }
    },
    {
      id: 'underline',
      action: 'underline',
      title: '下划线（<u>文字</u>）',
      glyph: 'U',
      glyphStyle: { textDecoration: 'underline' }
    },
    { id: 'highlight', action: 'highlight', title: '高亮（<mark>文字</mark>）', icon: HighlightIcon }
  ],
  [
    { id: 'code', action: 'code', title: '行内代码（`代码`）', icon: CodeIcon },
    { id: 'codeBlock', action: 'codeBlock', title: '代码块（``` 包裹多行）', icon: CodeBlockIcon },
    { id: 'quote', action: 'quote', title: '引用（> 文字）', icon: QuoteIcon }
  ],
  [
    { id: 'ul', action: 'ul', title: '无序列表（- 条目）', icon: ListIcon },
    { id: 'ol', action: 'ol', title: '有序列表（1. 条目）', icon: ListOlIcon },
    { id: 'task', action: 'task', title: '任务列表（- [ ] 待办）', icon: TaskIcon }
  ],
  [
    { id: 'link', action: 'link', title: '链接（[文字](地址)）', icon: LinkIcon },
    { id: 'image', insert: 'image', title: '插入图片（选择本地图片并写入相对路径）', icon: ImageIcon },
    { id: 'drawing', insert: 'drawing', title: '插入 Excalidraw 画板（选择 .excalidraw 文件）', icon: DrawingIcon },
    { id: 'table', action: 'table', title: '表格（插入 3 列表格骨架）', icon: TableIcon },
    { id: 'hr', action: 'hr', title: '分隔线（---）', icon: HrIcon }
  ],
  [
    { id: 'inlineMath', action: 'inlineMath', title: '行内公式（$公式$）', icon: SigmaIcon },
    { id: 'blockMath', action: 'blockMath', title: '块级公式（$$ 包裹多行）', icon: MathBlockIcon }
  ],
  [
    { id: 'details', action: 'details', title: '折叠块（<details> 包裹内容）', icon: DetailsIcon },
    { id: 'footnote', action: 'footnote', title: '脚注（插入 [^1] 引用与文末定义）', icon: FootnoteIcon }
  ]
]

interface Props {
  onFormat: (action: FormatAction) => void
  onInsert: (kind: InsertKind) => void
}

export function MdToolbar({ onFormat, onInsert }: Props): React.JSX.Element {
  const activate = (tool: ToolButton): void => {
    if (tool.insert) onInsert(tool.insert)
    else if (tool.action) onFormat(tool.action)
  }

  return (
    <div className="md-toolbar" role="toolbar" aria-label="Markdown 格式">
      {GROUPS.map((group, index) => (
        <Fragment key={index}>
          {index > 0 ? <span className="md-tool-sep" aria-hidden="true" /> : null}
          {group.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="md-tool-btn"
              title={tool.title}
              aria-label={tool.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => activate(tool)}
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
