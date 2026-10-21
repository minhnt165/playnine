import { afterEach, describe, expect, it } from 'vitest'
import { xiangqiData } from './xiangqi'

afterEach(() => localStorage.clear())

describe('xiangqiData', () => {
  it('hard → hard', () => {
    localStorage.setItem('xiangqi.level', 'hard')
    expect(xiangqiData().level).toBe('hard')
  })
  it('giá trị lạ hoặc không có → null', () => {
    expect(xiangqiData().level).toBeNull()
    localStorage.setItem('xiangqi.level', 'x')
    expect(xiangqiData().level).toBeNull()
  })
})