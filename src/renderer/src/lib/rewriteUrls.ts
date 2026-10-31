import type { Root, Element } from 'hast'
import { visit } from 'unist-util-visit'
import { localFileUrl, resolveLocalPath } from './pathResolve'

export function rewriteLocalImages(options: { baseDir: string }) {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'img') return
      const src = node.properties?.src
      if (typeof src !== 'string' || !src) return
      if (/^(https?:|data:|mdv:|blob:)/i.test(src)) return
      if (src.startsWith('//')) {
        node.properties!.src = `https:${src}`
        return
      }
      const resolved = resolveLocalPath(options.baseDir, src)
      if (resolved) node.properties!.src = localFileUrl(resolved)
    })
  }
}
