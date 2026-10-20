import { GAMES, type GameDef } from '../games/catalog'

export type Route = { name: 'home' } | { name: 'play'; game: GameDef }

/** Địa chỉ #/play/<id>; id lạ thì về trang chủ (khớp như cổng cũ). */
export function parseRoute(hash: string): Route {
  const m = hash.match(/^#\/play\/([\w-]+)/)
  const game = m ? GAMES.find((x) => x.id === m[1]) : undefined
  return game ? { name: 'play', game } : { name: 'home' }
}

export const playHref = (g: GameDef): string => '#/play/' + g.id

/** Địa chỉ trang chính của game (tương đối với cổng). */
export const gameHref = (g: GameDef): string => g.dir + 'index.html'
