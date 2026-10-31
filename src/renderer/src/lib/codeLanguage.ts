import type { Extension } from '@codemirror/state'
import { baseName, fileExt } from '../../../shared/fileKinds'

type LegacyModule = Record<string, unknown>
type LegacyParser = Parameters<typeof import('@codemirror/language').StreamLanguage.define>[0]

async function legacy(
  load: () => Promise<LegacyModule>,
  name: string
): Promise<Extension> {
  const [{ StreamLanguage }, mod] = await Promise.all([import('@codemirror/language'), load()])
  const parser = mod[name] as LegacyParser | undefined
  return parser ? StreamLanguage.define(parser) : []
}

const LOADERS: Record<string, () => Promise<Extension>> = {
  markdown: async () => (await import('@codemirror/lang-markdown')).markdown(),
  javascript: async () => (await import('@codemirror/lang-javascript')).javascript(),
  jsx: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }),
  typescript: async () =>
    (await import('@codemirror/lang-javascript')).javascript({ typescript: true }),
  tsx: async () =>
    (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true }),
  json: async () => (await import('@codemirror/lang-json')).json(),
  html: async () => (await import('@codemirror/lang-html')).html(),
  css: async () => (await import('@codemirror/lang-css')).css(),
  xml: async () => (await import('@codemirror/lang-xml')).xml(),
  python: async () => (await import('@codemirror/lang-python')).python(),
  java: async () => (await import('@codemirror/lang-java')).java(),
  cpp: async () => (await import('@codemirror/lang-cpp')).cpp(),
  go: async () => (await import('@codemirror/lang-go')).go(),
  rust: async () => (await import('@codemirror/lang-rust')).rust(),
  php: async () => (await import('@codemirror/lang-php')).php(),
  sql: async () => (await import('@codemirror/lang-sql')).sql(),
  yaml: () => legacy(() => import('@codemirror/legacy-modes/mode/yaml'), 'yaml'),
  toml: () => legacy(() => import('@codemirror/legacy-modes/mode/toml'), 'toml'),
  properties: () => legacy(() => import('@codemirror/legacy-modes/mode/properties'), 'properties'),
  shell: () => legacy(() => import('@codemirror/legacy-modes/mode/shell'), 'shell'),
  powershell: () => legacy(() => import('@codemirror/legacy-modes/mode/powershell'), 'powerShell'),
  csharp: () => legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'csharp'),
  kotlin: () => legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'kotlin'),
  scala: () => legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'scala'),
  dart: () => legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'dart'),
  objectivec: () => legacy(() => import('@codemirror/legacy-modes/mode/clike'), 'objectiveC'),
  sass: () => legacy(() => import('@codemirror/legacy-modes/mode/sass'), 'sass'),
  lua: () => legacy(() => import('@codemirror/legacy-modes/mode/lua'), 'lua'),
  ruby: () => legacy(() => import('@codemirror/legacy-modes/mode/ruby'), 'ruby'),
  perl: () => legacy(() => import('@codemirror/legacy-modes/mode/perl'), 'perl'),
  r: () => legacy(() => import('@codemirror/legacy-modes/mode/r'), 'r'),
  diff: () => legacy(() => import('@codemirror/legacy-modes/mode/diff'), 'diff'),
  clojure: () => legacy(() => import('@codemirror/legacy-modes/mode/clojure'), 'clojure'),
  erlang: () => legacy(() => import('@codemirror/legacy-modes/mode/erlang'), 'erlang'),
  haskell: () => legacy(() => import('@codemirror/legacy-modes/mode/haskell'), 'haskell'),
  elm: () => legacy(() => import('@codemirror/legacy-modes/mode/elm'), 'elm'),
  stex: () => legacy(() => import('@codemirror/legacy-modes/mode/stex'), 'stex'),
  protobuf: () => legacy(() => import('@codemirror/legacy-modes/mode/protobuf'), 'protobuf'),
  swift: () => legacy(() => import('@codemirror/legacy-modes/mode/swift'), 'swift'),
  groovy: () => legacy(() => import('@codemirror/legacy-modes/mode/groovy'), 'groovy'),
  dockerfile: () => legacy(() => import('@codemirror/legacy-modes/mode/dockerfile'), 'dockerFile')
}

const EXT_LANG: Record<string, string> = {
  md: 'markdown',
  markdown: 'markdown',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  json: 'json',
  json5: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  vue: 'html',
  svelte: 'html',
  astro: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  sass: 'sass',
  xml: 'xml',
  py: 'python',
  pyw: 'python',
  java: 'java',
  c: 'cpp',
  h: 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  mm: 'cpp',
  cs: 'csharp',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  dart: 'dart',
  m: 'objectivec',
  go: 'go',
  rs: 'rust',
  php: 'php',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  lua: 'lua',
  rb: 'ruby',
  pl: 'perl',
  pm: 'perl',
  r: 'r',
  diff: 'diff',
  patch: 'diff',
  clj: 'clojure',
  cljs: 'clojure',
  erl: 'erlang',
  hrl: 'erlang',
  hs: 'haskell',
  lhs: 'haskell',
  elm: 'elm',
  tex: 'stex',
  sty: 'stex',
  proto: 'protobuf',
  swift: 'swift',
  groovy: 'groovy',
  gradle: 'groovy',
  ini: 'properties',
  cfg: 'properties',
  conf: 'properties',
  env: 'properties',
  properties: 'properties',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml'
}

const NAME_LANG: Record<string, string> = {
  dockerfile: 'dockerfile',
  '.env': 'properties',
  '.editorconfig': 'properties',
  rakefile: 'ruby',
  gemfile: 'ruby',
  vagrantfile: 'ruby'
}

export function languageKeyForPath(p: string): string {
  const ext = fileExt(p)
  if (ext && EXT_LANG[ext]) return EXT_LANG[ext]
  return NAME_LANG[baseName(p).toLowerCase()] ?? 'plain'
}

export async function loadLanguage(key: string): Promise<Extension> {
  const loader = LOADERS[key]
  if (!loader) return []
  try {
    return await loader()
  } catch {
    return []
  }
}
