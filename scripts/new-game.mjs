// Tạo khung game mới từ games/_template rồi thêm id vào cuối games/order.json.
// Dùng: npm run new-game -- <thư mục> --en "English name" --vi "Tên tiếng Việt" [--cat puzzle|versus|arcade|card|brain]
import { cp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CATS = ['puzzle', 'versus', 'arcade', 'card', 'brain'];
const exists = (p) => stat(p).then(() => true, () => false);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/** Chép _template sang games/<dir>, điền {{id}} {{nameEn}} {{nameVi}} {{cat}} {{date}}, thêm dir vào order.json. */
export async function createGame({ root, dir, nameEn, nameVi, cat = 'puzzle', today }) {
  if (!/^[a-z0-9]{2,24}$/.test(dir)) throw new Error('Sai tên thư mục "' + dir + '": cần 2-24 ký tự a-z, 0-9 (cũng là id game).');
  if (!CATS.includes(cat)) throw new Error('Sai thể loại "' + cat + '": chọn một trong ' + CATS.join(', ') + '.');
  if (!nameEn || !nameEn.trim() || !nameVi || !nameVi.trim()) throw new Error('Cần tên tiếng Anh (--en) và tên tiếng Việt (--vi).');
  const gamesDir = path.join(root, 'games');
  const target = path.join(gamesDir, dir);
  if (await exists(target)) throw new Error('Thư mục games/' + dir + ' đã tồn tại.');

  await cp(path.join(gamesDir, '_template'), target, { recursive: true });
  const values = { id: dir, nameEn: nameEn.trim(), nameVi: nameVi.trim(), cat, date: today };
  for (const file of await walk(target)) {
    const text = await readFile(file, 'utf8');
    const filled = text.replace(/\{\{(id|nameEn|nameVi|cat|date)\}\}/g, (_, k) => values[k]);
    if (filled !== text) await writeFile(file, filled);
  }

  // Ghép text, không parse rồi ghi lại cả file (giữ nguyên thụt lề, xuống dòng).
  const orderFile = path.join(gamesDir, 'order.json');
  const order = await readFile(orderFile, 'utf8');
  const eol = order.includes('\r\n') ? '\r\n' : '\n';
  const end = order.lastIndexOf(']');
  const body = order.slice(0, end).replace(/\s*$/, '');
  await writeFile(orderFile, body + ',' + eol + '  "' + dir + '"' + eol + order.slice(end));
}

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args[0];
  if (!dir || dir.startsWith('--')) {
    console.error('Dùng: npm run new-game -- <thư mục> --en "Name" --vi "Tên" [--cat ' + CATS.join('|') + ']');
    process.exit(1);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const today = new Date().toISOString().slice(0, 10);
  await createGame({ root, dir, nameEn: arg(args, '--en'), nameVi: arg(args, '--vi'), cat: arg(args, '--cat') ?? 'puzzle', today });
  console.log('Đã tạo games/' + dir + '/ và thêm vào games/order.json. Việc tiếp theo: xem games/' + dir + '/README.md.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
