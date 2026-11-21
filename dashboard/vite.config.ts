import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = process.env.FINESSE_VERSION ?? readFileSync(resolve(import.meta.dirname, '../VERSION'), 'utf8').trim()

export default defineConfig({ plugins: [react()], define: { __FINESSE_VERSION__: JSON.stringify(version) } })
