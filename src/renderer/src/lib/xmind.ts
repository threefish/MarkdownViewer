import xmind from 'simple-mind-map/src/parse/xmind.js'

/** 解析 .xmind（XMind 8 与 2020+ 两种格式），返回 simple-mind-map 节点树。 */
export async function parseXmindFile(file: File): Promise<unknown> {
  return xmind.parseXmindFile(file)
}
