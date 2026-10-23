// Danh mục game của cổng: đọc từ manifest games/<dir>/game.json, xếp theo games/order.json.
// Thêm game = thêm thư mục có game.json + thêm id vào order.json (xem README, `npm run new-game`).
// `dir`: thư mục của game (tương đối với cổng). Game ghi tóm tắt cho cổng vào localStorage['playnine-<id>-summary-v1'] (xem readSummary).
// `name`, `sub`, `desc`, `tags`, `note`, `daily` có dạng { en, vi }, đọc qua loc().
import order from '../../../games/order.json'
import { parseManifest, type GameManifest } from './manifest'

export { CATS, type Cat } from './cats'

export type GameDef = GameManifest & {
  dir: string
  /** Trả về HTML tĩnh tin cậy (render bằng innerHTML). */
  icon(base: string): string
}

const svgIcon = (base: string) => '<img src="' + base + 'icon.svg" alt="">'

export const toGameDef = (m: GameManifest, dir: string): GameDef => ({ ...m, dir: dir + '/', icon: svgIcon })

/**
 * Dựng danh mục từ các manifest (khóa: đường dẫn .../games/<dir>/game.json) theo thứ tự `order`.
 * Sai (manifest hỏng, trùng id, lệch với order.json) thì ném lỗi nêu tên file để build/test dừng lại.
 */
export function buildCatalog(files: Record<string, unknown>, order: unknown): GameDef[] {
  if (!Array.isArray(order) || !order.every((x) => typeof x === 'string')) throw new Error('games/order.json: cần mảng id')
  const byId = new Map<string, GameDef>()
  for (const [file, raw] of Object.entries(files)) {
    const dir = /games\/([^/]+)\/game\.json$/.exec(file)?.[1]
    if (!dir) throw new Error(file + ': không nằm trong games/<dir>/')
    const name = 'games/' + dir + '/game.json'
    const m = parseManifest(raw, name)
    if (byId.has(m.id)) throw new Error(name + ': id: trùng với games/' + byId.get(m.id)!.dir + 'game.json')
    if (!order.includes(m.id)) throw new Error(name + ': id "' + m.id + '" chưa có trong games/order.json')
    byId.set(m.id, toGameDef(m, dir))
  }
  return order.map((id) => {
    const g = byId.get(id)
    if (!g) throw new Error('games/order.json: ' + id + ' không có games/<dir>/game.json nào')
    return g
  })
}

const files = import.meta.glob<unknown>(['../../../games/*/game.json', '!../../../games/_*/game.json'], { eager: true, import: 'default' })

export const GAMES: GameDef[] = buildCatalog(files, order)

export const gameById = (id: string): GameDef | undefined => GAMES.find((g) => g.id === id)
