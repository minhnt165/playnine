import { describe, expect, it } from 'vitest'
import { isNewGame, newestIds, parseManifest } from './manifest'

const ok = (): any => ({
  id: 'abc',
  cat: 'puzzle',
  addedAt: '2026-10-23',
  name: { en: 'A', vi: 'Á' },
  sub: { en: 'a', vi: 'á' },
  desc: { en: 'd', vi: 'đ' },
  tags: { en: ['x'], vi: ['y'] },
  server: { metric: 'wins', points: 5, modes: [{ key: 'classic', label: { en: 'C', vi: 'C' } }] },
})

describe('parseManifest', () => {
  it('nhận manifest hợp lệ', () => {
    expect(parseManifest(ok(), 'f')).toMatchObject({ id: 'abc', cat: 'puzzle' })
  })

  it('nhận đủ trường tùy chọn', () => {
    const m = ok()
    m.note = { en: 'n', vi: 'n' }
    m.daily = { en: 'd', vi: 'd' }
    m.keepAlive = true
    m.sdk = true
    m.preview = { bg: 'linear-gradient(#000, #111)' }
    m.e2e = { start: '#btn-start' }
    m.server.modes[0].points = 3
    m.server.modes[0].rules = { min_duration_ms: 3000, max_score_per_sec: 50 }
    expect(parseManifest(m, 'f')).toEqual(m)
  })

  it.each<[string, (m: any) => void, RegExp]>([
    ['id sai dạng', (m) => (m.id = 'A B'), /^f: id/],
    ['thiếu vi', (m) => (m.name = { en: 'A' }), /^f: name\.vi/],
    ['cat lạ', (m) => (m.cat = 'sport'), /^f: cat/],
    ['addedAt sai', (m) => (m.addedAt = '23/10/2026'), /^f: addedAt/],
    ['addedAt không phải ngày thật', (m) => (m.addedAt = '2026-13-40'), /^f: addedAt/],
    ['tags rỗng', (m) => (m.tags.vi = []), /^f: tags\.vi/],
    ['sdk không phải boolean', (m) => (m.sdk = 'yes'), /^f: sdk/],
    ['metric lạ', (m) => (m.server.metric = 'score_low'), /^f: server\.metric/],
    ['không có mode', (m) => (m.server.modes = []), /^f: server\.modes/],
    ['mode trùng key', (m) => m.server.modes.push({ key: 'classic', label: { en: 'C', vi: 'C' } }), /^f: server\.modes\[1\]\.key/],
    ['rule lạ', (m) => (m.server.modes[0].rules = { max_lives: 3 }), /^f: server\.modes\[0\]\.rules\.max_lives/],
    ['rule âm', (m) => (m.server.modes[0].rules = { min_time_ms: -1 }), /^f: server\.modes\[0\]\.rules\.min_time_ms/],
    ['points ngoài khoảng', (m) => (m.server.points = 1001), /^f: server\.points/],
    ['trường lạ', (m) => (m.isNew = true), /^f: isNew/],
  ])('từ chối: %s', (_, mutate, re) => {
    const m = ok()
    mutate(m)
    expect(() => parseManifest(m, 'f')).toThrow(re)
  })

  it('không phải object thì từ chối', () => {
    expect(() => parseManifest(null, 'games/x/game.json')).toThrow(/^games\/x\/game\.json: /)
  })
})

describe('isNewGame', () => {
  it('trong 14 ngày là mới, quá 14 ngày hoặc ở tương lai thì không', () => {
    const now = Date.parse('2026-10-23T12:00:00Z')
    expect(isNewGame({ addedAt: '2026-10-23' }, now)).toBe(true)
    expect(isNewGame({ addedAt: '2026-10-09' }, now)).toBe(true)
    expect(isNewGame({ addedAt: '2026-10-08' }, now)).toBe(false)
    expect(isNewGame({ addedAt: '2026-10-24' }, now)).toBe(false)
  })
})

describe('newestIds', () => {
  const now = Date.parse('2026-10-25T12:00:00Z')
  const list = [
    { id: 'a', addedAt: '2026-10-20' },
    { id: 'b', addedAt: '2026-10-24' },
    { id: 'c', addedAt: '2026-10-24' },
    { id: 'd', addedAt: '2026-10-01' },
    { id: 'e', addedAt: '2026-10-23' },
  ]
  it('chỉ lấy n game mới nhất: ngày thêm sau trước, cùng ngày thì game đứng sau trong danh mục trước', () => {
    expect([...newestIds(list, now, 3)]).toEqual(['c', 'b', 'e'])
  })
  it('bỏ game đã quá NEW_DAYS ngày dù còn chỗ', () => {
    expect([...newestIds(list, now, 10)]).toEqual(['c', 'b', 'e', 'a'])
  })
})
