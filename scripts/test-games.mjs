// Chạy test engine của mọi game (`node test.js` trong games/<dir>/) và của bộ dùng chung (games/_kit/kit.test.js).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gamesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'games');
const jobs = [];
if (existsSync(path.join(gamesDir, '_kit', 'kit.test.js'))) jobs.push(['_kit', 'kit.test.js']);
for (const e of readdirSync(gamesDir, { withFileTypes: true })) {
  if (e.isDirectory() && e.name !== '_kit' && existsSync(path.join(gamesDir, e.name, 'test.js'))) jobs.push([e.name, 'test.js']);
}

const failed = [];
for (const [dir, file] of jobs) {
  const r = spawnSync(process.execPath, [file], { cwd: path.join(gamesDir, dir), encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').pop();
  console.log((r.status === 0 ? 'ok   ' : 'FAIL ') + dir.padEnd(14) + ' ' + last);
  if (r.status !== 0) {
    failed.push(dir);
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
  }
}
console.log(jobs.length - failed.length + '/' + jobs.length + ' game test files passed');
if (failed.length) process.exit(1);
