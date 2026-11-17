import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { AssocInfo, AssocState } from '../shared/types'
import { imageFileExtensions, textFileExtensions } from '../shared/fileKinds'
import { getSettings, patchSettings } from './settings'

const REG_APP_ID = 'md-viewer'
const APP_KEY = 'md-viewer.exe'
const APP_NAME = 'Markdown Viewer'
const AUMID = 'com.local.mdviewer'
const LEGACY_PROGID = 'MarkdownViewer.md'

const UNINSTALL_KEY = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${REG_APP_ID}`
const APP_PATHS_KEY = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${APP_KEY}`
const CAPABILITIES_KEY = `HKCU\\Software\\${REG_APP_ID}\\Capabilities`
const REGISTERED_APPS_KEY = 'HKCU\\Software\\RegisteredApplications'

interface RegSnapshot {
  cmd: string | null
  uninstall: string | null
  md: string | null
  markdown: string | null
  userChoice: string | null
}

interface ProgIdFamily {
  progId: string
  name: string
  exts: string[]
}

function families(): ProgIdFamily[] {
  const text = textFileExtensions().filter(
    (ext) => ext !== 'md' && ext !== 'markdown' && ext !== 'smm' && ext !== 'excalidraw'
  )
  return [
    { progId: 'MarkdownViewer.md', name: 'Markdown 文档', exts: ['md', 'markdown'] },
    { progId: 'MarkdownViewer.mindmap', name: '脑图', exts: ['smm', 'xmind'] },
    { progId: 'MarkdownViewer.drawing', name: '画板', exts: ['excalidraw'] },
    { progId: 'MarkdownViewer.pdf', name: 'PDF 文档', exts: ['pdf'] },
    { progId: 'MarkdownViewer.image', name: '图片', exts: imageFileExtensions() },
    { progId: 'MarkdownViewer.text', name: '文本 / 代码', exts: text }
  ]
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
  uninstall = (ReadVal 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\md-viewer' 'DisplayName')
  md = (ReadVal 'HKCU:\Software\Classes\.md' '(default)')
  markdown = (ReadVal 'HKCU:\Software\Classes\.markdown' '(default)')
  userChoice = (ReadVal 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice' 'ProgId')
} | ConvertTo-Json -Compress
`

async function readSnapshot(): Promise<RegSnapshot> {
  const empty: RegSnapshot = { cmd: null, uninstall: null, md: null, markdown: null, userChoice: null }
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
      uninstall: norm(parsed.uninstall),
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

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

// 撤销后留下空壳 OpenWithProgids 键会显得没清干净；只在既无值也无子键时才删键。
async function removeEmptyOpenWithKeys(exts: string[]): Promise<void> {
  if (!exts.length) return
  const paths = exts.map((ext) => psQuote(`HKCU:\\Software\\Classes\\.${ext}\\OpenWithProgids`)).join(', ')
  const script = String.raw`$ErrorActionPreference = 'SilentlyContinue'
foreach ($p in @(${paths})) {
  $key = Get-Item -LiteralPath $p
  if ($null -eq $key) { continue }
  if ($key.GetValueNames().Count -eq 0 -and $key.GetSubKeyNames().Count -eq 0) { Remove-Item -LiteralPath $p }
}`
  try {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], 20000)
  } catch (err) {
    console.error('[registry] cleanup failed', err)
  }
}

function startMenuShortcut(): string {
  return path.join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    `${APP_NAME}.lnk`
  )
}

async function writeStartMenuShortcut(exePath: string): Promise<void> {
  const lnk = startMenuShortcut()
  const script = String.raw`$ErrorActionPreference = 'Stop'
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut(${psQuote(lnk)})
$sc.TargetPath = ${psQuote(exePath)}
$sc.WorkingDirectory = ${psQuote(path.dirname(exePath))}
$sc.IconLocation = ${psQuote(`${exePath},0`)}
$sc.Description = ${psQuote(APP_NAME)}
$sc.Save()
`
  try {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script])
  } catch (err) {
    console.error('[registry] start menu shortcut failed', err)
  }
}

async function notifyShell(): Promise<void> {
  const ps = String.raw`Add-Type -Namespace MDV -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int eventId, int flags, System.IntPtr item1, System.IntPtr item2);'; [MDV.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)`
  try {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 5000)
  } catch {
    // best effort only
  }
}

function classKey(sub: string): string {
  return `HKCU\\Software\\Classes\\${sub}`
}

