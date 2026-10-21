import { describe, expect, it } from 'vitest'
import { GAMES } from '../games/catalog'
import { featuredGames } from './featured'

const day = (iso: string) => new Date(iso)

describe('featuredGames', () => {
  it('trả 5 game khác nhau', () => {
    const list = featuredGames(GAMES, day('2026-10-21T09:00:00'))
    expect(list).toHaveLength(5)
    expect(new Set(list).size).toBe(5)
  })

  it('cố định trong ngày, đổi sang ngày khác', () => {
    const a = featuredGames(GAMES, day('2026-10-21T00:05:00'))
    expect(featuredGames(GAMES, day('2026-10-21T23:55:00'))).toEqual(a)
    expect(featuredGames(GAMES, day('2026-10-22T09:00:00'))[0]).not.toBe(a[0])
  })

  it('danh sách ngắn hơn n: trả hết, không lặp', () => {
    const list = featuredGames(GAMES.slice(0, 3), day('2026-10-21T09:00:00'))
    expect(list).toHaveLength(3)
    expect(new Set(list).size).toBe(3)
  })

  it('danh sách rỗng: trả rỗng', () => {
    expect(featuredGames([], day('2026-10-21T09:00:00'))).toEqual([])
  })
})
