import { afterEach, describe, expect, it } from 'vitest'
import { readSummary, summaries } from './summary'

afterEach(() => localStorage.clear())
const put = (id: string, v: unknown) => localStorage.setItem(`playnine-${id}-summary-v1`, typeof v === 'string' ? v : JSON.stringify(v))

describe('readSummary', () => {
  it('JSON hỏng hoặc v khác 1 → null', () => {
    put('2048', '{bad')
    expect(readSummary('2048')).toBeNull()
    put('2048', { v: 2 })
    expect(readSummary('2048')).toBeNull()
    expect(readSummary('caro')).toBeNull()
  })
  it('lọc stats thiếu value/label, resume thiếu title → null, ép số', () => {
    put('2048', {
      v: 1, played: '3', won: 1, updatedAt: 9, note: 'hi',
      stats: [{ value: 1, label: 'a' }, { label: 'x' }, { value: 2 }, null],
      resume: { detail: 'd' },
    })
    const s = readSummary('2048')!
    expect(s.played).toBe(3)
    expect(s.note).toBe('hi')
    expect(s.stats).toEqual([{ value: 1, label: 'a' }])
    expect(s.resume).toBeNull()
    expect(s.daily).toBeNull()
  })
  it('summaries chỉ gồm game có dữ liệu', () => {
    put('caro', { v: 1, resume: { title: 'T' }, daily: { date: '2026-01-01' } })
    const all = summaries()
    expect(Object.keys(all)).toEqual(['caro'])
    expect(all.caro.resume?.title).toBe('T')
  })
})