import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseManifest, type GameManifest } from '../../portal/src/games/manifest'

const gamesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'games')

/** Manifest của mọi game (games/<dir>/game.json, bỏ thư mục bắt đầu bằng _). */
export function readManifests(): { dir: string; m: GameManifest }[] {
  return readdirSync(gamesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => {
      const file = 'games/' + e.name + '/game.json'
      return { dir: e.name, m: parseManifest(JSON.parse(readFileSync(join(gamesDir, e.name, 'game.json'), 'utf8')), file) }
    })
}
