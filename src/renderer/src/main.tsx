import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './styles/app.css'
import './styles/markdown.css'
import './styles/code.css'
import App from './App'

const container = document.getElementById('root')
if (!container) throw new Error('root element missing')

createRoot(container).render(<App />)
