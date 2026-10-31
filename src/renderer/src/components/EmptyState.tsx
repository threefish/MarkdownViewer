import type { RecentDoc } from '../../../shared/types'
import { BookIcon, FileIcon } from './Icons'

interface Props {
  recents: RecentDoc[]
  onOpen: (path: string) => void
  onOpenFile: () => void
  onOpenFolder: () => void
}

export function EmptyState({ recents, onOpen, onOpenFile, onOpenFolder }: Props): React.JSX.Element {
  return (
    <div className="empty">
      <div className="empty-inner">
        <div className="empty-logo">
          <BookIcon />
        </div>
        <h1>Markdown 阅读器</h1>
        <p className="empty-sub">
          双击任意 .md 文件即可在这里打开，支持图片、表格、数学公式与 Mermaid 图表。
        </p>
        <div className="empty-actions">
          <button type="button" className="btn primary" onClick={onOpenFile}>
            打开文件
          </button>
          <button type="button" className="btn" onClick={onOpenFolder}>
            打开文件夹
          </button>
        </div>

        {recents.length > 0 ? (
          <div className="recent">
            <div className="recent-title">最近打开</div>
            <div className="recent-list">
              {recents.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  className="recent-item"
                  onClick={() => onOpen(item.path)}
                  title={item.path}
                >
                  <FileIcon />
                  <span className="recent-name">{item.name}</span>
                  <span className="recent-path">{item.root}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="empty-hint">也可以把文件或文件夹拖进窗口</div>
      </div>
    </div>
  )
}
