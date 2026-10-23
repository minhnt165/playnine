import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGame } from './new-game.mjs';

// Cây giả: games/_template (2 file có placeholder) và games/order.json = ["aa"].
async function fixture(orderText = '[\n  "aa"\n]\n') {
  const root = await mkdtemp(path.join(tmpdir(), 'newgame-'));
  const tpl = path.join(root, 'games', '_template');
  await mkdir(path.join(tpl, 'sub'), { recursive: true });
  await writeFile(path.join(tpl, 'game.json'), '{"id":"{{id}}","cat":"{{cat}}","addedAt":"{{date}}","name":{"en":"{{nameEn}}","vi":"{{nameVi}}"}}');
  await writeFile(path.join(tpl, 'sub', 'app.js'), "PNKit.init({ gameId: '{{id}}' }); // {{id}}");
  await writeFile(path.join(root, 'games', 'order.json'), orderText);
  return root;
}

const opts = (root, over = {}) => ({ root, dir: 'xyz', nameEn: 'Xyz', nameVi: 'Xì', cat: 'card', today: '2026-10-24', ...over });

test('copies the template, fills every placeholder and appends the id to order.json', async () => {
  const root = await fixture();
  await createGame(opts(root));
  const m = JSON.parse(await readFile(path.join(root, 'games', 'xyz', 'game.json'), 'utf8'));
  assert.deepEqual(m, { id: 'xyz', cat: 'card', addedAt: '2026-10-24', name: { en: 'Xyz', vi: 'Xì' } });
  assert.equal(await readFile(path.join(root, 'games', 'xyz', 'sub', 'app.js'), 'utf8'), "PNKit.init({ gameId: 'xyz' }); // xyz");
  assert.equal(await readFile(path.join(root, 'games', 'order.json'), 'utf8'), '[\n  "aa",\n  "xyz"\n]\n');
});

test('keeps CRLF line endings of order.json', async () => {
  const root = await fixture('[\r\n  "aa"\r\n]\r\n');
  await createGame(opts(root));
  assert.equal(await readFile(path.join(root, 'games', 'order.json'), 'utf8'), '[\r\n  "aa",\r\n  "xyz"\r\n]\r\n');
});

test('refuses an existing folder', async () => {
  const root = await fixture();
  await createGame(opts(root));
  await assert.rejects(createGame(opts(root)), /đã tồn tại/);
});

test('refuses a bad folder name or an unknown category', async () => {
  const root = await fixture();
  await assert.rejects(createGame(opts(root, { dir: 'Bad Name' })), /tên thư mục/);
  await assert.rejects(createGame(opts(root, { dir: '_x' })), /tên thư mục/);
  await assert.rejects(createGame(opts(root, { cat: 'sport' })), /thể loại/);
  await assert.rejects(createGame(opts(root, { nameVi: '' })), /tên/);
});
