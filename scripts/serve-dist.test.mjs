import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from './serve-dist.mjs';

// Gửi request thô (không chuẩn hóa URL) tới server tạm trên cổng ngẫu nhiên.
function get(port, rawPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: rawPath }, (res) => {
      res.resume();
      res.on('end', () => resolve(res));
    }).on('error', reject);
  });
}

async function withServer(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'serve-dist-'));
  await mkdir(path.join(root, '2048'));
  await writeFile(path.join(root, '2048', 'index.html'), '<h1>2048</h1>');
  await writeFile(path.join(root, 'index.html'), 'home');
  const server = createServer(root);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn(server.address().port);
  } finally {
    await new Promise((r) => server.close(r));
    await rm(root, { recursive: true, force: true });
  }
}

test('URL hỏng (%E0) trả 400', () =>
  withServer(async (port) => {
    assert.equal((await get(port, '/playnine/%E0')).statusCode, 400);
  }));

test('thư mục thiếu dấu / cuối trả 301 và giữ query', () =>
  withServer(async (port) => {
    const res = await get(port, '/playnine/2048?x=1');
    assert.equal(res.statusCode, 301);
    assert.equal(res.headers.location, '/playnine/2048/?x=1');
    const plain = await get(port, '/playnine/2048');
    assert.equal(plain.headers.location, '/playnine/2048/');
  }));

test('thoát khỏi thư mục gốc bị chặn (403/404)', () =>
  withServer(async (port) => {
    const res = await get(port, '/playnine/..%2f..%2fpackage.json');
    assert.ok([403, 404].includes(res.statusCode), `status ${res.statusCode}`);
  }));

test('file bình thường trả 200', () =>
  withServer(async (port) => {
    assert.equal((await get(port, '/playnine/')).statusCode, 200);
    assert.equal((await get(port, '/playnine/2048/')).statusCode, 200);
  }));
