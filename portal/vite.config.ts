/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { serveGames } from './vite/serve-games'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Phiên bản lấy từ package.json gốc; commit lấy từ GitHub Actions, chạy local thì hỏi git, không được thì 'dev'.
const appVersion: string = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version
function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  base: '/playnine/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __COMMIT__: JSON.stringify(commitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react(), serveGames(repoRoot)],
  // Tránh 5173 (máy dev đang có app khác chiếm); strictPort để không tự nhảy port, vì Redirect URL của Supabase Auth gắn với port này.
  // fs.allow: danh mục game nạp games/*/game.json và games/order.json nằm ngoài portal/.
  server: { port: 5180, strictPort: true, fs: { allow: [repoRoot] } },
  test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'] },
})