// In câu SQL thêm game vào bảng public.games từ phần `server` trong games/<dir>/game.json.
// Dùng: npm run -s seed-sql -- <id hoặc thư mục>... > supabase/migrations/<ts>_<tên>.sql (rồi áp qua SQL Editor).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const quote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** Thứ tự khóa của một mode: key, label, rules, points (bỏ khóa không có). */
const modeJson = (m) => {
  const out = { key: m.key, label: { en: m.label.en, vi: m.label.vi } };
  if (m.rules) out.rules = m.rules;
  if (m.points !== undefined) out.points = m.points;
  return out;
};

/** Một câu insert cho mọi manifest truyền vào. */
export function seedSql(manifests) {
  if (!manifests.length) throw new Error('Cần ít nhất một game.');
  const rows = manifests.map(
    (m) => '(' + [quote(m.id), quote(m.server.metric), quote(JSON.stringify(m.server.modes.map(modeJson))) + '::jsonb', m.server.points].join(', ') + ')',
  );
  return 'insert into public.games (id, metric, modes, points) values\n' + rows.join(',\n') + ';\n';
}

/** Tìm manifest theo id game hoặc tên thư mục trong root/games. */
export async function readManifest(root, idOrDir) {
  const gamesDir = path.join(root, 'games');
  const dirs = (await readdir(gamesDir, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.name.startsWith('_'));
  for (const d of dirs) {
    let m;
    try {
      m = JSON.parse(await readFile(path.join(gamesDir, d.name, 'game.json'), 'utf8'));
    } catch {
      continue;
    }
    if (m.id === idOrDir || d.name === idOrDir) return m;
  }
  throw new Error('Không thấy game ' + idOrDir + ' trong games/*/game.json');
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) {
    console.error('Dùng: npm run -s seed-sql -- <id>... > supabase/migrations/<ts>_<tên>.sql');
    process.exit(1);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifests = await Promise.all(ids.map((id) => readManifest(root, id)));
  process.stdout.write('-- Sinh bởi `npm run seed-sql -- ' + ids.join(' ') + '` từ games/*/game.json.\n' + seedSql(manifests));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
