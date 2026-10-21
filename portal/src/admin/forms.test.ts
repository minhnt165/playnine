import { describe, expect, it } from 'vitest'
import { fromLocalInput, rulesFromForm, toLocalInput } from './forms'

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
