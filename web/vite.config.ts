import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

function offlineShell(): Plugin {
  return {
    name: 'offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter(name => name === 'index.html' || name.startsWith('assets/')).sort()
      const staticFiles = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'favicon.svg']
      const template = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8')
      const hash = createHash('sha256').update(template)
      for (const name of files) {
        const item = bundle[name]
        hash.update(name).update(item.type === 'asset' ? item.source : item.code)
      }
      for (const name of staticFiles) hash.update(readFileSync(new URL(`./public/${name}`, import.meta.url)))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: template
        .replace('__VERSION__', hash.digest('hex').slice(0, 16))
        .replace('__SHELL_FILES__', JSON.stringify([...files, ...staticFiles].map(name => `/${name}`))) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineShell()],
  server: {
    host: '127.0.0.1',
    port: 1117,
    strictPort: true,
    proxy: {
      '/api': process.env.AI_LIFE_API_URL || 'http://127.0.0.1:8787',
    },
  },
})
