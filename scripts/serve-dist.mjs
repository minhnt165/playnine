// Máy chủ tĩnh nhỏ phục vụ dist/ tại /playnine/ (giống GitHub Pages) để chạy e2e.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const base = '/playnine/';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

/** Tạo server tĩnh phục vụ thư mục `root` tại /playnine/ (chưa listen). */
export function createServer(root = defaultRoot) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(base)) {
      res.writeHead(302, { Location: base });
      return res.end();
    }
    try {
      // decodeURIComponent nằm trong try: URL hỏng (vd %E0) trả 400 thay vì crash.
      let file;
      try {
        file = path.join(root, decodeURIComponent(url.pathname.slice(base.length)));
      } catch {
        res.writeHead(400);
        return res.end('Bad request');
      }
      if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403);
        return res.end();
      }
      if ((await stat(file)).isDirectory()) {
        // Thư mục thiếu dấu / cuối: chuyển hướng như GitHub Pages, giữ nguyên query.
        if (!url.pathname.endsWith('/')) {
          res.writeHead(301, { Location: url.pathname + '/' + url.search });
          return res.end();
        }
        file = path.join(file, 'index.html');
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4173);
  createServer().listen(port, () => console.log(`serving dist/ at http://localhost:${port}${base}`));
}
