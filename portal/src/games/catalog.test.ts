import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GAMES, buildCatalog, gameById } from './catalog'

const gamesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../games')
const dirs = fs.readdirSync(gamesDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name)

const manifest = (id: string) => ({
  id, cat: 'puzzle', addedAt: '2026-10-23', name: { en: id, vi: id }, sub: { en: 's', vi: 's' }, desc: { en: 'd', vi: 'd' },
  tags: { en: ['x'], vi: ['x'] }, server: { metric: 'wins', points: 5, modes: [{ key: 'classic', label: { en: 'C', vi: 'C' } }] },
})
const at = (dir: string) => '../../../games/' + dir + '/game.json'

describe('catalog', () => {
  it('mỗi thư mục game có game.json và có mặt trong GAMES; id duy nhất', () => {
    expect(GAMES.map((g) => g.dir.replace(/\/$/, '')).sort()).toEqual([...dirs].sort())
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length)
  })
  it('thứ tự GAMES là order.json', () => {
    expect(GAMES.map((g) => g.id)).toEqual(JSON.parse(fs.readFileSync(path.join(gamesDir, 'order.json'), 'utf8')))
  })
  it('gameById tìm đúng game', () => {
    expect(gameById('sudoku')?.dir).toBe('sugoku/')
    expect(gameById('nope')).toBeUndefined()
  })
  it('icon trả về chuỗi HTML', () => {
    expect(gameById('co9o')?.icon('co9o/')).toBe('<img src="co9o/icon.svg" alt="">')
  })
  it('mỗi thư mục game có icon.svg (icon() của mọi game trỏ tới file này)', () => {
    const missing = dirs.filter((d) => !fs.existsSync(path.join(gamesDir, d, 'icon.svg')))
    expect(missing).toEqual([])
  })
  it('manifest có server với ít nhất một mode', () => {
    for (const g of GAMES) expect(g.server.modes.length, g.id).toBeGreaterThan(0)
  })
})

describe('buildCatalog', () => {
  it('xếp theo order và gắn dir theo thư mục', () => {
    const list = buildCatalog({ [at('bb')]: manifest('bb'), [at('aa')]: manifest('aa') }, ['bb', 'aa'])
    expect(list.map((g) => [g.id, g.dir])).toEqual([['bb', 'bb/'], ['aa', 'aa/']])
  })
  it('hai thư mục cùng id: báo lỗi nêu file', () => {
    expect(() => buildCatalog({ [at('x1')]: manifest('aa'), [at('x2')]: manifest('aa') }, ['aa'])).toThrow(/x2\/game\.json: id: trùng/)
  })
  it('id trong order.json không có manifest: báo lỗi', () => {
    expect(() => buildCatalog({ [at('aa')]: manifest('aa') }, ['aa', 'ghost'])).toThrow(/order\.json: ghost/)
  })
  it('manifest không có trong order.json: báo lỗi', () => {
    expect(() => buildCatalog({ [at('aa')]: manifest('aa'), [at('bb')]: manifest('bb') }, ['aa'])).toThrow(/bb\/game\.json: .*order\.json/)
  })
  it('order.json không phải mảng chuỗi: báo lỗi', () => {
    expect(() => buildCatalog({}, { a: 1 })).toThrow(/order\.json/)
  })
})
