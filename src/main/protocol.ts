import { protocol } from 'electron'
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
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

function notFound(): Response {
  return new Response('not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

export function setupProtocol(): void {
  protocol.handle('mdv', async (request) => {
    try {
      const url = new URL(request.url)
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
