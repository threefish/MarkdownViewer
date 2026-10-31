import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import type { AssocInfo, AssocState } from '../shared/types'
import { getSettings, patchSettings } from './settings'

const PROGID = 'MarkdownViewer.md'
const APP_KEY = 'md-viewer.exe'
const REG_APP_ID = 'md-viewer'

interface RegSnapshot {
  cmd: string | null
  md: string | null
  markdown: string | null
  userChoice: string | null
}

function run(file: string, args: string[], timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

const READ_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function ReadVal([string]$p, [string]$n) {
  try {
    $item = Get-ItemProperty -LiteralPath $p
    if ($null -eq $item) { return $null }
    $prop = $item.PSObject.Properties[$n]
    if ($null -eq $prop) { return $null }
    if ($null -eq $prop.Value) { return $null }
    return [string]$prop.Value
  } catch { return $null }
}
[pscustomobject]@{
  cmd = (ReadVal 'HKCU:\Software\Classes\MarkdownViewer.md\shell\open\command' '(default)')
  md = (ReadVal 'HKCU:\Software\Classes\.md' '(default)')
  markdown = (ReadVal 'HKCU:\Software\Classes\.markdown' '(default)')
  userChoice = (ReadVal 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice' 'ProgId')
} | ConvertTo-Json -Compress
`

async function readSnapshot(): Promise<RegSnapshot> {
  const empty: RegSnapshot = { cmd: null, md: null, markdown: null, userChoice: null }
  try {
    const stdout = await run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      READ_PS
    ])
    const parsed = JSON.parse(stdout.trim() || '{}') as Record<string, unknown>
    const norm = (v: unknown): string | null =>
      typeof v === 'string' && v.trim().length > 0 ? v : null
    return {
      cmd: norm(parsed.cmd),
      md: norm(parsed.md),
      markdown: norm(parsed.markdown),
      userChoice: norm(parsed.userChoice)
    }
  } catch (err) {
    console.error('[registry] read failed', err)
    return empty
  }
}

function exeFromCommand(command: string | null): string | null {
  if (!command) return null
  const quoted = /^\s*"([^"]+)"/.exec(command)
  if (quoted) return quoted[1]
  const first = command.trim().split(/\s+/)[0]
  return first || null
}

async function sameExe(a: string, b: string): Promise<boolean> {
  try {
    const [ra, rb] = await Promise.all([fs.realpath(a), fs.realpath(b)])
    return ra.toLowerCase() === rb.toLowerCase()
  } catch {
    return a.toLowerCase() === b.toLowerCase()
  }
}

async function regAdd(key: string, name: string | null, type: string | null, value: string | null): Promise<void> {
  const args = ['add', key]
  if (name === null) args.push('/ve')
  else args.push('/v', name)
  if (type) args.push('/t', type)
  if (value !== null) args.push('/d', value)
  args.push('/f')
  await run('reg.exe', args)
}

async function regDeleteValue(key: string, name: string | null): Promise<void> {
  const args = ['delete', key]
  if (name === null) args.push('/ve')
  else args.push('/v', name)
  args.push('/f')
  try {
    await run('reg.exe', args)
  } catch {
    // value may not exist
  }
}

async function regDeleteKey(key: string): Promise<void> {
  try {
    await run('reg.exe', ['delete', key, '/f'])
  } catch {
    // key may not exist
  }
}

function notifyShell(): void {
  const ps = String.raw`Add-Type -Namespace MDV -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int eventId, int flags, System.IntPtr item1, System.IntPtr item2);'; [MDV.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)`
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 5000).catch(() => {
    // best effort only
  })
}

function classKey(sub: string): string {
  return `HKCU\\Software\\Classes\\${sub}`
}

export async function getAssocInfo(): Promise<AssocInfo> {
  const snapshot = await readSnapshot()
  const exePath = process.execPath
  const registeredExe = exeFromCommand(snapshot.cmd)
  let state: AssocState
  if (!snapshot.cmd) {
    state = 'notRegistered'
  } else if (registeredExe && (await sameExe(registeredExe, exePath))) {
    state = snapshot.userChoice && snapshot.userChoice !== PROGID ? 'otherApp' : 'ok'
  } else {
    state = 'stale'
  }
  return {
    state,
    exePath,
    registeredExe,
    userChoiceProgId: snapshot.userChoice
  }
}

