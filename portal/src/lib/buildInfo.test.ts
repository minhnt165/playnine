import { describe, expect, it } from 'vitest'
import { BUILD_INFO, buildLabel, commitUrl } from './buildInfo'

describe('buildInfo', () => {
  it('lấy phiên bản, commit và thời điểm build từ lúc build', () => {
    expect(BUILD_INFO.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(BUILD_INFO.commit).toMatch(/^([0-9a-f]{7}|dev)$/)
    expect(Number.isNaN(Date.parse(BUILD_INFO.time))).toBe(false)
  })

  it('ghép nhãn "v<version> · <commit> · <thời điểm>"', () => {
    const info = { version: '1.0.0', commit: 'abc1234', time: '2026-10-21T03:30:00.000Z' }
    const fmt = (d: Date) => d.toISOString().slice(0, 16)
    expect(buildLabel(info, fmt)).toBe('v1.0.0 · abc1234 · 2026-10-21T03:30')
  })

  it('trỏ commit về GitHub, bản dev thì không có liên kết', () => {
    expect(commitUrl('abc1234')).toBe('https://github.com/minhnt165/playnine/commit/abc1234')
    expect(commitUrl('dev')).toBeNull()
  })
})
