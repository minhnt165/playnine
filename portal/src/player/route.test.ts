import { describe, expect, it } from 'vitest'
import { gameById } from '../games/catalog'
import { gameHref, parseRoute, playHref } from './route'

describe('route', () => {
  it('hash rỗng là trang chủ', () => {
    expect(parseRoute('')).toEqual({ name: 'home' })
  })
  it('#/play/<id> mở đúng game', () => {
    const r = parseRoute('#/play/2048')
    expect(r.name === 'play' && r.game.id).toBe('2048')
  })
  it('id lạ về trang chủ', () => {
    expect(parseRoute('#/play/khongco')).toEqual({ name: 'home' })
  })
  it('phần đuôi sau id bị bỏ qua như cổng cũ', () => {
    const r = parseRoute('#/play/2048?x')
    expect(r.name === 'play' && r.game.id).toBe('2048')
  })
  it('playHref và gameHref', () => {
    const g = gameById('2048')!
    expect(playHref(g)).toBe('#/play/2048')
    expect(gameHref(g)).toBe(g.dir + 'index.html')
  })
})
