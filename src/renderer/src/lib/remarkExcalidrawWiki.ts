import type { Image, Root, Text } from 'mdast'
import type { Parent } from 'unist'
import { visit } from 'unist-util-visit'
import { isExcalidrawFile } from '../../../shared/fileKinds'

const WIKI_EMBED = /!\[\[([^[\]]+?)\]\]/g

/** 只把 ![[x.excalidraw]] 转成图片节点，其余 wiki 语法原样保留为文本。 */
export function remarkExcalidrawWiki() {
  return (tree: Root): void => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return
      if (parent.type === 'link' || parent.type === 'linkReference') return
      const value = node.value
      const parts: Array<Text | Image> = []
      let last = 0
      WIKI_EMBED.lastIndex = 0
      let match = WIKI_EMBED.exec(value)
      while (match) {
        const raw = match[1].trim()
        const bar = raw.indexOf('|')
        const target = (bar >= 0 ? raw.slice(0, bar) : raw).trim()
        if (isExcalidrawFile(target)) {
          if (match.index > last) parts.push({ type: 'text', value: value.slice(last, match.index) })
          parts.push({
            type: 'image',
            url: target,
            alt: bar >= 0 ? raw.slice(bar + 1).trim() : '',
            position: node.position
          })
          last = match.index + match[0].length
        }
        match = WIKI_EMBED.exec(value)
      }
      if (!parts.length) return
      if (last < value.length) parts.push({ type: 'text', value: value.slice(last) })
      ;(parent as Parent).children.splice(index, 1, ...parts)
      return index + parts.length
    })
  }
}