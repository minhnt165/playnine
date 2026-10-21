import { GAMES, type GameDef } from '../games/catalog'

export type Route = { name: 'home' } | { name: 'play'; game: GameDef } | { name: 'profile'; userId: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Địa chỉ #/play/<id> hoặc #/u/<uuid>; id lạ thì về trang chủ (khớp như cổng cũ). */
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
  const m = hash.match(/^#\/play\/([\w-]+)/)
  const game = m ? GAMES.find((x) => x.id === m[1]) : undefined
  return game ? { name: 'play', game } : { name: 'home' }
}

export const playHref = (g: GameDef): string => '#/play/' + g.id

/** Địa chỉ trang chính của game (tương đối với cổng). */
export const gameHref = (g: GameDef): string => g.dir + 'index.html'
