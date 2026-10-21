import { describe, expect, it } from 'vitest'
import { formatValue, unitLabel } from './leaderboardModel'

describe('leaderboardModel', () => {
  it('unitLabel: chọn số ít/nhiều theo n, hiện số đã định dạng', () => {
    const t = (_k: string, p?: Record<string, string | number>) => (p?.n === 1 ? '1 pt' : `${p?.n} pts`)
    expect(unitLabel(t, 'lbs.unit.points', 1, String)).toBe('1 pt')
    expect(unitLabel(t, 'lbs.unit.points', 1234, (n) => n.toLocaleString('en-US'))).toBe('1,234 pts')
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