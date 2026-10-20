/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { serveGames } from './vite/serve-games'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export default defineConfig({
  base: '/playnine/',
  plugins: [react(), serveGames(repoRoot)],
  test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'] },
})