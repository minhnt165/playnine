import type { GameDef } from '../games/catalog'
import type { Localized } from '../i18n/types'

/** Chữ thường, bỏ dấu tiếng Việt (kể cả đ) để gõ "co ganh" vẫn ra "Cờ Gánh". */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase().trim()

const both = <T,>(v: Localized<T>): T[] =>
  v !== null && typeof v === 'object' && 'en' in v ? [v.en, ...(v.vi !== undefined ? [v.vi] : [])] : [v as T]

/**
 * Game khớp khi mọi từ gõ vào là đầu của một từ trong tên, dòng phụ hoặc thẻ (cả hai ngôn ngữ),
 * để "co" ra Cờ Gánh mà không ra mọi game có chữ "computer" ở giữa. Từ khóa rỗng thì khớp hết.
 */
export function matchesQuery(g: GameDef, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = fold([...both(g.name), ...both(g.sub), ...both(g.tags).flat()].join(' ')).split(/[^\p{L}\p{N}]+/u)
  return words.every((w) => hay.some((h) => h.startsWith(w)))
}
