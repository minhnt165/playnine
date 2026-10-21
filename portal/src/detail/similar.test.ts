import { describe, expect, it } from 'vitest'
import { GAMES, gameById } from '../games/catalog'
import { similarGames } from './similar'

describe('similarGames', () => {
  it('không có chính game đang xem, tối đa n game, không trùng', () => {
    const list = similarGames(gameById('covua')!, GAMES, 6)
    expect(list).toHaveLength(6)
    expect(list.map((g) => g.id)).not.toContain('covua')
    expect(new Set(list).size).toBe(6)
  })

  it('game cùng thể loại đứng trước game khác thể loại', () => {
    const chess = gameById('covua')!
    const list = similarGames(chess, GAMES, 3)
    expect(list.every((g) => g.cat === chess.cat)).toBe(true)
  })

  it('danh sách chỉ có chính game đó: trả rỗng', () => {
    const g = gameById('2048')!
    expect(similarGames(g, [g])).toEqual([])
  })
})
