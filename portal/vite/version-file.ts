import type { Plugin } from 'vite'
import type { BuildInfo } from '../src/lib/buildInfo'

export const VERSION_FILE = 'version.json'

/**
 * Ghi version.json (version, commit, thời điểm build) vào gốc bản build và phục vụ nó khi chạy dev.
 * App cài trên màn hình chính fetch file này để biết server đã có bản mới chưa (src/lib/updateCheck.ts).
 */
export function versionFile(info: BuildInfo, base = '/playnine/'): Plugin {
  const source = JSON.stringify(info)
  return {
    name: 'playnine-version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: VERSION_FILE, source })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0] !== base + VERSION_FILE) return next()
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(source)
      })
    },
  }
}
