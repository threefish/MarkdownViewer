export const LITE_CHARS = 2_000_000
export const HUGE_CHARS = 20_000_000

export type DocTier = 'normal' | 'lite' | 'huge'

export function docTier(chars: number): DocTier {
  if (chars >= HUGE_CHARS) return 'huge'
  if (chars >= LITE_CHARS) return 'lite'
  return 'normal'
}

export function isLargeDoc(chars: number): boolean {
  return chars >= LITE_CHARS
}

/** Wrapping a multi-megachar line costs seconds at open; unwrapped keeps open fast. */
export function hasVeryLongLine(text: string, limit = 100_000): boolean {
  if (text.length <= limit) return false
  let start = 0
  while (start < text.length) {
    const end = text.indexOf('\n', start)
    const stop = end === -1 ? text.length : end
    if (stop - start > limit) return true
    if (end === -1) return false
    start = end + 1
  }
  return false
}
