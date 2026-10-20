import { afterEach, describe, expect, it } from 'vitest'
import { SUDOKU_DAILY_BY_WEEKDAY, sudokuData } from './sudoku'

afterEach(() => localStorage.clear())
const t = (k: string) => k
const now = new Date(2026, 9, 20, 12) // 20/10/2026
const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v))

describe('sudokuData', () => {
  it('không có dữ liệu', () => {
    const d = sudokuData(t, now)
    expect(d.won).toBe(0)
    expect(d.lost).toBe(0)
    expect(d.streak).toBe(0)
    expect(d.best).toBeNull()
    expect(d.current).toBeNull()
    expect(d.today).toEqual({ diff: SUDOKU_DAILY_BY_WEEKDAY[now.getDay()], time: null })
  })
  it('streak tính cả khi hôm nay chưa làm', () => {
    set('sudoku-vn-stats-v1', { daily: { completed: { '2026-10-19': 100, '2026-10-18': 90 } } })
    const d = sudokuData(t, now)
    expect(d.streak).toBe(2)
    expect(d.totalDaily).toBe(2)
    expect(d.today.time).toBeNull()
  })
  it('streak gồm cả hôm nay', () => {
    set('sudoku-vn-stats-v1', { daily: { completed: { '2026-10-20': 70, '2026-10-19': 100 } } })
    const d = sudokuData(t, now)
    expect(d.streak).toBe(2)
    expect(d.today.time).toBe(70)
  })
  it('best lấy độ khó cao nhất có bestTime', () => {
    set('sudoku-vn-stats-v1', {
      byDifficulty: { easy: { won: 2, lost: 1, bestTime: 50 }, hard: { won: 1, bestTime: 300 }, expert: { won: 0, lost: 4 } },
    })
    const d = sudokuData(t, now)
    expect(d.best).toEqual({ key: 'hard', time: 300 })
    expect(d.won).toBe(3)
    expect(d.lost).toBe(5)
  })
  it('current.pct = ô trống đúng / ô trống; won → null', () => {
    const puzzle = Array(81).fill(1)
    const solution = Array(81).fill(1)
    const board = Array(81).fill(1)
    puzzle[0] = puzzle[1] = puzzle[2] = puzzle[3] = 0
    board[0] = board[1] = 9
    board[2] = board[3] = 1
    solution.fill(1)
    const save = { version: 1, puzzle, board, solution, status: 'playing', difficulty: 'hard', seconds: 12, mistakes: 2 }
    set('sudoku-vn-save-v1', save)
    const d = sudokuData(t, now)
    expect(d.current).toEqual({ label: 'sudoku.hard', pct: 0.5, seconds: 12, mistakes: 2 })
    set('sudoku-vn-save-v1', { ...save, daily: '2026-10-20' })
    expect(sudokuData(t, now).current?.label).toBe('today.dailyLabel')
    set('sudoku-vn-save-v1', { ...save, status: 'won' })
    expect(sudokuData(t, now).current).toBeNull()
  })
})