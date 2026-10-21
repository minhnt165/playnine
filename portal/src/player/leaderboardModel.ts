import { fmtDuration } from '../lib/time'
import type { Metric, Period } from '../server/types'

/** Mode `daily` chỉ có kỳ ngày; các mode còn lại có tuần và mọi lúc. */
export function periodsFor(mode: string): Period[] {
  return mode === 'daily' ? ['day'] : ['week', 'all']
}

/** Giá trị bảng xếp hạng: thời gian tính bằng ms, dưới 60 giây hiện thêm 1 chữ số thập phân. */
export function formatValue(metric: Metric, value: number, fmtNumber: (n: number) => string): string {
  if (metric !== 'time_low') return fmtNumber(value)
  if (value < 60000) return '00:' + (Math.floor(value / 100) / 10).toFixed(1).padStart(4, '0')
  return fmtDuration(Math.floor(value / 1000))
}