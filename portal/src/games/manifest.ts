// Manifest của một game: games/<dir>/game.json. Cổng dựng danh mục từ đây, test Supabase và seed-sql đọc phần `server`.
import { CATS, type Cat } from './cats'

export type Text<T> = { en: T; vi: T }
export type Metric = 'score_high' | 'time_low' | 'wins'
export type ServerMode = { key: string; label: Text<string>; points?: number; rules?: Record<string, number> }
export type ServerSpec = { metric: Metric; points: number; modes: ServerMode[] }

export type GameManifest = {
  id: string
  cat: Cat
  /** Ngày thêm game (YYYY-MM-DD): game thêm trong NEW_DAYS ngày gần đây có nhãn "Mới". */
  addedAt: string
  name: Text<string>
  sub: Text<string>
  desc: Text<string>
  tags: Text<string[]>
  note?: Text<string>
  /** Có đề hằng ngày: hiện ô gợi ý khi hôm nay chưa chơi. */
  daily?: Text<string>
  keepAlive?: boolean
  /** Game đã nối SDK (ghi ván, bảng xếp hạng). */
  sdk?: boolean
  /** Có preview.svg trong thư mục game; `bg` là nền ô xem trước. */
  preview?: { bg: string }
  /** Gợi ý cho e2e chung: nút phải bấm để bắt đầu ván. */
  e2e?: { start?: string }
  server: ServerSpec
}

const METRICS: Metric[] = ['score_high', 'time_low', 'wins']
const RULES = ['min_duration_ms', 'max_score', 'max_score_per_sec', 'min_time_ms']
const KEYS = ['id', 'cat', 'addedAt', 'name', 'sub', 'desc', 'tags', 'note', 'daily', 'keepAlive', 'sdk', 'preview', 'e2e', 'server']
const DAY = 86_400_000
export const NEW_DAYS = 14

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim() !== ''

/** Kiểm tra chặt manifest; sai thì ném Error "<file>: <trường>: <lý do>". */
export function parseManifest(raw: unknown, file: string): GameManifest {
  const fail = (field: string, why: string): never => {
    throw new Error(file + ': ' + field + ': ' + why)
  }
  const text = (o: Obj, k: string) => {
    const v = o[k]
    if (!isObj(v)) fail(k, 'cần { en, vi }')
    const t = v as Obj
    for (const l of ['en', 'vi']) if (!isStr(t[l])) fail(k + '.' + l, 'thiếu')
  }
  const int = (v: unknown, field: string, max: number) => {
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > max) fail(field, 'cần số nguyên 0..' + max)
  }

  if (!isObj(raw)) return fail('(gốc)', 'cần object')
  const m = raw as Obj
  for (const k of Object.keys(m)) if (!KEYS.includes(k)) fail(k, 'trường lạ')
  if (typeof m.id !== 'string' || !/^[a-z0-9]{2,24}$/.test(m.id)) fail('id', 'cần 2-24 ký tự a-z, 0-9')
  if (typeof m.cat !== 'string' || !Object.hasOwn(CATS, m.cat)) fail('cat', 'thể loại lạ')
  if (typeof m.addedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.addedAt) || dayOf(m.addedAt) === null) fail('addedAt', 'cần YYYY-MM-DD')
  for (const k of ['name', 'sub', 'desc']) text(m, k)
  for (const k of ['note', 'daily']) if (m[k] !== undefined) text(m, k)
  if (!isObj(m.tags)) fail('tags', 'cần { en, vi }')
  for (const l of ['en', 'vi']) {
    const list = (m.tags as Obj)[l]
    if (!Array.isArray(list) || list.length < 1 || list.length > 5 || !list.every(isStr)) fail('tags.' + l, 'cần 1-5 chuỗi')
  }
  for (const k of ['keepAlive', 'sdk']) if (m[k] !== undefined && typeof m[k] !== 'boolean') fail(k, 'cần true/false')
  if (m.preview !== undefined && (!isObj(m.preview) || !isStr(m.preview.bg))) fail('preview.bg', 'cần chuỗi')
  if (m.e2e !== undefined && (!isObj(m.e2e) || (m.e2e.start !== undefined && !isStr(m.e2e.start)))) fail('e2e.start', 'cần chuỗi')

  if (!isObj(m.server)) return fail('server', 'cần object')
  const s = m.server
  if (!METRICS.includes(s.metric as Metric)) fail('server.metric', 'cần ' + METRICS.join('/'))
  int(s.points, 'server.points', 1000)
  if (!Array.isArray(s.modes) || s.modes.length === 0) fail('server.modes', 'cần ít nhất một mode')
  const seen = new Set<string>()
  ;(s.modes as unknown[]).forEach((mode, i) => {
    const at = 'server.modes[' + i + ']'
    if (!isObj(mode)) return fail(at, 'cần object')
    if (typeof mode.key !== 'string' || !/^[a-z0-9-]{1,24}$/.test(mode.key)) fail(at + '.key', 'cần 1-24 ký tự a-z, 0-9, -')
    if (seen.has(mode.key as string)) fail(at + '.key', 'trùng')
    seen.add(mode.key as string)
    if (!isObj(mode.label) || !isStr(mode.label.en) || !isStr(mode.label.vi)) fail(at + '.label', 'cần { en, vi }')
    if (mode.points !== undefined) int(mode.points, at + '.points', 1000)
    if (mode.rules !== undefined) {
      if (!isObj(mode.rules)) return fail(at + '.rules', 'cần object')
      for (const [k, v] of Object.entries(mode.rules)) {
        if (!RULES.includes(k)) fail(at + '.rules.' + k, 'luật lạ')
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(at + '.rules.' + k, 'cần số ≥ 0')
      }
    }
  })
  return raw as GameManifest
}

/** Mốc 0h UTC của ngày YYYY-MM-DD; ngày không có thật (2026-13-40) thì null. */
function dayOf(s: string): number | null {
  const t = Date.parse(s + 'T00:00:00Z')
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s ? null : t
}

/** Game thêm trong NEW_DAYS ngày tính tới `now`; ngày ở tương lai thì chưa tính là mới. */
export function isNewGame(g: { addedAt: string }, now: number): boolean {
  const t = dayOf(g.addedAt)
  if (t === null || t > now) return false
  return now - t < (NEW_DAYS + 1) * DAY
}
