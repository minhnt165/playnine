import { describe, expect, it } from 'vitest'
import { switchList, SWITCH_MAX } from './switchList'

const all = Array.from({ length: 20 }, (_, i) => ({ id: 'g' + i }))
const ids = (list: { id: string }[]) => list.map((g) => g.id)

describe('switchList', () => {
  it('tối đa SWITCH_MAX game dù danh mục có cả trăm game', () => {
    expect(switchList(all, null, {}, [])).toHaveLength(SWITCH_MAX)
  })

  it('game đang chơi, rồi game chơi gần đây (mới trước), rồi game yêu thích, rồi lấp theo danh mục', () => {
    const rec = { g5: 300, g9: 100, g7: 200 }
    expect(ids(switchList(all, 'g12', rec, ['g3', 'g9']))).toEqual(['g12', 'g5', 'g7', 'g9', 'g3', 'g0', 'g1', 'g2'])
  })

  it('không trùng: game đang chơi cũng là game gần nhất thì chỉ xuất hiện một lần', () => {
    const list = ids(switchList(all, 'g5', { g5: 9, g2: 1 }, ['g5']))
    expect(list.slice(0, 2)).toEqual(['g5', 'g2'])
    expect(new Set(list).size).toBe(list.length)
  })

  it('bỏ id không có trong danh mục (game đã gỡ hoặc bị ẩn)', () => {
    expect(ids(switchList(all, null, { gone: 5 }, ['nope'])).includes('gone')).toBe(false)
  })
})
