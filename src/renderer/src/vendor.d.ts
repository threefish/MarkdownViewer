declare module 'simple-mind-map/src/plugins/*' {
  const plugin: any
  export default plugin
}

declare module 'simple-mind-map/src/parse/xmind.js' {
  const parser: {
    parseXmindFile(file: Blob, handleMultiCanvas?: (content: unknown[]) => unknown): Promise<unknown>
    transformToXmind(data: unknown, name: string): Promise<Blob>
  }
  export default parser
}
