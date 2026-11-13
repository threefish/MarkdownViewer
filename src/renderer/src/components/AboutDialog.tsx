import { Fragment, useEffect } from 'react'

interface Shortcut {
  keys: string[][]
  label: string
}

interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

const SHORTCUT_COLUMNS: ShortcutGroup[][] = [
  [
    {
      title: '文件与标签页',
      shortcuts: [
        { keys: [['Ctrl', 'O']], label: '打开文件' },
        { keys: [['Ctrl', 'Shift', 'O']], label: '打开文件夹' },
        { keys: [['Ctrl', 'S']], label: '保存当前文件' },
        { keys: [['Ctrl', 'P']], label: '导出 PDF' },
        { keys: [['Ctrl', 'W']], label: '关闭标签页' },
        { keys: [['Ctrl', 'Tab']], label: '下一个标签页' },
        { keys: [['Ctrl', 'Shift', 'Tab']], label: '上一个标签页' },
        { keys: [['Ctrl', 'Shift', 'T']], label: '全部打开的文件列表' },
        { keys: [['Alt', '←'], ['Alt', '→']], label: '后退 / 前进' },
        { keys: [['F2']], label: '重命名文件树选中项' },
        { keys: [['Ctrl', 'C']], label: '复制文件树选中项' },
        { keys: [['Ctrl', 'V']], label: '粘贴到文件树中的文件夹' }
      ]
    },
    {
      title: '视图与设置',
      shortcuts: [
        { keys: [['Ctrl', 'E']], label: '切换阅读 / 编辑' },
        { keys: [['Ctrl', 'Shift', 'E']], label: '显示 / 隐藏编辑预览' },
        { keys: [['Ctrl', 'B']], label: '显示 / 隐藏侧栏' },
        { keys: [['Ctrl', 'F']], label: '查找' },
        { keys: [['Ctrl', ',']], label: '打开设置' },
        { keys: [['F5']], label: '重新加载文档' }
      ]
    }
  ],
  [
    {
      title: '文本编辑（编辑模式）',
      shortcuts: [
        { keys: [['Ctrl', 'Z']], label: '撤销' },
        { keys: [['Ctrl', 'Y']], label: '重做' },
        { keys: [['Ctrl', 'X']], label: '剪切' },
        { keys: [['Ctrl', 'C']], label: '复制' },
        { keys: [['Ctrl', 'V']], label: '粘贴' },
        { keys: [['Ctrl', 'A']], label: '全选' },
        { keys: [['Tab']], label: '缩进' },
        { keys: [['Shift', 'Tab']], label: '减少缩进' },
        { keys: [['Ctrl', 'Shift', '[']], label: '折叠代码块' },
        { keys: [['Ctrl', 'Shift', ']']], label: '展开代码块' },
        { keys: [['Ctrl', 'Alt', '[']], label: '折叠全部' },
        { keys: [['Ctrl', 'Alt', ']']], label: '展开全部' }
      ]
    },
    {
      title: '脑图编辑',
      shortcuts: [
        { keys: [['Tab']], label: '插入子主题' },
        { keys: [['Enter']], label: '插入同级主题' },
        { keys: [['Shift', 'Tab']], label: '插入父主题' },
        { keys: [['Del'], ['Backspace']], label: '删除选中主题' },
        { keys: [['F2']], label: '编辑主题文字' },
        { keys: [['/']], label: '展开 / 收起主题' },
        { keys: [['Ctrl', 'A']], label: '选中全部主题' },
        { keys: [['Ctrl', 'C']], label: '复制主题' },
        { keys: [['Ctrl', 'X']], label: '剪切主题' },
        { keys: [['Ctrl', 'V']], label: '粘贴主题' },
        { keys: [['Ctrl', 'Z']], label: '撤销' },
        { keys: [['Ctrl', 'Y']], label: '重做' },
        { keys: [['Ctrl', 'L']], label: '整理布局' },
        { keys: [['Ctrl', 'Enter']], label: '根主题居中' }
      ]
    }
  ],
  [
    {
      title: '查找',
      shortcuts: [
        {
          keys: [
            ['Enter'],
            ['F3']
          ],
          label: '下一个匹配'
        },
        {
          keys: [
            ['Shift', 'Enter'],
            ['Shift', 'F3']
          ],
          label: '上一个匹配'
        },
        { keys: [['Ctrl', 'D']], label: '选中下一个相同文本' },
        { keys: [['Ctrl', 'Shift', 'L']], label: '选中全部相同文本' },
        { keys: [['Ctrl', 'Alt', 'G']], label: '跳转到行' },
        { keys: [['Esc']], label: '关闭查找面板' }
      ]
    },
    {
      title: '图片查看',
      shortcuts: [
        {
          keys: [
            ['←'],
            ['→']
          ],
          label: '上一张 / 下一张'
        },
        {
          keys: [
            ['+'],
            ['-']
          ],
          label: '放大 / 缩小'
        },
        { keys: [['0']], label: '重置缩放与旋转' },
        { keys: [['Esc']], label: '关闭图片' }
      ]
    },
    {
      title: '禅模式',
      shortcuts: [{ keys: [['Esc']], label: '退出禅模式（关闭该窗口）' }]
    },
    {
      title: '窗口与弹窗',
      shortcuts: [
        { keys: [['Esc']], label: '关闭对话框 / 菜单 / 浮层' },
        { keys: [['Alt', 'F4']], label: '退出应用' }
      ]
    }
  ]
]

function ShortcutKeys({ keys }: { keys: string[][] }): React.JSX.Element {
  return (
    <span className="shortcut-keys">
      {keys.map((combo, comboIndex) => (
        <Fragment key={comboIndex}>
          {comboIndex > 0 ? <span className="shortcut-or">/</span> : null}
          <span className="shortcut-combo">
            {combo.map((key, keyIndex) => (
              <Fragment key={keyIndex}>
                {keyIndex > 0 ? <span className="shortcut-plus">+</span> : null}
                <kbd className="shortcut-key">{key}</kbd>
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  )
}

interface Props {
  open: boolean
  version: string
  onClose: () => void
}

export function AboutDialog({ open, version, onClose }: Props): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal about"
        role="dialog"
        aria-modal="true"
        aria-label="关于 Markdown Viewer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="about-head">
          <h2 className="about-title">关于 Markdown Viewer</h2>
          <span className="about-version">版本 {version || '—'}</span>
        </header>
        <div className="about-scroll">
          <p className="about-desc">
            本地 Markdown 阅读与编辑器，支持 GFM、KaTeX 公式、Mermaid 图表、Excalidraw
            画板（可新建、编辑，并在 Markdown 中嵌入预览）与思维导图（.smm，支持导入导出
            XMind），也可查看和编辑常见文本与代码文件。在资源管理器中双击受支持的文件，
            会在独立的禅模式窗口中专注阅读，多个文件可同时打开多个禅模式窗口。
          </p>
          <h3 className="about-section-title">键盘快捷键</h3>
          <div className="shortcut-grid">
            {SHORTCUT_COLUMNS.map((column, columnIndex) => (
              <div className="shortcut-col" key={columnIndex}>
                {column.map((group) => (
                  <section className="shortcut-group" key={group.title}>
                    <h4>{group.title}</h4>
                    {group.shortcuts.map((shortcut) => (
                      <div className="shortcut-row" key={shortcut.label}>
                        <span className="shortcut-label">{shortcut.label}</span>
                        <ShortcutKeys keys={shortcut.keys} />
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="confirm-actions about-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            好
          </button>
        </div>
      </div>
    </div>
  )
}
