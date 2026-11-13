export interface NewFileExtOption {
  value: string
  label: string
}

export const NEW_FILE_EXTS: NewFileExtOption[] = [
  { value: 'md', label: '.md' },
  { value: 'markdown', label: '.markdown' },
  { value: 'excalidraw', label: '.excalidraw' },
  { value: 'smm', label: '.smm' },
  { value: 'txt', label: '.txt' },
  { value: 'log', label: '.log' },
  { value: 'csv', label: '.csv' },
  { value: 'json', label: '.json' },
  { value: 'yml', label: '.yml' },
  { value: 'toml', label: '.toml' },
  { value: 'html', label: '.html' },
  { value: 'css', label: '.css' },
  { value: 'js', label: '.js' },
  { value: 'ts', label: '.ts' },
  { value: 'py', label: '.py' },
  { value: 'java', label: '.java' },
  { value: 'go', label: '.go' },
  { value: 'rs', label: '.rs' },
  { value: 'sh', label: '.sh' },
  { value: 'sql', label: '.sql' }
]

/** 当当前扩展名不在预设列表（例如来自旧设置的冷门格式）时，把它补进下拉选项，避免选中值丢失。 */
export function withExtOptions(current: string): NewFileExtOption[] {
  return NEW_FILE_EXTS.some((option) => option.value === current)
    ? NEW_FILE_EXTS
    : [...NEW_FILE_EXTS, { value: current, label: `.${current}` }]
}
