import { describe, expect, it } from 'vitest'
import { formatValue, periodsFor } from './leaderboardModel'

describe('leaderboardModel', () => {
  it('periodsFor: daily chỉ có kỳ day, mode khác có week và all', () => {
    expect(periodsFor('daily')).toEqual(['day'])
    expect(periodsFor('4x4')).toEqual(['week', 'all'])
  })

  it('formatValue time_low: mm:ss, dưới 60s có 1 chữ số thập phân', () => {
    const fmt = (n: number) => String(n)
    expect(formatValue('time_low', 83000, fmt)).toBe('01:23')
    expect(formatValue('time_low', 42300, fmt)).toBe('00:42.3')
    expect(formatValue('time_low', 5200, fmt)).toBe('00:05.2')
    expect(formatValue('time_low', 3723000, fmt)).toBe('1:02:03')
  })

  it('formatValue score_high và wins dùng hàm định dạng số', () => {
    const fmt = (n: number) => `<${n}>`
    expect(formatValue('score_high', 12345, fmt)).toBe('<12345>')
    expect(formatValue('wins', 7, fmt)).toBe('<7>')
  })
})