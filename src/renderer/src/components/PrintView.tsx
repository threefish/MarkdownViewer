import { useEffect, useState } from 'react'
import type { PrintPayload } from '../../../shared/types'
import { MarkdownDocument } from '../lib/markdown'
import '../styles/print.css'

export function PrintView(): React.JSX.Element | null {
  const [payload, setPayload] = useState<PrintPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.mdv.printPayload().then((next) => {
      if (cancelled || !next) return
      document.documentElement.dataset.theme = next.theme
      setPayload(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!payload) return null

  return (
    <article className="markdown-body">
      <MarkdownDocument
        content={payload.content}
        baseDir={payload.baseDir}
        theme={payload.theme}
        onLink={() => {}}
        eager
      />
    </article>
  )
}
