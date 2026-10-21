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
  it('#/u/<uuid> mở hồ sơ, chuỗi không phải uuid về trang chủ', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    expect(parseRoute('#/u/' + id)).toEqual({ name: 'profile', userId: id })
    expect(parseRoute('#/u/abc')).toEqual({ name: 'home' })
  })
  it('playHref và gameHref', () => {
    const g = gameById('2048')!
    expect(playHref(g)).toBe('#/play/2048')
    expect(gameHref(g)).toBe(g.dir + 'index.html')
  })
})
