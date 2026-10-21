import type { Rules } from '../server/types'

/** Bốn ô luật của một mode, theo đúng tên trường trong DB. */
export const RULE_FIELDS: (keyof Rules)[] = ['min_duration_ms', 'max_score', 'max_score_per_sec', 'min_time_ms']

const INT = /^\d+$/
const DECIMAL = /^(\d+(\.\d+)?|\.\d+)$/

export type RulesResult = { ok: true; rules: Record<string, Rules> } | { ok: false; mode: string; field: keyof Rules }

/**
 * Chuyển các ô nhập (chuỗi) thành luật theo từng mode.
 * Ô trống nghĩa là không có luật; chỉ `max_score_per_sec` được là số thập phân.
 */
export function rulesFromForm(values: Record<string, Record<keyof Rules, string>>): RulesResult {
  const rules: Record<string, Rules> = {}
  for (const [mode, fields] of Object.entries(values)) {
    const out: Rules = {}
    for (const field of RULE_FIELDS) {
      const raw = (fields[field] ?? '').trim()
      if (raw === '') continue
      if (!(field === 'max_score_per_sec' ? DECIMAL : INT).test(raw)) return { ok: false, mode, field }
      out[field] = Number(raw)
    }
    rules[mode] = out
  }
  return { ok: true, rules }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO -> `YYYY-MM-DDTHH:mm` theo giờ máy (giá trị cho <input type="datetime-local">). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `YYYY-MM-DDTHH:mm` giờ máy -> ISO UTC; chuỗi hỏng thì null. */
export function fromLocalInput(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null
  const d = new Date(v)
  // Ngày không có thật (31/02) bị Date đẩy sang tháng sau: so lại để loại.
  return Number.isNaN(d.getTime()) || toLocalInput(d.toISOString()) !== v ? null : d.toISOString()
}

/** Lỗi RPC có dạng `op: code`; lấy phần mã sau dấu `: ` cuối. */
export function errorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.split(': ').pop() ?? msg
}
