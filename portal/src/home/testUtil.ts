import { renderHook } from '@testing-library/react'
import { I18nProvider, useI18n, type I18nApi } from '../i18n/i18n'
import type { SudokuData } from '../data/sudoku'
import type { Summary } from '../data/summary'

/** Lấy I18nApi thật (ngôn ngữ mặc định en) để test hàm thuần. */
export function getI18n(): I18nApi {
  return renderHook(() => useI18n(), { wrapper: I18nProvider }).result.current
}

export const emptySd = (): SudokuData => ({
  won: 0, lost: 0, best: null, streak: 0, current: null, totalDaily: 0,
  today: { diff: 'easy', time: null },
})

export const sum = (o: Partial<Summary> = {}): Summary => ({
  updatedAt: 0, played: 0, won: 0, note: '', stats: [], resume: null, daily: null, ...o,
})