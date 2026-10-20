import { afterEach, describe, expect, it } from 'vitest'
import { markPlayed, recent } from './recent'

afterEach(() => localStorage.clear())

describe('recent', () => {
  it('markPlayed ghi thời điểm', () => {
    markPlayed('2048', 5)
    expect(recent()['2048']).toBe(5)
  })
  it('giá trị lưu không phải object → {}', () => {
    localStorage.setItem('game-portal-recent-v1', '"str"')
    expect(recent()).toEqual({})
    localStorage.removeItem('game-portal-recent-v1')
    expect(recent()).toEqual({})
  })
})