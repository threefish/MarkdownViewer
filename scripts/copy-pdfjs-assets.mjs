import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(root, 'node_modules/pdfjs-dist')
const targetRoot = path.join(root, 'out/renderer/pdfjs')

// cMaps 用于中日韩等非嵌入字体的字符映射，standard_fonts 用于未内嵌的标准字体。
for (const name of ['cmaps', 'standard_fonts']) {
  const source = path.join(sourceRoot, name)
  const info = await stat(source).catch(() => null)
  if (!info?.isDirectory()) {
    console.error(`[pdfjs] 资源目录不存在：${source}`)
    process.exit(1)
  }
  await mkdir(path.join(targetRoot, name), { recursive: true })
  await cp(source, path.join(targetRoot, name), { recursive: true })
}

let count = 0
const walk = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await walk(path.join(dir, entry.name))
    else count += 1
  }
}
await walk(targetRoot)
console.log(`[pdfjs] 已拷贝 ${count} 个资源文件到 out/renderer/pdfjs`)
