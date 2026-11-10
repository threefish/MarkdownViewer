import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface PdfOutlineEntry {
  id: string
  title: string
  level: number
  page: number | null
  items: PdfOutlineEntry[]
}

async function resolvePage(doc: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  if (!dest) return null
  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest
    if (!Array.isArray(explicit) || explicit.length === 0) return null
    const first = explicit[0]
    if (typeof first === 'number') return first + 1
    const index = await doc.getPageIndex(first)
    return index + 1
  } catch {
    return null
  }
}

export async function buildPdfOutline(doc: PDFDocumentProxy): Promise<PdfOutlineEntry[]> {
  const outline = await doc.getOutline().catch(() => null)
  if (!outline?.length) return []

  const walk = (nodes: typeof outline, level: number, prefix: string): Promise<PdfOutlineEntry[]> =>
    Promise.all(
      nodes.map(async (node, index) => {
        const id = `${prefix}${index}`
        return {
          id,
          title: (node.title ?? '').trim() || '(无标题)',
          level,
          page: await resolvePage(doc, node.dest),
          items: node.items?.length ? await walk(node.items, level + 1, `${id}.`) : []
        }
      })
    )

  return walk(outline, 1, 'pdf-')
}

export function flattenOutline(entries: PdfOutlineEntry[]): PdfOutlineEntry[] {
  const flat: PdfOutlineEntry[] = []
  const visit = (list: PdfOutlineEntry[]): void => {
    for (const entry of list) {
      flat.push(entry)
      visit(entry.items)
    }
  }
  visit(entries)
  return flat
}
