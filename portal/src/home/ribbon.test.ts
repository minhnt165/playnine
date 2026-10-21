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
  it('isNew chưa chơi: ribbon.new; đã chơi thì null', () => {
    expect(ribbonFor(g('co9o'), { openIds: none, rec: {}, t })).toEqual([t('ribbon.new'), t('ribbon.new')])
    expect(ribbonFor(g('co9o'), { openIds: none, lastId: 'x', rec: { co9o: 1 }, t })).toBeNull()
  })
  it('còn lại null', () => {
    expect(ribbonFor(g('sudoku'), { openIds: none, rec: {}, t })).toBeNull()
  })
  it('lastPlayedId chọn mốc lớn nhất', () => {
    expect(lastPlayedId({ a: 1, b: 5, c: 3 })).toBe('b')
    expect(lastPlayedId({})).toBeUndefined()
  })
})