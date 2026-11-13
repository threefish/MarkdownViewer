declare module 'simple-mind-map/src/plugins/*' {
  const plugin: any
  export default plugin
}

declare module 'simple-mind-map/src/layouts/CatalogOrganization.js' {
  const layout: { prototype: Record<string, unknown> }
  export default layout
}

declare module 'simple-mind-map/src/parse/xmind.js' {
  const parser: {
    parseXmindFile(file: Blob, handleMultiCanvas?: (content: unknown[]) => unknown): Promise<unknown>
    transformToXmind(data: unknown, name: string): Promise<Blob>
  }
  export default parser
}

declare module 'simple-mind-map-plugin-themes' {
  export interface MindMapThemeItem {
    name: string
    value: string
    theme: Record<string, unknown>
    dark: boolean
  }
  const Themes: {
    lightList: MindMapThemeItem[]
    darkList: MindMapThemeItem[]
    init(MindMap: unknown): void
    remove(MindMap: unknown): void
  }
  export default Themes
}
