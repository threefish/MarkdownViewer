import { app, protocol } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const IMAGE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.bmp',
  '.ico',
  '.svg'
])

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
}

export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'mdv',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

function notFound(): Response {
  return new Response('not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

/** 画板字体随包分发，根目录固定，不接受任何用户输入。 */
function assetRoot(): string {
  return app.isPackaged
    ? path.join(__dirname, '../renderer/excalidraw')
    : path.join(app.getAppPath(), 'node_modules/@excalidraw/excalidraw/dist/prod')
}

async function serveAsset(url: URL): Promise<Response> {
  const root = path.resolve(assetRoot())
  let relative = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  // 画板字体自带的兜底源形如 `@excalidraw/excalidraw@x/dist/prod/fonts/…`，统一归一到 fonts/ 下。
  const marker = relative.indexOf('fonts/')
  if (marker > 0) relative = relative.slice(marker)
  if (!relative) return notFound()
  const target = path.resolve(root, relative)
  if (!target.startsWith(root + path.sep)) return notFound()
  if (path.extname(target).toLowerCase() !== '.woff2') return notFound()
  const buffer = await fs.readFile(target)
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'font/woff2',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    }
  })
}

export function setupProtocol(): void {
  protocol.handle('mdv', async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname === 'asset') return await serveAsset(url)
      if (url.hostname !== 'local') return notFound()
      const encoded = decodeURIComponent(url.pathname.replace(/^\//, ''))
      if (!encoded) return notFound()
      const target = Buffer.from(encoded, 'base64url').toString('utf8')
      if (!target || !path.isAbsolute(target)) return notFound()
      const ext = path.extname(target).toLowerCase()
      if (!IMAGE_EXT.has(ext)) return notFound()
      const real = await fs.realpath(target)
      const stat = await fs.stat(real)
      if (!stat.isFile() || stat.size > 80 * 1024 * 1024) return notFound()
      const buffer = await fs.readFile(real)
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': MIME[ext] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache'
        }
      })
    } catch {
      return notFound()
    }
  })
}
