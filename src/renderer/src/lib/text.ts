export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/.exec(markdown)
  return match ? markdown.slice(match[0].length) : markdown
}

export const TASK_LINE_PATTERN = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]/

// 阅读模式勾选任务项时改写源码对应行；行首不是任务标记则返回 null。
export function applyTaskToggle(source: string, line: number, checked: boolean): string | null {
  const lines = source.split('\n')
  const index = line - 1
  const current = lines[index]
  if (current === undefined) return null
  const match = TASK_LINE_PATTERN.exec(current)
  if (!match) return null
  if (/\[[xX]\]/.test(match[0]) === checked) return null
  lines[index] = `${match[1]}[${checked ? 'x' : ' '}]${current.slice(match[0].length)}`
  return lines.join('\n')
}

export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const marker = raw.lastIndexOf('Error: ')
  return marker >= 0 ? raw.slice(marker + 7) : raw || '发生未知错误'
}
