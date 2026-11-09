import { readFile } from 'node:fs/promises'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const CDN = 'https://esm.sh/'
const LOCAL = 'mdv://asset/'

/**
 * Excalidraw 的每个字体都会带上一个 esm.sh 兜底源，浏览器会把列表里的每个源都请求一遍。
 * 改成本地协议后运行时不再有任何外部请求，路径由主进程 serveAsset 归一化。
 */
function excalidrawOfflineAssets(): Plugin {
  return {
    name: 'excalidraw-offline-assets',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@excalidraw') || !code.includes(CDN)) return null
      return { code: code.replaceAll(CDN, LOCAL), map: null }
    }
  }
}

const excalidrawOfflineAssetsEsbuild = {
  name: 'excalidraw-offline-assets',
  setup(build: {
    onLoad: (
      filter: { filter: RegExp },
      handler: (args: { path: string }) => Promise<{ contents: string; loader: 'js' } | null>
    ) => void
  }): void {
    build.onLoad({ filter: /@excalidraw[\\/]excalidraw[\\/]dist[\\/]prod[\\/].*\.js$/ }, async (args) => {
      const code = await readFile(args.path, 'utf8')
      if (!code.includes(CDN)) return null
      return { contents: code.replaceAll(CDN, LOCAL), loader: 'js' }
    })
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    optimizeDeps: {
      esbuildOptions: { plugins: [excalidrawOfflineAssetsEsbuild] }
    },
    plugins: [react(), excalidrawOfflineAssets()]
  }
})