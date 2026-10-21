import { describe, expect, it } from 'vitest'
import { formatCount } from './format'

describe('formatCount', () => {
  it('rút gọn số lượt chơi', () => {
    expect(formatCount(1234, 'en-US')).toBe('1.2K')
    expect(formatCount(999, 'en-US')).toBe('999')
  })
})