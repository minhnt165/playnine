// Ghép thư mục xuất bản (dist/) cho GitHub Pages từ cổng + các game.
import { cp, rm, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exists = (p) => stat(p).then(() => true, () => false);

export async function assemble({ root, out, portalDir = path.join(root, 'portal', 'dist'), sdkDir = path.join(root, 'sdk', 'dist') }) {
  if (!(await exists(path.join(portalDir, 'index.html')))) {
    throw new Error('Không thấy ' + path.join(portalDir, 'index.html') + ' - hãy chạy npm run build trước khi assemble.');
  }

  if (!(await exists(path.join(sdkDir, 'playnine.js')))) {
    throw new Error('Không thấy ' + path.join(sdkDir, 'playnine.js') + ' - hãy chạy npm run build (build SDK) trước khi assemble.');
  }

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  // Cổng: chép toàn bộ nội dung portalDir vào gốc out/.
  await cp(portalDir, out, { recursive: true });

  // SDK cho game: out/sdk/ (game cũ nạp ../sdk/playnine.js).
  await cp(sdkDir, path.join(out, 'sdk'), { recursive: true });

  // Game: có package.json thì lấy bản build (dist/), ngược lại chép nguyên thư mục.
  const gamesDir = path.join(root, 'games');
  if (await exists(gamesDir)) {
    const entries = await readdir(gamesDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('_')) continue;
      const src = path.join(gamesDir, e.name);
      const built = await exists(path.join(src, 'package.json'));
      await cp(built ? path.join(src, 'dist') : src, path.join(out, e.name), { recursive: true });
    }
  }

  const brand = path.join(root, 'brand');
  if (await exists(brand)) await cp(brand, path.join(out, 'brand'), { recursive: true });

  await writeFile(path.join(out, '.nojekyll'), '');
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const i = args.indexOf('--portal');
  // Mặc định: bản build của cổng React (portal/dist).
  const portalDir = i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : undefined;
  await assemble({ root, out: path.join(root, 'dist'), portalDir });
  console.log('assembled -> dist/');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
