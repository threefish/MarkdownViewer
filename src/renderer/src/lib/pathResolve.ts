import { isImageFile, isTextFile } from '../../../shared/fileKinds'

export type HrefInfo =
  | { kind: 'none' }
  | { kind: 'external'; href: string }
  | { kind: 'anchor'; hash: string }
  | { kind: 'doc'; path: string; hash: string }
  | { kind: 'file'; path: string }

export function dirnameOf(filePath: string): string {
  const normalized = filePath.replace(/\//g, '\\')
  const index = normalized.lastIndexOf('\\')
  return index <= 0 ? normalized : normalized.slice(0, index)
}

function normalizeWindowsPath(input: string): string {
  const slashed = input.replace(/\//g, '\\')
  const drive = /^([a-zA-Z]:)/.exec(slashed)?.[1] ?? ''
  const isUnc = !drive && slashed.startsWith('\\\\')
  let rest = drive ? slashed.slice(drive.length) : slashed
  const isAbsolute = rest.startsWith('\\')
  const segments: string[] = []
  for (const segment of rest.split('\\')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  const joined = segments.join('\\')
  if (drive) return `${drive}\\${joined}`
  if (isUnc) return `\\\\${joined}`
  return (isAbsolute ? '\\' : '') + joined
}

/** Resolve an author-supplied path (relative, absolute, file://) against the document folder. */
export function resolveLocalPath(baseDir: string, target: string): string | null {
  let value = target.trim()
  if (!value) return null
  const hashIndex = value.indexOf('#')
  if (hashIndex >= 0) value = value.slice(0, hashIndex)
  const queryIndex = value.indexOf('?')
  if (queryIndex >= 0) value = value.slice(0, queryIndex)
  if (/^file:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      value = decodeURIComponent(url.pathname)
      if (/^\/[a-zA-Z]:/.test(value)) value = value.slice(1)
    } catch {
      return null
    }
  } else {
    try {
      value = decodeURIComponent(value)
    } catch {
      // keep original when it is not valid percent-encoding
    }
  }
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    return normalizeWindowsPath(value)
  }
  if (value.startsWith('/')) {
    const drive = /^[a-zA-Z]:/.exec(baseDir)?.[0] ?? ''
    return normalizeWindowsPath(drive + value)
  }
  return normalizeWindowsPath(baseDir + '\\' + value)
}

export function localFileUrl(absolutePath: string): string {
  const bytes = new TextEncoder().encode(absolutePath)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `mdv://local/${encoded}`
}

export function classifyHref(baseDir: string, href: string): HrefInfo {
  const raw = href.trim()
  if (!raw) return { kind: 'none' }
  if (raw.startsWith('#')) {
    try {
      return { kind: 'anchor', hash: decodeURIComponent(raw.slice(1)) }
    } catch {
      return { kind: 'anchor', hash: raw.slice(1) }
    }
  }
  if (/^(https?:|mailto:)/i.test(raw)) return { kind: 'external', href: raw }
  if (/^(javascript|vbscript|data):/i.test(raw)) return { kind: 'none' }
  const hashIndex = raw.indexOf('#')
  let hash = ''
  if (hashIndex >= 0) {
    try {
      hash = decodeURIComponent(raw.slice(hashIndex + 1))
    } catch {
      hash = raw.slice(hashIndex + 1)
    }
  }
  const path = resolveLocalPath(baseDir, hashIndex >= 0 ? raw.slice(0, hashIndex) : raw)
  if (!path) return { kind: 'none' }
  if (isTextFile(path) || isImageFile(path)) return { kind: 'doc', path, hash }
  return { kind: 'file', path }
}
