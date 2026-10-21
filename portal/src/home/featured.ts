import type { GameDef } from '../games/catalog'

const DAY = 86_400_000
// Bước nhảy giữa các game nổi bật: lệch thể loại vì danh mục xếp các game cùng loại gần nhau.
const STRIDE = 7

/** Số ngày theo giờ địa phương (đổi lúc nửa đêm của người chơi, không phải UTC). */
export const localDay = (now: Date): number => Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / DAY)

/** Tối đa `n` game nổi bật của hôm nay: cố định trong ngày, đổi vòng mỗi ngày, không trùng. */
export function featuredGames(list: GameDef[], now: Date, n = 5): GameDef[] {
  const len = list.length
  const out: GameDef[] = []
  const start = ((localDay(now) % len) + len) % len
  for (let i = 0; out.length < Math.min(n, len) && i < len * STRIDE; i++) {
    const g = list[(start + i * STRIDE) % len]
    if (!out.includes(g)) out.push(g)
  }
  return out
}
