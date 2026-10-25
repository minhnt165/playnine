import type { GameDef } from '../games/catalog'
import type { Lang } from '../i18n/types'
import type { RatingSummary } from '../server/types'

export type SortKey = 'order' | 'newest' | 'plays' | 'rating' | 'name'
export const SORT_KEYS: SortKey[] = ['order', 'newest', 'plays', 'rating', 'name']

type Ctx = { totals: Record<string, number>; ratings: Record<string, RatingSummary>; lang: Lang }

/** Sắp xếp danh sách game (trả mảng mới); bằng nhau thì giữ thứ tự gốc của danh mục. */
export function sortGames(list: GameDef[], key: SortKey, { totals, ratings, lang }: Ctx): GameDef[] {
  const name = (g: GameDef) => g.name[lang] ?? g.name.en
  const collator = new Intl.Collator(lang === 'vi' ? 'vi-VN' : 'en-US', { sensitivity: 'base' })
  const pos = new Map(list.map((g, i) => [g.id, i]))
  const by: Record<SortKey, (a: GameDef, b: GameDef) => number> = {
    order: () => 0,
    // Cả chục game thêm cùng ngày: game đứng sau trong danh mục là game thêm sau.
    newest: (a, b) => b.addedAt.localeCompare(a.addedAt) || pos.get(b.id)! - pos.get(a.id)!,
    plays: (a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0),
    rating: (a, b) => {
      const ra = ratings[a.id]
      const rb = ratings[b.id]
      if (!ra || !rb) return ra ? -1 : rb ? 1 : 0
      return rb.average - ra.average || rb.count - ra.count
    },
    name: (a, b) => collator.compare(name(a), name(b)),
  }
  return [...list].sort(by[key])
}
