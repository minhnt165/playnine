import { describe, expect, it } from 'vitest'
import { gameById } from '../games/catalog'
import { fold, matchesQuery } from './search'

const g = (id: string) => gameById(id)!

describe('search', () => {
  it('fold bỏ dấu, đổi đ thành d và hạ chữ thường', () => {
    expect(fold('  Cờ Đam ')).toBe('co dam')
  })

  it('từ khóa rỗng khớp mọi game', () => {
    expect(matchesQuery(g('2048'), '   ')).toBe(true)
  })

  it('khớp tên tiếng Việt không dấu và tên tiếng Anh', () => {
    expect(matchesQuery(g('coganh'), 'co ganh')).toBe(true)
    expect(matchesQuery(g('minesweeper'), 'MINE')).toBe(true)
  })

  it('chỉ khớp đầu từ, không khớp giữa từ', () => {
    expect(matchesQuery(g('2048'), 'erge')).toBe(false)
    expect(matchesQuery(g('2048'), 'merge')).toBe(true)
  })

  it('mọi từ phải khớp', () => {
    expect(matchesQuery(g('sudoku'), 'sudoku chess')).toBe(false)
  })
})
