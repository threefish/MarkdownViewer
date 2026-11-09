import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts')
const target = path.join(root, 'out/renderer/excalidraw/fonts')

const info = await stat(source).catch(() => null)
if (!info?.isDirectory()) {
  console.error(`[excalidraw] 字体源目录不存在：${source}`)
  process.exit(1)
}

await mkdir(path.dirname(target), { recursive: true })
await cp(source, target, { recursive: true })

let count = 0
const walk = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await walk(path.join(dir, entry.name))
    else count += 1
  }
}
await walk(target)
console.log(`[excalidraw] 已拷贝 ${count} 个字体文件到 out/renderer/excalidraw/fonts`)