import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './styles/app.css'
import './styles/markdown.css'
import './styles/code.css'
import App from './App'

// Excalidraw 默认从 CDN 取字体；指向本地协议 host 才能保证离线渲染。
window.EXCALIDRAW_ASSET_PATH = 'mdv://asset/'
// file:// 下 location.origin 是 "null"，会被写进场景文件的 source 字段。
window.EXCALIDRAW_EXPORT_SOURCE = 'md-viewer'

const container = document.getElementById('root')
if (!container) throw new Error('root element missing')

createRoot(container).render(<App />)
