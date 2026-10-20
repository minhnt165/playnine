// Máy chủ tĩnh nhỏ phục vụ dist/ tại /playnine/ (giống GitHub Pages) để chạy e2e.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.argv[2] ?? 4173);
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

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(base)) {
      res.writeHead(302, { Location: base });
      return res.end();
    }
    let file = path.join(root, decodeURIComponent(url.pathname.slice(base.length)));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(port, () => console.log(`serving dist/ at http://localhost:${port}${base}`));
