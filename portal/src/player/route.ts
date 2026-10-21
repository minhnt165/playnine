import { GAMES, type GameDef } from '../games/catalog'

export type Route =
  | { name: 'home' }
  | { name: 'play'; game: GameDef }
  | { name: 'detail'; game: GameDef }
  | { name: 'profile'; userId: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Địa chỉ #/play/<id>, #/game/<id> (trang giới thiệu) hoặc #/u/<uuid>; id lạ thì về trang chủ (khớp như cổng cũ). */
export function parseRoute(hash: string): Route {
  const u = hash.match(/^#\/u\/([^/?#]+)/)
  if (u) {
    let id = ''
    try {
      id = decodeURIComponent(u[1])
    } catch {
      /* chuỗi hỏng: coi như không hợp lệ */
    }
    return UUID.test(id) ? { name: 'profile', userId: id } : { name: 'home' }
  }
  const m = hash.match(/^#\/(play|game)\/([\w-]+)/)
  const game = m ? GAMES.find((x) => x.id === m[2]) : undefined
  if (!m || !game) return { name: 'home' }
  return m[1] === 'play' ? { name: 'play', game } : { name: 'detail', game }
}

export const playHref = (g: GameDef): string => '#/play/' + g.id

/** Trang giới thiệu game: thông tin, nút chơi và bảng xếp hạng. */
export const detailHref = (g: GameDef): string => '#/game/' + g.id

/** Địa chỉ trang chính của game (tương đối với cổng). */
export const gameHref = (g: GameDef): string => g.dir + 'index.html'