export async function getAssocInfo(): Promise<AssocInfo> {
  const snapshot = await readSnapshot()
  const exePath = process.execPath
  const registeredExe = exeFromCommand(snapshot.cmd)
  let state: AssocState
  if (!snapshot.cmd && !snapshot.uninstall) {
    state = 'notRegistered'
  } else if (registeredExe && (await sameExe(registeredExe, exePath)) === true) {
    // 旧版只写 ProgID、没有应用身份项，视为需要修复，按钮会提示重新注册。
    state = !snapshot.uninstall
      ? 'stale'
      : snapshot.userChoice && snapshot.userChoice !== LEGACY_PROGID
        ? 'otherApp'
        : 'ok'
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

async function writeRegistration(exePath: string): Promise<void> {
  const command = `"${exePath}" "%1"`
  const all: ProgIdFamily[] = families()

  for (const { progId, name, exts } of all) {
    const progKey = classKey(progId)
    await regAdd(progKey, null, 'REG_SZ', name)
    await regAdd(progKey, 'FriendlyTypeName', 'REG_SZ', name)
    await regAdd(progKey, 'AppUserModelID', 'REG_SZ', AUMID)
    await regAdd(classKey(`${progId}\\DefaultIcon`), null, 'REG_SZ', `"${exePath}",0`)
    await regAdd(classKey(`${progId}\\shell\\open\\command`), null, 'REG_SZ', command)
    for (const ext of exts) {
      await regAdd(classKey(`.${ext}\\OpenWithProgids`), progId, 'REG_NONE', '')
    }
  }

  const appKey = classKey(`Applications\\${APP_KEY}`)
  await regAdd(appKey, null, 'REG_SZ', APP_NAME)
  await regAdd(appKey, 'FriendlyAppName', 'REG_SZ', APP_NAME)
  await regAdd(appKey, 'AppUserModelID', 'REG_SZ', AUMID)
  await regAdd(classKey(`Applications\\${APP_KEY}\\shell\\open\\command`), null, 'REG_SZ', command)
  for (const { exts } of all) {
    for (const ext of exts) {
      await regAdd(classKey(`Applications\\${APP_KEY}\\SupportedTypes`), `.${ext}`, 'REG_NONE', '')
    }
  }

  await regAdd(CAPABILITIES_KEY, 'ApplicationName', 'REG_SZ', APP_NAME)
  await regAdd(CAPABILITIES_KEY, 'ApplicationDescription', 'REG_SZ', '本地 Markdown 文档阅读与编辑器')
  await regAdd(CAPABILITIES_KEY, 'ApplicationIcon', 'REG_SZ', `"${exePath}",0`)
  for (const { progId, exts } of all) {
    for (const ext of exts) {
      await regAdd(`${CAPABILITIES_KEY}\\FileAssociations`, `.${ext}`, 'REG_SZ', progId)
    }
  }
  await regAdd(REGISTERED_APPS_KEY, REG_APP_ID, 'REG_SZ', `Software\\${REG_APP_ID}\\Capabilities`)

  await regAdd(UNINSTALL_KEY, null, 'REG_SZ', APP_NAME)
  await regAdd(UNINSTALL_KEY, 'DisplayName', 'REG_SZ', APP_NAME)
  await regAdd(UNINSTALL_KEY, 'DisplayVersion', 'REG_SZ', app.getVersion())
  await regAdd(UNINSTALL_KEY, 'Publisher', 'REG_SZ', 'local')
  await regAdd(UNINSTALL_KEY, 'DisplayIcon', 'REG_SZ', `"${exePath}",0`)
  await regAdd(UNINSTALL_KEY, 'InstallLocation', 'REG_SZ', path.dirname(exePath))
  await regAdd(UNINSTALL_KEY, 'UninstallString', 'REG_SZ', `"${exePath}" --unregister`)
  await regAdd(UNINSTALL_KEY, 'QuietUninstallString', 'REG_SZ', `"${exePath}" --unregister`)
  await regAdd(UNINSTALL_KEY, 'NoModify', 'REG_DWORD', '1')
  await regAdd(UNINSTALL_KEY, 'NoRepair', 'REG_DWORD', '1')

  await regAdd(APP_PATHS_KEY, null, 'REG_SZ', exePath)
  await regAdd(APP_PATHS_KEY, 'Path', 'REG_SZ', path.dirname(exePath))

  await writeStartMenuShortcut(exePath)
}

export async function registerAssociation(): Promise<AssocInfo> {
  if (!app.isPackaged) throw new Error('开发模式不注册，请使用打包后的程序')
  await writeRegistration(process.execPath)
  await notifyShell()
  return getAssocInfo()
}

export async function unregisterAssociation(): Promise<AssocInfo> {
  const snapshot = await readSnapshot()
  const backup = getSettings().assocBackup
  const all: ProgIdFamily[] = families()

  for (const { progId, exts } of all) {
    for (const ext of exts) {
      await regDeleteValue(classKey(`.${ext}\\OpenWithProgids`), progId)
    }
    await regDeleteKey(classKey(progId))
  }

  // 旧版把 .md/.markdown 的默认程序直接改成我们的 ProgID；撤销时恢复注册前的值。
  const legacy: Array<{ ext: '.md' | '.markdown'; current: string | null; previous: string | null }> = [
    { ext: '.md', current: snapshot.md, previous: backup?.md ?? null },
    { ext: '.markdown', current: snapshot.markdown, previous: backup?.markdown ?? null }
  ]
  for (const { ext, current, previous } of legacy) {
    if (current !== LEGACY_PROGID) continue
    if (previous) await regAdd(classKey(ext), null, 'REG_SZ', previous).catch(() => {})
    else await regDeleteValue(classKey(ext), null)
  }

  await removeEmptyOpenWithKeys(all.flatMap((family) => family.exts))
  await regDeleteKey(classKey(`Applications\\${APP_KEY}`))
  await regDeleteKey(`HKCU\\Software\\${REG_APP_ID}`)
  await regDeleteValue(REGISTERED_APPS_KEY, REG_APP_ID)
  await regDeleteKey(UNINSTALL_KEY)
  await regDeleteKey(APP_PATHS_KEY)
  try {
    await fs.unlink(startMenuShortcut())
  } catch {
    // shortcut may not exist
  }

  patchSettings({ assocBackup: null })
  await notifyShell()
  return getAssocInfo()
}
