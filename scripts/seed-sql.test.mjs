import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readManifest, seedSql } from './seed-sql.mjs';

const xito = {
  id: 'xito',
  server: {
    metric: 'wins',
    points: 5,
    modes: [{ key: 'classic', label: { en: "Hold'em", vi: 'Xì Tố' }, rules: { min_duration_ms: 5000 }, points: 5 }],
  },
};

test('one manifest: one insert row, single quotes doubled', () => {
  assert.equal(
    seedSql([xito]),
    'insert into public.games (id, metric, modes, points) values\n' +
      `('xito', 'wins', '[{"key":"classic","label":{"en":"Hold''em","vi":"Xì Tố"},"rules":{"min_duration_ms":5000},"points":5}]'::jsonb, 5);\n`,
  );
});

test('two manifests: rows joined by a comma and newline', () => {
  const b = { id: 'bb', server: { metric: 'score_high', points: 3, modes: [{ key: 'x', label: { en: 'X', vi: 'X' } }] } };
  const sql = seedSql([xito, b]);
  assert.match(sql, /5\),\n\('bb', 'score_high', '\[\{"key":"x","label":\{"en":"X","vi":"X"\}\}\]'::jsonb, 3\);\n$/);
});

test('no manifests: throws', () => {
  assert.throws(() => seedSql([]), /ít nhất một game/);
});

test('readManifest finds a game by id or by folder name', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'seed-'));
  await mkdir(path.join(root, 'games', 'sugoku'), { recursive: true });
  await writeFile(path.join(root, 'games', 'sugoku', 'game.json'), JSON.stringify({ id: 'sudoku', server: xito.server }));
  assert.equal((await readManifest(root, 'sudoku')).id, 'sudoku');
  assert.equal((await readManifest(root, 'sugoku')).id, 'sudoku');
  await assert.rejects(readManifest(root, 'nope'), /nope/);
});
