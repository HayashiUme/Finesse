import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = process.env.FINESSE_VERSION ?? readFileSync(resolve(import.meta.dirname, '../VERSION'), 'utf8').trim()

function serviceWorkerPlugin(): Plugin {
  return {
    name: 'finesse-service-worker',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'service-worker.js',
        source: `// Finesse build ${version}\nself.addEventListener('install', event => self.skipWaiting());\nself.addEventListener('activate', event => event.waitUntil(self.clients.claim()));\n`,
      })
    },
  }
}

export default defineConfig({ plugins: [react(), serviceWorkerPlugin()], define: { __FINESSE_VERSION__: JSON.stringify(version) } })
