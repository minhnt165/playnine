import { describe, expect, it } from 'vitest'
import { dateKeyOf, fmtAgo, fmtDuration, greetingKey, pad2 } from './time'

const calls: Array<[string, Record<string, string | number> | undefined]> = []
const t = (key: string, params?: Record<string, string | number>) => {
  calls.push([key, params])
  return key
}
const NOW = 1_700_000_000_000

describe('time', () => {
  it('pad2 and dateKeyOf', () => {
    expect(pad2(5)).toBe('05')
    expect(dateKeyOf(new Date(2026, 0, 9))).toBe('2026-01-09')
  })

  it('fmtDuration', () => {
    expect(fmtDuration(59)).toBe('00:59')
    expect(fmtDuration(3725)).toBe('1:02:05')
    expect(fmtDuration(-3)).toBe('00:00')
  })

  it('fmtAgo picks the right key and count', () => {
    calls.length = 0
    expect(fmtAgo(NOW - 30_000, t, NOW)).toBe('ago.now')
    fmtAgo(NOW - 5 * 60_000, t, NOW)
    expect(calls.at(-1)).toEqual(['ago.min', { n: 5 }])
    fmtAgo(NOW - 3 * 3600_000, t, NOW)
    expect(calls.at(-1)).toEqual(['ago.hour', { n: 3 }])
    expect(fmtAgo(NOW - 25 * 3600_000, t, NOW)).toBe('ago.yesterday')
    fmtAgo(NOW - 3 * 86400_000, t, NOW)
    expect(calls.at(-1)).toEqual(['ago.day', { n: 3 }])
  })

  it('greetingKey by hour', () => {
    const at = (h: number) => greetingKey(new Date(2026, 0, 1, h))
    expect(at(4)).toBe('greet.late')
    expect(at(10)).toBe('greet.morning')
    expect(at(12)).toBe('greet.noon')
    expect(at(17)).toBe('greet.afternoon')
    expect(at(20)).toBe('greet.evening')
  })
})