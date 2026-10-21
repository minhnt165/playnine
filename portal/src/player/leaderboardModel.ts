import { fmtDuration } from '../lib/time'
import type { TFn } from '../i18n/types'
import type { GameMeta, Metric, ModeMeta } from '../server/types'

/** Số kèm đơn vị có số nhiều (vd. `lbs.unit.points`): chọn dạng theo n thô rồi thay số bằng bản đã định dạng (1.234). */
export function unitLabel(t: TFn, key: string, n: number, fmtNumber: (n: number) => string): string {
  return t(key, { n }).replace(String(n), fmtNumber(n))
}

/** Điểm mỗi ván của từng mode (mode không có điểm riêng dùng điểm mặc định của game); null khi server chưa có điểm. */
export function modePoints(meta: GameMeta | undefined): { key: string; label: ModeMeta['label']; points: number }[] | null {
  if (!meta) return null
  const list = meta.modes.flatMap((m) => {
    const p = m.points ?? meta.points
    return p === undefined ? [] : [{ key: m.key, label: m.label, points: p }]
  })
  return list.length > 0 ? list : meta.points !== undefined ? [] : null
}

/** "10 điểm / ván" hoặc "10–25 điểm / ván" khi các mức độ khác điểm; null khi server chưa có điểm. */
export function perRunText(t: TFn, meta: GameMeta | undefined): string | null {
  const list = modePoints(meta)
  if (!list) return null
  if (list.length === 0) return t('points.perRun', { n: meta!.points! })
  const min = Math.min(...list.map((m) => m.points))
  const max = Math.max(...list.map((m) => m.points))
  return min === max ? t('points.perRun', { n: min }) : t('points.perRunRange', { min, max })
}

/** Giá trị bảng xếp hạng: thời gian tính bằng ms, dưới 60 giây hiện thêm 1 chữ số thập phân. */
export function formatValue(metric: Metric, value: number, fmtNumber: (n: number) => string): string {
  if (metric !== 'time_low') return fmtNumber(value)
  if (value < 60000) return '00:' + (Math.floor(value / 100) / 10).toFixed(1).padStart(4, '0')
  return fmtDuration(Math.floor(value / 1000))
}