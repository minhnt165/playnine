import { describe, expect, it } from 'vitest'
import { gameById } from '../games/catalog'
import { lastPlayedId, ribbonFor } from './ribbon'
import { getI18n } from './testUtil'

const t = getI18n().t
const g = (id: string) => gameById(id)!
const none = new Set<string>()

describe('ribbonFor', () => {
  it('game đang mở: ribbon.open', () => {
    expect(ribbonFor(g('co9o'), { openIds: new Set(['co9o']), rec: {}, t })).toEqual([t('ribbon.open'), t('ribbon.openShort')])
  })
  it('game chơi gần nhất: ribbon.last', () => {
    const now = 10 * 60000
    const r = ribbonFor(g('sudoku'), { openIds: none, lastId: 'sudoku', rec: { sudoku: 0 }, t, now })
    expect(r).toEqual([t('ribbon.last', { ago: t('ago.min', { n: 10 }) }), t('ribbon.lastShort')])
  })
  it('game thêm trong 14 ngày, chưa chơi: ribbon.new; đã chơi thì null', () => {
    const now = Date.parse('2026-10-23T09:00:00Z')
    const fresh = { ...g('co9o'), addedAt: '2026-10-20' }
    expect(ribbonFor(fresh, { openIds: none, rec: {}, t, now })).toEqual([t('ribbon.new'), t('ribbon.new')])
    expect(ribbonFor(fresh, { openIds: none, lastId: 'x', rec: { co9o: 1 }, t, now })).toBeNull()
  })
  it('có newIds: game mới nhưng không nằm trong nhóm mới nhất thì không có ribbon.new', () => {
    const now = Date.parse('2026-10-23T09:00:00Z')
    const fresh = { ...g('co9o'), addedAt: '2026-10-20' }
    expect(ribbonFor(fresh, { openIds: none, rec: {}, t, now, newIds: new Set(['sudoku']) })).toBeNull()
    expect(ribbonFor(fresh, { openIds: none, rec: {}, t, now, newIds: new Set(['co9o']) })).toEqual([t('ribbon.new'), t('ribbon.new')])
  })
  it('game thêm quá 14 ngày: không còn ribbon.new', () => {
    const fresh = { ...g('co9o'), addedAt: '2026-10-20' }
    expect(ribbonFor(fresh, { openIds: none, rec: {}, t, now: Date.parse('2026-11-10T09:00:00Z') })).toBeNull()
  })
  it('lastPlayedId chọn mốc lớn nhất', () => {
    expect(lastPlayedId({ a: 1, b: 5, c: 3 })).toBe('b')
    expect(lastPlayedId({})).toBeUndefined()
  })
})