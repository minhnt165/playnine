import { readRaw } from '../lib/storage'

// Khóa và định dạng lấy theo xiangqi/index.html.
export const XQ_LEVEL: Record<string, string> = { easy: 'xq.easy', medium: 'xq.medium', hard: 'xq.hard' } // khóa DICT

export type XqData = { level: 'easy' | 'medium' | 'hard' | null }

export function xiangqiData(): XqData {
  const lv = readRaw('xiangqi.level')
  return { level: lv && Object.hasOwn(XQ_LEVEL, lv) ? (lv as 'easy' | 'medium' | 'hard') : null }
}