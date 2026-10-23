import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assemble } from './assemble.mjs';

// Dựng cây giả: root/{games,brand}, portal/ và out/ trong thư mục tạm.
async function fixture() {
  const base = await mkdtemp(path.join(tmpdir(), 'assemble-'));
  const root = path.join(base, 'root');
  const portalDir = path.join(base, 'portal');
  const out = path.join(base, 'out');
  await mkdir(path.join(root, 'games'), { recursive: true });
  await mkdir(path.join(root, 'brand'), { recursive: true });
  await mkdir(portalDir, { recursive: true });
  await writeFile(path.join(root, 'brand', 'icon.svg'), '<svg/>');
  await writeFile(path.join(portalDir, 'index.html'), '<h1>portal</h1>');
  await mkdir(path.join(root, 'sdk', 'dist'), { recursive: true });
  await writeFile(path.join(root, 'sdk', 'dist', 'playnine.js'), 'window.PlayNine={}');
  return { root, portalDir, out };
}

const put = async (file, content) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
};
const exists = (p) => access(p).then(() => true, () => false);

test('copies legacy game folders verbatim', async () => {
  const { root, portalDir, out } = await fixture();
  await put(path.join(root, 'games', 'abc', 'index.html'), '<p>abc</p>');
  await assemble({ root, out, portalDir });
  assert.equal(await readFile(path.join(out, 'abc', 'index.html'), 'utf8'), '<p>abc</p>');
});

test('uses dist of games with package.json', async () => {
  const { root, portalDir, out } = await fixture();
  await put(path.join(root, 'games', 'neo', 'package.json'), '{}');
  await put(path.join(root, 'games', 'neo', 'dist', 'index.html'), '<p>neo</p>');
  await assemble({ root, out, portalDir });
  assert.equal(await readFile(path.join(out, 'neo', 'index.html'), 'utf8'), '<p>neo</p>');
  assert.equal(await exists(path.join(out, 'neo', 'package.json')), false);
});

test('skips underscore folders', async () => {
  const { root, portalDir, out } = await fixture();
  await put(path.join(root, 'games', '_template', 'index.html'), 'x');
  await assemble({ root, out, portalDir });
  assert.equal(await exists(path.join(out, '_template')), false);
});

test('copies _kit to dist/_kit but still skips other underscore folders', async () => {
  const { root, portalDir, out } = await fixture();
  await put(path.join(root, 'games', '_kit', 'kit.js'), 'kit');
  await put(path.join(root, 'games', '_template', 'index.html'), 'x');
  await assemble({ root, out, portalDir });
  assert.equal(await readFile(path.join(out, '_kit', 'kit.js'), 'utf8'), 'kit');
  assert.equal(await exists(path.join(out, '_template')), false);
});

test('copies portal, brand and writes .nojekyll', async () => {
  const { root, portalDir, out } = await fixture();
  await assemble({ root, out, portalDir });
  assert.equal(await exists(path.join(out, 'index.html')), true);
  assert.equal(await exists(path.join(out, 'brand', 'icon.svg')), true);
  assert.equal(await exists(path.join(out, '.nojekyll')), true);
});

test('defaults to portal/dist under root', async () => {
  const { root, out } = await fixture();
  await put(path.join(root, 'portal', 'dist', 'index.html'), '<h1>react</h1>');
  await assemble({ root, out });
  assert.equal(await readFile(path.join(out, 'index.html'), 'utf8'), '<h1>react</h1>');
});

test('fails when portal build is missing', async () => {
  const { root, out } = await fixture();
  await assert.rejects(assemble({ root, out }), /npm run build/);
});

test('clears stale output', async () => {
  const { root, portalDir, out } = await fixture();
  await put(path.join(out, 'stale.txt'), 'old');
  await assemble({ root, out, portalDir });
  assert.equal(await exists(path.join(out, 'stale.txt')), false);
});

test('copies sdk/dist to out/sdk', async () => {
  const { root, portalDir, out } = await fixture();
  await assemble({ root, out, portalDir });
  assert.equal(await readFile(path.join(out, 'sdk', 'playnine.js'), 'utf8'), 'window.PlayNine={}');
});

test('fails when sdk build is missing', async () => {
  const { root, portalDir, out } = await fixture();
  await rm(path.join(root, 'sdk'), { recursive: true, force: true });
  await assert.rejects(assemble({ root, out, portalDir }), /sdk/);
});
