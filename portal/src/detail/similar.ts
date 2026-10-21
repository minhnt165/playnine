import type { GameDef } from '../games/catalog'

const tagsOf = (g: GameDef): string[] => (Array.isArray(g.tags) ? g.tags : g.tags.en)

/**
 * Game gợi ý cho trang giới thiệu: cùng thể loại được 2 điểm, mỗi tag chung (theo bản tiếng Anh) thêm 1 điểm;
 * điểm bằng nhau thì giữ thứ tự danh mục. Bỏ chính game đang xem.
 */
export function similarGames(game: GameDef, list: GameDef[], n = 6): GameDef[] {
  const mine = new Set(tagsOf(game))
  return list
    .filter((g) => g.id !== game.id)
    .map((g, i) => ({ g, i, score: (g.cat === game.cat ? 2 : 0) + tagsOf(g).filter((t) => mine.has(t)).length }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, n)
    .map((x) => x.g)
}