async function writeAssociation(exePath: string): Promise<void> {
  const progKey = classKey(PROGID)
  const command = `"${exePath}" "%1"`

  await regAdd(progKey, null, 'REG_SZ', 'Markdown Document')
  await regAdd(progKey, 'FriendlyTypeName', 'REG_SZ', 'Markdown Document')
  await regAdd(progKey, 'AppUserModelID', 'REG_SZ', 'com.local.mdviewer')
  await regAdd(classKey(PROGID + '\\DefaultIcon'), null, 'REG_SZ', `"${exePath}",0`)
  await regAdd(classKey(PROGID + '\\shell\\open\\command'), null, 'REG_SZ', command)

  for (const ext of ['.md', '.markdown']) {
    await regAdd(classKey(ext), null, 'REG_SZ', PROGID)
    await regAdd(classKey(ext), 'Content Type', 'REG_SZ', 'text/markdown')
    await regAdd(classKey(ext), 'PerceivedType', 'REG_SZ', 'text')
    await regAdd(classKey(ext + '\\OpenWithProgids'), PROGID, 'REG_NONE', '').catch(() => {})
  }

  await regAdd(classKey(`Applications\\${APP_KEY}\\shell\\open\\command`), null, 'REG_SZ', command)
  await regAdd(classKey(`Applications\\${APP_KEY}\\SupportedTypes`), '.md', 'REG_NONE', '').catch(() => {})
  await regAdd(classKey(`Applications\\${APP_KEY}\\SupportedTypes`), '.markdown', 'REG_NONE', '').catch(() => {})

  await regAdd('HKCU\\Software\\md-viewer\\Capabilities', 'ApplicationName', 'REG_SZ', 'Markdown Viewer')
  await regAdd('HKCU\\Software\\md-viewer\\Capabilities', 'ApplicationDescription', 'REG_SZ', 'Markdown 文档阅读器')
  await regAdd('HKCU\\Software\\md-viewer\\Capabilities', 'ApplicationIcon', 'REG_SZ', `"${exePath}",0`)
  await regAdd('HKCU\\Software\\md-viewer\\Capabilities\\FileAssociations', '.md', 'REG_SZ', PROGID)
  await regAdd('HKCU\\Software\\md-viewer\\Capabilities\\FileAssociations', '.markdown', 'REG_SZ', PROGID)
  await regAdd('HKCU\\Software\\RegisteredApplications', REG_APP_ID, 'REG_SZ', 'Software\\md-viewer\\Capabilities')
}

export async function registerAssociation(): Promise<AssocInfo> {
  const exePath = process.execPath
  const before = await readSnapshot()
  const settings = getSettings()
  if (!settings.assocBackup && (before.md || before.markdown)) {
    patchSettings({ assocBackup: { md: before.md, markdown: before.markdown } })
  }
  await writeAssociation(exePath)
  notifyShell()
  return getAssocInfo()
}

export async function unregisterAssociation(): Promise<AssocInfo> {
  const snapshot = await readSnapshot()
  const backup = getSettings().assocBackup

  const pairs: Array<{ ext: '.md' | '.markdown'; current: string | null; previous: string | null }> = [
    { ext: '.md', current: snapshot.md, previous: backup?.md ?? null },
    { ext: '.markdown', current: snapshot.markdown, previous: backup?.markdown ?? null }
  ]

  for (const { ext, current, previous } of pairs) {
    await regDeleteValue(classKey(ext + '\\OpenWithProgids'), PROGID)
    if (current && current !== PROGID) continue
    if (previous) {
      await regAdd(classKey(ext), null, 'REG_SZ', previous).catch(() => {})
    } else {
      await regDeleteValue(classKey(ext), null)
    }
  }

  await regDeleteKey(classKey(PROGID))
  await regDeleteKey(classKey(`Applications\\${APP_KEY}`))
  await regDeleteKey('HKCU\\Software\\md-viewer')
  await regDeleteValue('HKCU\\Software\\RegisteredApplications', REG_APP_ID)

  patchSettings({ assocBackup: null })
  notifyShell()
  return getAssocInfo()
}
