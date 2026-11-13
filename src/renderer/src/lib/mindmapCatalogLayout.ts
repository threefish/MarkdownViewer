import CatalogOrganization from 'simple-mind-map/src/layouts/CatalogOrganization.js'

interface LayoutLinePath {
  plot(path: string): void
  hide(): void
  show(): void
}

interface LayoutNode {
  isRoot: boolean
  parent?: LayoutNode
  children: LayoutNode[]
  left: number
  top: number
  width: number
  height: number
  expandBtnSize: number
  layerIndex: number
  style: { line(path: LayoutLinePath): void }
  _lines: LayoutLinePath[]
}

interface LayoutButton {
  translate(x: number, y: number): void
  transform(): { translateX: number; translateY: number }
}

type LayoutStyle = (line: LayoutLinePath, node: LayoutNode) => void

interface LayoutContext {
  mindMap: {
    opt: { alwaysShowExpandBtn?: boolean; notShowExpandBtn?: boolean }
    themeConfig: { nodeUseLineStyle?: boolean }
  }
  lineDraw: { path(): LayoutLinePath }
  transformPath(path: string): string
  getMarginX(layerIndex: number): number
  setLineStyle(
    style: LayoutStyle | undefined,
    line: LayoutLinePath,
    path: string,
    item: LayoutNode
  ): void
}

// 目录组织图里一级节点由根节点竖直落到顶边、更深节点从左侧水平接入，
// 而库把出线主干和展开按钮固定在宽度的 30% 处，入线与出线因此错位。
// 这里统一锚点：一级节点取 30%，更深节点取左缘。
function anchorX(node: LayoutNode): number {
  return node.parent?.isRoot ? node.left + node.width * 0.3 : node.left
}

let patched = false

export function patchCatalogOrganizationLayout(): void {
  if (patched) return
  patched = true

  const proto = (CatalogOrganization as unknown as { prototype: unknown }).prototype as {
    renderLine(
      this: LayoutContext,
      node: LayoutNode,
      lines: LayoutLinePath[],
      style?: LayoutStyle
    ): void
    renderExpandBtn(this: unknown, node: LayoutNode, btn: LayoutButton): void
  }

  // 与库内实现一致，仅把连接锚点换成 anchorX
  proto.renderLine = function (node, lines, style): void {
    const { left, top, width, height } = node
    let { expandBtnSize } = node
    const { alwaysShowExpandBtn, notShowExpandBtn } = this.mindMap.opt
    if (!alwaysShowExpandBtn || notShowExpandBtn) expandBtnSize = 0
    const len = node.children.length
    const y1 = top + height

    if (node.isRoot) {
      const x1 = left + width / 2
      const s1 = this.getMarginX(node.layerIndex + 1) * 0.7
      let minx = Infinity
      let maxx = -Infinity
      node.children.forEach((item, index) => {
        const x2 = anchorX(item)
        const y2 = item.top
        if (x2 < minx) minx = x2
        if (x2 > maxx) maxx = x2
        const cap = this.mindMap.themeConfig.nodeUseLineStyle
          ? ` L ${item.left},${y2} L ${item.left + item.width},${y2}`
          : ''
        const path = `M ${x2},${y1 + s1} L ${x2},${y1 + s1 > y2 ? y2 + item.height : y2}` + cap
        this.setLineStyle(style, lines[index], path, item)
      })
      minx = Math.min(minx, x1)
      maxx = Math.max(maxx, x1)
      const trunk = this.lineDraw.path()
      node.style.line(trunk)
      trunk.plot(this.transformPath(`M ${x1},${y1} L ${x1},${y1 + s1}`))
      node._lines.push(trunk)
      if (style) style(trunk, node)
      if (len > 0) {
        const bus = this.lineDraw.path()
        node.style.line(bus)
        bus.plot(this.transformPath(`M ${minx},${y1 + s1} L ${maxx},${y1 + s1}`))
        node._lines.push(bus)
        if (style) style(bus, node)
      }
      return
    }

    const x2 = anchorX(node)
    let maxy = -Infinity
    node.children.forEach((item, index) => {
      let y2 = item.top + item.height / 2
      if (y2 > maxy) maxy = y2
      let target = item.left
      const onLeft = item.left + item.width < x2
      let spansTrunk = false
      if (onLeft) {
        target = item.left + item.width
      } else if (item.left < x2 && item.left + item.width > x2) {
        // 兼容手动拖拽到与主干重叠的节点
        spansTrunk = true
        y2 = item.top
        maxy = y2
      }
      let path: string
      if (y2 > top && y2 < y1) {
        path = `M ${onLeft ? node.left : node.left + node.width},${y2} L ${target},${y2}`
      } else if (y2 < y1) {
        if (spansTrunk) {
          y2 = item.top + item.height
          target = x2
        }
        path = `M ${x2},${top} L ${x2},${y2} L ${target},${y2}`
      } else {
        if (spansTrunk) target = x2
        path = `M ${x2},${y2} L ${target},${y2}`
      }
      if (this.mindMap.themeConfig.nodeUseLineStyle) {
        path += ` L ${target},${y2 - item.height / 2} L ${target},${y2 + item.height / 2}`
      }
      this.setLineStyle(style, lines[index], path, item)
    })
    if (len > 0) {
      const trunk = this.lineDraw.path()
      node.style.line(trunk)
      if (maxy < y1 + expandBtnSize) {
        trunk.hide()
      } else {
        trunk.plot(this.transformPath(`M ${x2},${y1 + expandBtnSize} L ${x2},${maxy}`))
        trunk.show()
      }
      node._lines.push(trunk)
      if (style) style(trunk, node)
    }
  }

  proto.renderExpandBtn = function (node, btn): void {
    if (node.isRoot) return
    const { width, height, expandBtnSize } = node
    const { translateX, translateY } = btn.transform()
    const centerX = node.parent?.isRoot ? width * 0.3 : 0
    btn.translate(
      centerX - expandBtnSize / 2 - translateX,
      height + expandBtnSize / 2 - translateY
    )
  }
}
