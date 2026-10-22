import { describe, expect, it } from 'vitest'
import { gameById } from '../games/catalog'
import { detailHref, eventHref, gameHref, historyHref, parseRoute, playHref } from './route'

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
  it('#/game/<id> mở trang giới thiệu, id lạ về trang chủ', () => {
    const r = parseRoute('#/game/2048')
    expect(r.name === 'detail' && r.game.id).toBe('2048')
    expect(parseRoute('#/game/khongco')).toEqual({ name: 'home' })
  })
  it('#/u/<uuid> mở hồ sơ, chuỗi không phải uuid về trang chủ', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    expect(parseRoute('#/u/' + id)).toEqual({ name: 'profile', userId: id })
    expect(parseRoute('#/u/abc')).toEqual({ name: 'home' })
  })
  it('#/news là danh sách tin, #/news/<slug> là bài; slug sai về danh sách', () => {
    expect(parseRoute('#/news')).toEqual({ name: 'news' })
    expect(parseRoute('#/news/meo-sudoku')).toEqual({ name: 'post', slug: 'meo-sudoku' })
    expect(parseRoute('#/news/Bad_Slug')).toEqual({ name: 'news' })
  })
  it('#/leaderboards mở trang bảng xếp hạng, đuôi lạ vẫn vào trang đó', () => {
    expect(parseRoute('#/leaderboards')).toEqual({ name: 'leaderboards' })
    expect(parseRoute('#/leaderboards/x')).toEqual({ name: 'leaderboards' })
    expect(parseRoute('#/leaderboardsx')).toEqual({ name: 'home' })
  })
  it('#/history mở lịch sử chơi, đuôi lạ vẫn vào trang đó', () => {
    expect(parseRoute('#/history')).toEqual({ name: 'history' })
    expect(parseRoute('#/history?game=2048')).toEqual({ name: 'history' })
    expect(parseRoute('#/historyx')).toEqual({ name: 'home' })
    expect(parseRoute(historyHref)).toEqual({ name: 'history' })
  })
  it('#/events, #/events/<uuid>, #/events/<lạ>, #/admin', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    expect(parseRoute('#/events')).toEqual({ name: 'events' })
    expect(parseRoute('#/events/' + id)).toEqual({ name: 'event', eventId: id })
    expect(parseRoute('#/events/abc')).toEqual({ name: 'events' })
    expect(parseRoute('#/admin')).toEqual({ name: 'admin' })
    expect(eventHref(id)).toBe('#/events/' + id)
  })
  it('playHref, detailHref và gameHref', () => {
    const g = gameById('2048')!
    expect(playHref(g)).toBe('#/play/2048')
    expect(detailHref(g)).toBe('#/game/2048')
    expect(gameHref(g)).toBe(g.dir + 'index.html')
  })
})
