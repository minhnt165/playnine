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

const inside = (root: string, file: string) => file === root || file.startsWith(root + path.sep)

/**
 * Ánh xạ URL dev sang file thật: /playnine/brand/* -> <repo>/brand/*, /playnine/<d>/* -> <repo>/games/<d>/*.
 * Trả null nếu không khớp hoặc thoát khỏi thư mục gốc (.., dấu phân cách trong tên game...).
 */
export function resolveGameFile(rawUrl: string, repoRoot: string, base = '/playnine/'): string | null {
  const urlPath = rawUrl.split('?')[0].split('#')[0]
  if (!urlPath.startsWith(base)) return null
  let rel: string
  try {
    rel = decodeURIComponent(urlPath.slice(base.length))
  } catch {
    return null
  }
  if (rel.includes('\0') || rel.includes('\\')) return null
  const [first, ...rest] = rel.split('/')
  if (!first || first === '.' || first === '..') return null
  const gamesDir = path.join(repoRoot, 'games')
  let root: string
  if (first === 'brand') root = path.join(repoRoot, 'brand')
  else {
    root = path.resolve(gamesDir, first)
    if (root === gamesDir || !inside(gamesDir, root)) return null
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return null
  let sub = rest.join('/')
  if (sub === '' || sub.endsWith('/')) sub += 'index.html'
  const file = path.resolve(root, sub)
  if (!inside(root, file) || file === root) return null
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null
  return file
}

/** Chỉ chạy ở dev. */
export function serveGames(repoRoot: string, base = '/playnine/'): Plugin {
  return {
    name: 'playnine-serve-games',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = resolveGameFile(req.url ?? '', repoRoot, base)
        if (!file) return next()
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}