import { describe, expect, it } from 'vitest'
import { GAMES } from '../games/catalog'
import { buildStats } from './stats'
import { emptySd, getI18n, sum } from './testUtil'

const i18n = getI18n()

describe('buildStats', () => {
  it('không dữ liệu → []', () => {
    expect(buildStats(emptySd(), {}, i18n)).toEqual([])
  })

  it('cộng played/won của Sudoku và summary', () => {
    const sd = { ...emptySd(), won: 2, lost: 1 }
    const items = buildStats(sd, { co9o: sum({ played: 3, won: 1 }) }, i18n)
    expect(items[0]).toMatchObject({ n: 6, label: i18n.t('stats.played') })
    expect(items[1]).toMatchObject({ n: 3, label: i18n.t('stats.won') })
    expect(items[2]).toMatchObject({ n: 67, suffix: '%' })
  })

  it('mỗi game góp tối đa 2 chỉ số, game cập nhật gần nhất trước', () => {
    const st = (n: number) => Array.from({ length: n }, (_, i) => ({ value: i + 1, label: 'L' + (i + 1) }))
    const sums = { co9o: sum({ updatedAt: 1, stats: st(3) }), covua: sum({ updatedAt: 2, stats: st(1) }) }
    const items = buildStats(emptySd(), sums, i18n)
    expect(items.map((x) => x.label)).toEqual(['L1 · Chess', 'L1 · Ultimate Tic-Tac-Toe', 'L2 · Ultimate Tic-Tac-Toe'])
    expect(items[0].text).toBe('1')
  })

  it('cắt ở 10', () => {
    const sums: Record<string, ReturnType<typeof sum>> = {}
    GAMES.forEach((g, i) => {
      sums[g.id] = sum({ updatedAt: i, stats: [{ value: 1, label: 'a' }, { value: 2, label: 'b' }] })
    })
    expect(buildStats(emptySd(), sums, i18n)).toHaveLength(10)
  })
})