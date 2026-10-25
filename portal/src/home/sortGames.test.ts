import { describe, expect, it } from 'vitest'
import { gameById, type GameDef } from '../games/catalog'
import { sortGames } from './sortGames'

const g = (id: string, over: Partial<GameDef> = {}): GameDef => ({ ...gameById('2048')!, id, ...over })
const list = [
  g('aa', { addedAt: '2026-10-20', name: { en: 'Zebra', vi: 'Ngựa vằn' } }),
  g('bb', { addedAt: '2026-10-23', name: { en: 'apple', vi: 'Táo' } }),
  g('cc', { addedAt: '2026-10-21', name: { en: 'Mango', vi: 'Xoài' } }),
  g('dd', { addedAt: '2026-10-23', name: { en: 'Banana', vi: 'Chuối' } }),
]
const ids = (l: GameDef[]) => l.map((x) => x.id)
const ctx = { totals: {}, ratings: {}, lang: 'en' as const }

describe('sortGames', () => {
  it('order: giữ thứ tự gốc', () => {
    expect(ids(sortGames(list, 'order', ctx))).toEqual(['aa', 'bb', 'cc', 'dd'])
  })
  it('newest: ngày thêm mới trước, cùng ngày thì game đứng sau trong danh mục (thêm sau) trước', () => {
    expect(ids(sortGames(list, 'newest', ctx))).toEqual(['dd', 'bb', 'cc', 'aa'])
  })
  it('plays: lượt chơi nhiều trước, thiếu số liệu tính 0', () => {
    expect(ids(sortGames(list, 'plays', { ...ctx, totals: { cc: 9, aa: 3 } }))).toEqual(['cc', 'aa', 'bb', 'dd'])
  })
  it('rating: điểm trung bình cao trước, bằng nhau thì nhiều lượt đánh giá trước, chưa có đánh giá xếp cuối', () => {
    const ratings = { aa: { average: 4.5, count: 2 }, dd: { average: 4.5, count: 10 }, bb: { average: 3, count: 50 } }
    expect(ids(sortGames(list, 'rating', { ...ctx, ratings }))).toEqual(['dd', 'aa', 'bb', 'cc'])
  })
  it('name: theo tên của ngôn ngữ đang dùng, không phân biệt hoa thường', () => {
    expect(ids(sortGames(list, 'name', ctx))).toEqual(['bb', 'dd', 'cc', 'aa'])
    expect(ids(sortGames(list, 'name', { ...ctx, lang: 'vi' }))).toEqual(['dd', 'aa', 'bb', 'cc'])
  })
  it('không đổi mảng đầu vào', () => {
    sortGames(list, 'name', ctx)
    expect(ids(list)).toEqual(['aa', 'bb', 'cc', 'dd'])
  })
})
