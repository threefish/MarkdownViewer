const MARKDOWN_EXTS = new Set(['md', 'markdown'])

const TEXT_EXTS = new Set([
  'adoc', 'asc', 'astro', 'bash', 'bat', 'bib', 'c', 'cc', 'cfg', 'cjs', 'clj', 'cljs',
  'cmd', 'conf', 'cpp', 'cs', 'css', 'csv', 'cts', 'cxx', 'dart', 'diff', 'elm', 'env',
  'erl', 'ex', 'excalidraw', 'exs', 'fish', 'go', 'gradle', 'graphql', 'groovy', 'gql', 'h', 'hh',
  'hpp', 'hrl', 'hs', 'htm', 'html', 'ini', 'java', 'js', 'json', 'json5', 'jsonc',
  'jsx', 'kt', 'kts', 'less', 'lhs', 'lock', 'log', 'lua', 'm', 'markdown', 'md', 'mjs',
  'mm', 'mts', 'nfo', 'patch', 'php', 'pl', 'pm', 'properties', 'proto', 'ps1', 'psm1',
  'py', 'pyw', 'r', 'rb', 'rst', 'rs', 'sass', 'scala', 'scss', 'sh', 'sql', 'srt',
  'sty', 'svelte', 'swift', 'tex', 'text', 'toml', 'ts', 'tsv', 'tsx', 'txt', 'vue',
  'vtt', 'xhtml', 'xml', 'yaml', 'yml', 'zsh'
])

const IMAGE_EXTS = new Set([
  'avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'
])

const TEXT_NAMES = new Set([
  '.editorconfig',
  '.env',
  '.eslintrc',
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  '.prettierrc',
  'authors',
  'changelog',
  'dockerfile',
  'gemfile',
  'gnumakefile',
  'license',
  'licence',
  'makefile',
  'notice',
  'procfile',
  'rakefile',
  'readme',
  'todo',
  'vagrantfile'
])

export function baseName(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
}

export function fileExt(p: string): string {
  const base = baseName(p)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function isMarkdownFile(p: string): boolean {
  return MARKDOWN_EXTS.has(fileExt(p))
}

export function isExcalidrawFile(p: string): boolean {
  return fileExt(p) === 'excalidraw'
}

export function isPdfFile(p: string): boolean {
  return fileExt(p) === 'pdf'
}

export function isImageFile(p: string): boolean {
  return IMAGE_EXTS.has(fileExt(p))
}

export function isTextFile(p: string): boolean {
  const base = baseName(p).toLowerCase()
  if (!base) return false
  if (TEXT_EXTS.has(fileExt(base))) return true
  return TEXT_NAMES.has(base)
}

export function textFileExtensions(): string[] {
  return [...TEXT_EXTS].sort()
}

export function imageFileExtensions(): string[] {
  return [...IMAGE_EXTS].sort()
}
