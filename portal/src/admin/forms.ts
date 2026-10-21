import type { CollectionInput, EventInput, EventPhase, GameMeta, Rules } from '../server/types'

/** Bốn ô luật của một mode, theo đúng tên trường trong DB. */
export const RULE_FIELDS: (keyof Rules)[] = ['min_duration_ms', 'max_score', 'max_score_per_sec', 'min_time_ms']

const INT = /^\d{1,18}$/
const DECIMAL = /^(\d+(\.\d+)?|\.\d+)$/
/** Cận trên của max_score_per_sec; khớp `admin_update_game`. */
const PER_SEC_MAX = 1e9

export type RulesResult = { ok: true; rules: Record<string, Rules> } | { ok: false; mode: string; field: keyof Rules }

/**
 * Chuyển các ô nhập (chuỗi) thành luật theo từng mode.
 * Ô trống nghĩa là không có luật; chỉ `max_score_per_sec` được là số thập phân (tối đa 1e9);
 * ba ô còn lại là số nguyên an toàn, tối đa 18 chữ số.
 */
export function rulesFromForm(values: Record<string, Record<keyof Rules, string>>): RulesResult {
  const rules: Record<string, Rules> = {}
  for (const [mode, fields] of Object.entries(values)) {
    const out: Rules = {}
    for (const field of RULE_FIELDS) {
      const raw = (fields[field] ?? '').trim()
      if (raw === '') continue
      if (!(field === 'max_score_per_sec' ? DECIMAL : INT).test(raw)) return { ok: false, mode, field }
      const n = Number(raw)
      // Số nguyên tối đa 18 chữ số (finish_run ép ::bigint) và phải biểu diễn chính xác được.
      if (field === 'max_score_per_sec' ? n > PER_SEC_MAX : !Number.isSafeInteger(n)) return { ok: false, mode, field }
      out[field] = n
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

const AWARD_MAX = 100

/**
 * Trường sai của một sự kiện, cùng quy tắc với `admin_save_event`:
 * tên tiếng Anh rỗng, game/mode lạ, `sum` với game `time_low`, kết thúc không sau bắt đầu,
 * số người nhận huy hiệu không phải số nguyên 0..100.
 */
export function validateEvent(input: EventInput, games: Record<string, GameMeta>): (keyof EventInput)[] {
  const bad: (keyof EventInput)[] = []
  if (input.title.en.trim() === '') bad.push('title')
  const game = games[input.gameId]
  if (!game) bad.push('gameId')
  else if (!game.modes.some((m) => m.key === input.mode)) bad.push('mode')
  if ((input.agg !== 'best' && input.agg !== 'sum') || (input.agg === 'sum' && game?.metric === 'time_low')) bad.push('agg')
  const start = Date.parse(input.startsAt)
  const end = Date.parse(input.endsAt)
  if (Number.isNaN(start)) bad.push('startsAt')
  if (Number.isNaN(end) || (!Number.isNaN(start) && end <= start)) bad.push('endsAt')
  if (!Number.isInteger(input.awardTop) || input.awardTop < 0 || input.awardTop > AWARD_MAX) bad.push('awardTop')
  return bad
}

/** Trường sai của một bộ sưu tập; kết thúc `null` nghĩa là không hạn. */
export function validateCollection(input: CollectionInput): (keyof CollectionInput)[] {
  const bad: (keyof CollectionInput)[] = []
  if (input.title.en.trim() === '') bad.push('title')
  if (input.gameIds.length === 0) bad.push('gameIds')
  const start = Date.parse(input.startsAt)
  if (Number.isNaN(start)) bad.push('startsAt')
  if (input.endsAt !== null) {
    const end = Date.parse(input.endsAt)
    if (Number.isNaN(end) || (!Number.isNaN(start) && end <= start)) bad.push('endsAt')
  }
  if (!Number.isInteger(input.sort)) bad.push('sort')
  return bad
}

const TEXT_FIELDS: (keyof EventInput)[] = ['title', 'description']

/** Trường sửa được theo giai đoạn; khớp quy tắc khóa trường của `admin_save_event`. */
export function editableFields(phase: EventPhase): Set<keyof EventInput> {
  if (phase === 'upcoming') return new Set(['title', 'description', 'gameId', 'mode', 'agg', 'startsAt', 'endsAt', 'awardTop'])
  if (phase === 'live') return new Set([...TEXT_FIELDS, 'awardTop', 'endsAt'])
  return new Set(TEXT_FIELDS)
}
