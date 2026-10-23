import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type GameInfo = { dir: string; id: string; sdk: boolean; modes: string[]; start?: string };

// Đọc thẳng games/<dir>/game.json (không import cổng) để sinh test cho mọi game; bỏ thư mục bắt đầu bằng _.
const gamesDir = path.resolve('games');

export function manifests(): GameInfo[] {
  return readdirSync(gamesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => {
      const m = JSON.parse(readFileSync(path.join(gamesDir, e.name, 'game.json'), 'utf8'));
      return { dir: e.name, id: m.id, sdk: m.sdk !== false, modes: m.server.modes.map((x: { key: string }) => x.key), start: m.e2e?.start };
    });
}
