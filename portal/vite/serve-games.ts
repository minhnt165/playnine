import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Chỉ chạy ở dev: phục vụ /playnine/brand/* từ <repo>/brand và /playnine/<d>/* từ <repo>/games/<d>
 * (khi games/<d> tồn tại). URL kết thúc bằng "/" thì trả index.html của thư mục.
 */
export function serveGames(repoRoot: string, base = '/playnine/'): Plugin {
  return {
    name: 'playnine-serve-games',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = (req.url ?? '').split('?')[0].split('#')[0]
        if (!rawUrl.startsWith(base)) return next()
        let rel: string
        try {
          rel = decodeURIComponent(rawUrl.slice(base.length))
        } catch {
          return next()
        }
        const [first, ...rest] = rel.split('/')
        let root: string
        let sub: string
        if (first === 'brand') {
          root = path.join(repoRoot, 'brand')
          sub = rest.join('/')
        } else if (first && fs.existsSync(path.join(repoRoot, 'games', first)) && fs.statSync(path.join(repoRoot, 'games', first)).isDirectory()) {
          root = path.join(repoRoot, 'games', first)
          sub = rest.join('/')
        } else {
          return next()
        }
        if (sub === '' || sub.endsWith('/')) sub += 'index.html'
        const file = path.resolve(root, sub)
        // chặn thoát khỏi thư mục gốc (../)
        if (file !== root && !file.startsWith(root + path.sep)) return next()
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return next()
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}