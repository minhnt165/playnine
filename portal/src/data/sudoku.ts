import type { TFn } from '../i18n/types'
import { dateKeyOf } from '../lib/time'
import { readJSON } from '../lib/storage'

// Khóa và định dạng lấy theo sugoku/app.js.
export const SUDOKU_DIFF: Record<string, string> = { easy: 'sudoku.easy', medium: 'sudoku.medium', hard: 'sudoku.hard', expert: 'sudoku.expert', extreme: 'sudoku.extreme' } // khóa DICT
export const SUDOKU_DIFF_ORDER = ['easy', 'medium', 'hard', 'expert', 'extreme']
export const SUDOKU_DAILY_BY_WEEKDAY = ['extreme', 'easy', 'medium', 'medium', 'hard', 'hard', 'expert']

export type SudokuData = {
  won: number
  lost: number
  best: { key: string; time: number } | null
  streak: number
  current: { label: string; pct: number; seconds: number; mistakes: number } | null
  totalDaily: number
  today: { diff: string; time: number | null }
}

export function sudokuData(t: TFn, now: Date = new Date()): SudokuData {
  const stats = readJSON<any>('sudoku-vn-stats-v1') || {}
  const byDiff = stats.byDifficulty && typeof stats.byDifficulty === 'object' ? stats.byDifficulty : {}
  const completed = stats.daily && stats.daily.completed && typeof stats.daily.completed === 'object' ? stats.daily.completed : {}
  const dailyTime = (key: string): number | null => (typeof completed[key] === 'number' ? completed[key] : null)

  const d = new Date(now)
  if (dailyTime(dateKeyOf(d)) === null) d.setDate(d.getDate() - 1)
  let streak = 0
  while (dailyTime(dateKeyOf(d)) !== null) {
    streak++
    d.setDate(d.getDate() - 1)
  }

  let won = 0
  let lost = 0
  let best: SudokuData['best'] = null
  for (const key of SUDOKU_DIFF_ORDER) {
    const s = byDiff[key]
    if (!s) continue
    won += s.won || 0
    lost += s.lost || 0
    if (typeof s.bestTime === 'number' && (!best || SUDOKU_DIFF_ORDER.indexOf(key) >= SUDOKU_DIFF_ORDER.indexOf(best.key))) {
      best = { key, time: s.bestTime } // kỷ lục ở độ khó cao nhất đã thắng
    }
  }

  let current: SudokuData['current'] = null
  const save = readJSON<any>('sudoku-vn-save-v1')
  if (
    save && save.version === 1 && Array.isArray(save.puzzle) && Array.isArray(save.board) && Array.isArray(save.solution) &&
    (save.status === 'playing' || save.status === 'paused')
  ) {
    let empty = 0
    let right = 0
    for (let i = 0; i < 81; i++) {
      if (save.puzzle[i] !== 0) continue
      empty++
      if (save.board[i] === save.solution[i]) right++
    }
    current = {
      label: typeof save.daily === 'string' ? t('today.dailyLabel') : SUDOKU_DIFF[save.difficulty] ? t(SUDOKU_DIFF[save.difficulty]) : '',
      pct: empty ? right / empty : 0,
      seconds: save.seconds || 0,
      mistakes: save.mistakes || 0,
    }
  }

  return {
    won, lost, best, streak, current,
    totalDaily: Object.keys(completed).length,
    today: { diff: SUDOKU_DAILY_BY_WEEKDAY[now.getDay()], time: dailyTime(dateKeyOf(now)) },
  }
}