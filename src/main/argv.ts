import { app } from 'electron'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { isTextFile } from '../shared/fileKinds'

/**
 * Extract a supported text/markdown file or folder path from a raw argv list.
 * Packaged: [exe, ...args]; dev: [electron, appPath, ...args].
 */
export function findOpenArgument(
  argv: string[],
  cwd: string,
  packaged: boolean
): string | null {
  const start = packaged ? 1 : 2
  for (const raw of argv.slice(start)) {
    if (!raw || raw.startsWith('-')) continue
    let p = raw
    if (!path.isAbsolute(p)) {
      if (!cwd) continue
      p = path.resolve(cwd, p)
    }
    if (cwd && path.resolve(p) === path.resolve(cwd)) continue
    try {
      const st = statSync(p)
      if (st.isDirectory() || (st.isFile() && isTextFile(p))) return p
    } catch {
      // not a real path token
    }
  }
  return null
}

export function resolveArgFromSecondInstance(
  argv: string[],
  cwd: string
): string | null {
  return findOpenArgument(argv, cwd, app.isPackaged)
}

export function fileExists(p: string): boolean {
  return existsSync(p)
}
