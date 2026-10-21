import { describe, expect, it } from 'vitest'
import type { CollectionInput, EventInput, GameMeta } from '../server/types'
import {
  editableFields,
  fromLocalInput,
  rulesFromForm,
  toLocalInput,
  validateCollection,
  validateEvent,
} from './forms'

const blank = { min_duration_ms: '', max_score: '', max_score_per_sec: '', min_time_ms: '' }

describe('rulesFromForm', () => {
  it('bỏ qua ô trống, mode không có luật thành {}', () => {
    const r = rulesFromForm({
      '4x4': { ...blank, min_duration_ms: '1000', max_score: ' 500 ' },
      '3x3': { ...blank },
    })
    expect(r).toEqual({ ok: true, rules: { '4x4': { min_duration_ms: 1000, max_score: 500 }, '3x3': {} } })
  })

  it("'-1' và 'abc' không hợp lệ, trả mode và ô sai", () => {
    expect(rulesFromForm({ a: { ...blank }, b: { ...blank, max_score: '-1' } })).toEqual({
      ok: false,
      mode: 'b',
      field: 'max_score',
    })
    expect(rulesFromForm({ a: { ...blank, min_time_ms: 'abc' } })).toEqual({
      ok: false,
      mode: 'a',
      field: 'min_time_ms',
    })
  })

  it("'1.5' chỉ hợp lệ ở max_score_per_sec", () => {
    expect(rulesFromForm({ a: { ...blank, max_score_per_sec: '1.5' } })).toEqual({
      ok: true,
      rules: { a: { max_score_per_sec: 1.5 } },
    })
    expect(rulesFromForm({ a: { ...blank, max_score: '1.5' } })).toEqual({ ok: false, mode: 'a', field: 'max_score' })
  })

  it("max_score_per_sec nhận '.5' và '0.5', không nhận '1.' hoặc '.'", () => {
    for (const v of ['.5', '0.5']) {
      expect(rulesFromForm({ a: { ...blank, max_score_per_sec: v } })).toEqual({
        ok: true,
        rules: { a: { max_score_per_sec: 0.5 } },
      })
    }
    for (const v of ['1.', '.', '1e']) {
      expect(rulesFromForm({ a: { ...blank, max_score_per_sec: v } }).ok).toBe(false)
    }
  })

  it('số 0 là hợp lệ', () => {
    expect(rulesFromForm({ a: { ...blank, min_time_ms: '0' } })).toEqual({ ok: true, rules: { a: { min_time_ms: 0 } } })
  })
})

describe('toLocalInput / fromLocalInput', () => {
  it('khứ hồi giữ nguyên thời điểm (làm tròn phút)', () => {
    const iso = '2026-10-21T09:30:00.000Z'
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
    const v = toLocalInput('2026-10-21T09:30:45.000Z')
    expect(v).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(fromLocalInput(v)).toBe('2026-10-21T09:30:00.000Z')
  })

  it('toLocalInput theo giờ máy', () => {
    const d = new Date(2026, 9, 21, 7, 5)
    expect(toLocalInput(d.toISOString())).toBe('2026-10-21T07:05')
  })

  it('chuỗi hỏng hoặc rỗng thì null', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('abc')).toBeNull()
    expect(fromLocalInput('2026-02-31T10:00')).toBeNull()
  })
})

const GAMES: Record<string, GameMeta> = {
  '2048': { id: '2048', metric: 'score_high', hidden: false, modes: [{ key: '4x4', label: { en: '4x4', vi: '4x4' } }] },
  sugoku: { id: 'sugoku', metric: 'time_low', hidden: false, modes: [{ key: 'easy', label: { en: 'Easy', vi: 'Dễ' } }] },
}

const goodEvent = (over: Partial<EventInput> = {}): EventInput => ({
  title: { en: 'Cup', vi: '' },
  description: {},
  gameId: '2048',
  mode: '4x4',
  agg: 'sum',
  startsAt: '2026-10-21T09:00:00.000Z',
  endsAt: '2026-10-21T12:00:00.000Z',
  awardTop: 3,
  ...over,
})

describe('validateEvent', () => {
  it('input hợp lệ thì không có trường sai', () => {
    expect(validateEvent(goodEvent(), GAMES)).toEqual([])
    expect(validateEvent(goodEvent({ awardTop: 0 }), GAMES)).toEqual([])
    expect(validateEvent(goodEvent({ awardTop: 100 }), GAMES)).toEqual([])
  })

  it('trả đúng trường cho từng lỗi', () => {
    expect(validateEvent(goodEvent({ title: { en: '  ' } }), GAMES)).toEqual(['title'])
    expect(validateEvent(goodEvent({ gameId: 'nope' }), GAMES)).toEqual(['gameId'])
    expect(validateEvent(goodEvent({ mode: 'huge' }), GAMES)).toEqual(['mode'])
    expect(validateEvent(goodEvent({ gameId: 'sugoku', mode: 'easy', agg: 'sum' }), GAMES)).toEqual(['agg'])
    expect(validateEvent(goodEvent({ endsAt: '2026-10-21T09:00:00.000Z' }), GAMES)).toEqual(['endsAt'])
    expect(validateEvent(goodEvent({ endsAt: '2026-10-21T08:00:00.000Z' }), GAMES)).toEqual(['endsAt'])
    expect(validateEvent(goodEvent({ awardTop: 101 }), GAMES)).toEqual(['awardTop'])
    expect(validateEvent(goodEvent({ awardTop: -1 }), GAMES)).toEqual(['awardTop'])
    expect(validateEvent(goodEvent({ awardTop: 1.5 }), GAMES)).toEqual(['awardTop'])
    expect(validateEvent(goodEvent({ awardTop: NaN }), GAMES)).toEqual(['awardTop'])
  })

  it('gom nhiều lỗi cùng lúc', () => {
    const bad = goodEvent({ title: { en: '' }, awardTop: 200 })
    expect(validateEvent(bad, GAMES)).toEqual(['title', 'awardTop'])
  })
})

describe('validateCollection', () => {
  const good = (over: Partial<CollectionInput> = {}): CollectionInput => ({
    title: { en: 'Summer' },
    gameIds: ['2048'],
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: null,
    sort: 0,
    ...over,
  })

  it('hợp lệ thì rỗng; kết thúc trống là không hạn', () => {
    expect(validateCollection(good())).toEqual([])
    expect(validateCollection(good({ endsAt: '2026-11-01T00:00:00.000Z' }))).toEqual([])
  })

  it('trả đúng trường sai', () => {
    expect(validateCollection(good({ title: { en: '' } }))).toEqual(['title'])
    expect(validateCollection(good({ gameIds: [] }))).toEqual(['gameIds'])
    expect(validateCollection(good({ endsAt: '2026-10-01T00:00:00.000Z' }))).toEqual(['endsAt'])
  })
})

describe('editableFields', () => {
  it('khớp quy tắc theo giai đoạn của admin_save_event', () => {
    expect([...editableFields('upcoming')].sort()).toEqual(
      ['agg', 'awardTop', 'description', 'endsAt', 'gameId', 'mode', 'startsAt', 'title'],
    )
    expect([...editableFields('live')].sort()).toEqual(['awardTop', 'description', 'endsAt', 'title'])
    expect([...editableFields('ended')].sort()).toEqual(['description', 'title'])
    expect([...editableFields('cancelled')].sort()).toEqual(['description', 'title'])
  })
})
