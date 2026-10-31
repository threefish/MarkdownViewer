export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/.exec(markdown)
  return match ? markdown.slice(match[0].length) : markdown
}

export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const marker = raw.lastIndexOf('Error: ')
  return marker >= 0 ? raw.slice(marker + 7) : raw || '发生未知错误'
}
