import { GAMES } from '../games/catalog'
import { readJSON } from '../lib/storage'

export type Summary = {
  updatedAt: number
  played: number
  won: number
  note: string
  stats: { value: string | number; label: string }[]
  resume: { title: string; detail?: string; pct?: number } | null
  daily: { date: string; done?: boolean; title?: string; streak?: number } | null
}

/** Tóm tắt game mới tự ghi cho cổng: { updatedAt, played, won, note, stats[], resume, daily }. */
export function readSummary(id: string): Summary | null {
  const s = readJSON<any>('playnine-' + id + '-summary-v1')
  if (!s || typeof s !== 'object' || s.v !== 1) return null
  return {
    updatedAt: Number(s.updatedAt) || 0,
    played: Number(s.played) || 0,
    won: Number(s.won) || 0,
    note: typeof s.note === 'string' ? s.note : '',
    stats: Array.isArray(s.stats) ? s.stats.filter((x: any) => x && x.value != null && x.label) : [],
    resume: s.resume && s.resume.title ? s.resume : null,
    daily: s.daily && s.daily.date ? s.daily : null,
  }
}

export function summaries(): Record<string, Summary> {
  const out: Record<string, Summary> = {}
  GAMES.forEach((g) => {
    const s = readSummary(g.id)
    if (s) out[g.id] = s
  })
  return out
}