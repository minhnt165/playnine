import { describe, expect, it } from 'vitest'
import { DICT } from '../i18n/dict'
import type { Collection, GameEvent } from '../server/types'
import { activeCollections, eventPhase, formatCountdown, groupEvents, liveEventsFor, localized } from './model'

const S = Date.parse('2026-03-01T00:00:00Z')
const E = Date.parse('2026-03-02T00:00:00Z')
const ev = (o: Partial<GameEvent> = {}): GameEvent => ({
  id: 'e', title: { en: 'Cup' }, description: {}, gameId: 'sugoku', mode: 'easy', agg: 'best',
  startsAt: new Date(S).toISOString(), endsAt: new Date(E).toISOString(), awardTop: 3, status: 'scheduled', ...o,
})

describe('eventPhase', () => {
  it('upcoming trước startsAt, live đúng mốc startsAt, ended đúng mốc endsAt', () => {
    expect(eventPhase(ev(), S - 1)).toBe('upcoming')
    expect(eventPhase(ev(), S)).toBe('live')
    expect(eventPhase(ev(), E - 1)).toBe('live')
    expect(eventPhase(ev(), E)).toBe('ended')
  })
  it('cancelled thắng mọi thứ; closed là ended dù chưa tới endsAt', () => {
    expect(eventPhase(ev({ status: 'cancelled' }), S + 1)).toBe('cancelled')
    expect(eventPhase(ev({ status: 'closed' }), S + 1)).toBe('ended')
  })
})

describe('liveEventsFor / groupEvents', () => {
  const now = S + 1000
  const live1 = ev({ id: 'l1', endsAt: new Date(E + 5000).toISOString() })
  const live2 = ev({ id: 'l2', gameId: 'minesweeper', endsAt: new Date(E).toISOString() })
  const up1 = ev({ id: 'u1', startsAt: new Date(now + 9000).toISOString(), endsAt: new Date(E + 9000).toISOString() })
  const up2 = ev({ id: 'u2', startsAt: new Date(now + 5000).toISOString(), endsAt: new Date(E + 9000).toISOString() })
  const end1 = ev({ id: 'x1', startsAt: new Date(S - 9000).toISOString(), endsAt: new Date(S - 2000).toISOString() })
  const end2 = ev({ id: 'x2', startsAt: new Date(S - 9000).toISOString(), endsAt: new Date(S - 1000).toISOString() })
  const gone = ev({ id: 'c', status: 'cancelled' })
  const all = [live1, live2, up1, up2, end1, end2, gone]

  it('liveEventsFor lọc live, theo game nếu có, sắp endsAt tăng dần', () => {
    expect(liveEventsFor(all, null, now).map((e) => e.id)).toEqual(['l2', 'l1'])
    expect(liveEventsFor(all, 'sugoku', now).map((e) => e.id)).toEqual(['l1'])
  })
  it('groupEvents bỏ cancelled và sắp đúng thứ tự', () => {
    const g = groupEvents(all, now)
    expect(g.live.map((e) => e.id)).toEqual(['l2', 'l1'])
    expect(g.upcoming.map((e) => e.id)).toEqual(['u2', 'u1'])
    expect(g.ended.map((e) => e.id)).toEqual(['x2', 'x1'])
  })
})

describe('activeCollections', () => {
  const now = S
  const col = (o: Partial<Collection>): Collection => ({
    id: 'c', title: { en: 'B' }, gameIds: ['a'], startsAt: new Date(now - 1000).toISOString(), endsAt: null, sort: 0, ...o,
  })
  const visible = new Set(['a', 'b'])
  it('bỏ bộ hết hạn, chưa tới giờ, chỉ có game ẩn/lạ; giữ endsAt null', () => {
    const list = [
      col({ id: 'ok' }),
      col({ id: 'expired', endsAt: new Date(now).toISOString() }),
      col({ id: 'future', startsAt: new Date(now + 1).toISOString() }),
      col({ id: 'hidden', gameIds: ['zzz'] }),
      col({ id: 'start', startsAt: new Date(now).toISOString(), endsAt: new Date(now + 1).toISOString() }),
    ]
    expect(activeCollections(list, now, visible).map((c) => c.id)).toEqual(['ok', 'start'])
  })
  it('chỉ giữ game nhìn thấy, sắp theo sort rồi title.en', () => {
    const list = [
      col({ id: 'z', sort: 1, title: { en: 'A' } }),
      col({ id: 'y', sort: 0, title: { en: 'Z' }, gameIds: ['a', 'zzz', 'b'] }),
      col({ id: 'x', sort: 0, title: { en: 'M' } }),
    ]
    const out = activeCollections(list, now, visible)
    expect(out.map((c) => c.id)).toEqual(['x', 'y', 'z'])
    expect(out[1].gameIds).toEqual(['a', 'b'])
  })
})

describe('formatCountdown / localized', () => {
  const t = (k: string, p?: Record<string, string | number>) =>
    (DICT.en[k] as string).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n]))
  it('định dạng hh:mm:ss và ngày', () => {
    expect(formatCountdown(-5, t)).toBe('00:00:00')
    expect(formatCountdown(0, t)).toBe('00:00:00')
    expect(formatCountdown(3_723_000, t)).toBe('01:02:03')
    expect(formatCountdown(90_061_000, t)).toBe('1d 01:01:01')
  })
  it('localized: cắt khoảng trắng, rỗng thì lấy en, không có thì rỗng', () => {
    expect(localized({ en: 'Cup', vi: '  ' }, 'vi')).toBe('Cup')
    expect(localized({ en: 'Cup', vi: ' Giải ' }, 'vi')).toBe('Giải')
    expect(localized({ en: 'Cup' }, 'en')).toBe('Cup')
    expect(localized({}, 'vi')).toBe('')
  })
})
