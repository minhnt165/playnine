import type { I18nApi } from '../i18n/i18n'
import { GAMES } from '../games/catalog'
import type { SudokuData } from '../data/sudoku'
import { SUDOKU_DIFF } from '../data/sudoku'
import type { Summary } from '../data/summary'
import { fmtDuration } from '../lib/time'

export type StatItem = { n?: number; suffix?: string; text?: string; label: string }

export const MAX_STATS = 10

export function buildStats(sd: SudokuData, sums: Record<string, Summary>, i18n: I18nApi): StatItem[] {
  const { t, loc } = i18n
  const items: StatItem[] = []
  const list = GAMES.filter((g) => sums[g.id])
  const played = sd.won + sd.lost + list.reduce((n, g) => n + sums[g.id].played, 0)
  const won = sd.won + list.reduce((n, g) => n + sums[g.id].won, 0)
  if (played) items.push({ n: played, label: t('stats.played') })
  if (won) items.push({ n: won, label: t('stats.won') })
  if (sd.totalDaily) items.push({ n: sd.streak, suffix: ' 🔥', label: t('stats.sudokuStreak') })
  if (sd.best) items.push({ text: fmtDuration(sd.best.time), label: t('stats.sudokuBest', { diff: t(SUDOKU_DIFF[sd.best.key]) }) })
  if (sd.won + sd.lost) items.push({ n: Math.round((sd.won / (sd.won + sd.lost)) * 100), suffix: '%', label: t('stats.sudokuRate') })
  // Mỗi game mới góp tối đa 2 chỉ số, game cập nhật gần nhất đứng trước
  list
    .sort((a, b) => sums[b.id].updatedAt - sums[a.id].updatedAt)
    .forEach((g) => {
      sums[g.id].stats.slice(0, 2).forEach((s) => items.push({ text: String(s.value), label: String(s.label) + ' · ' + String(loc(g.name)) }))
    })
  return items.slice(0, MAX_STATS)
}