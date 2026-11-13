export interface Shortcut {
  keys: string[][]
  label: string
}

export interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

export const MINDMAP_SHORTCUTS: ShortcutGroup = {
  title: '脑图编辑',
  shortcuts: [
    { keys: [['Tab']], label: '插入子主题' },
    { keys: [['Enter']], label: '插入同级主题' },
    { keys: [['Shift', 'Tab']], label: '插入父主题' },
    { keys: [['Del'], ['Backspace']], label: '删除选中主题' },
    { keys: [['F2']], label: '编辑主题文字' },
    { keys: [['Ctrl', 'Enter'], ['Shift', 'Enter']], label: '主题文字内换行' },
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

export const SHORTCUT_COLUMNS: ShortcutGroup[][] = [
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
    MINDMAP_SHORTCUTS
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
