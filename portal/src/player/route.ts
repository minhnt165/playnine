import { GAMES, type GameDef } from '../games/catalog'

export type Route =
  | { name: 'home' }
  | { name: 'play'; game: GameDef }
  | { name: 'detail'; game: GameDef }
  | { name: 'profile'; userId: string }
  | { name: 'events' }
  | { name: 'event'; eventId: string }
  | { name: 'admin' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Địa chỉ #/play/<id>, #/game/<id> (trang giới thiệu), #/u/<uuid>, #/events, #/events/<uuid> hoặc #/admin; id lạ thì về trang chủ (khớp như cổng cũ). */
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
  const ev = hash.match(/^#\/events(?:\/([^/?#]+))?(?:[/?#]|$)/)
  if (ev) {
    let id = ''
    try {
      id = decodeURIComponent(ev[1] ?? '')
    } catch {
      /* chuỗi hỏng: về danh sách sự kiện */
    }
    return UUID.test(id) ? { name: 'event', eventId: id } : { name: 'events' }
  }
  if (/^#\/admin(?:[/?#]|$)/.test(hash)) return { name: 'admin' }
  const m = hash.match(/^#\/(play|game)\/([\w-]+)/)
  const game = m ? GAMES.find((x) => x.id === m[2]) : undefined
  if (!m || !game) return { name: 'home' }
  return m[1] === 'play' ? { name: 'play', game } : { name: 'detail', game }
}

export const eventHref = (id: string): string => '#/events/' + id

export const playHref = (g: GameDef): string => '#/play/' + g.id

/** Trang giới thiệu game: thông tin, nút chơi và bảng xếp hạng. */
export const detailHref = (g: GameDef): string => '#/game/' + g.id

/** Địa chỉ trang chính của game (tương đối với cổng). */
export const gameHref = (g: GameDef): string => g.dir + 'index.html'
