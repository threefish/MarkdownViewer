import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'
import { isExcalidrawFile } from '../../../shared/fileKinds'
import { resolveLocalPath } from './pathResolve'

export const SCENE_PATH = 'mdvscene'

/** 两种嵌入语法在此汇合：wiki 链接已被 remark 转成 img，图片语法本就是 img。 */
export function markExcalidrawEmbeds(options: { baseDir: string }) {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'img') return
      const src = node.properties?.src
      if (typeof src !== 'string' || !src) return
      if (/^(https?:|data:|mdv:|blob:)/i.test(src)) return
      const resolved = resolveLocalPath(options.baseDir, src)
      if (!resolved || !isExcalidrawFile(resolved)) return
      // 节点位于 <p> 内，用 span + display:block 避免非法 DOM 嵌套。
      node.tagName = 'span'
      node.properties = { className: ['excalidraw-embed'], [SCENE_PATH]: resolved }
      node.children = []
    })
  }
}