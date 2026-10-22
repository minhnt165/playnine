import type { ServerApi } from '../server/api'
import type { SaveItem } from '../server/types'

// Đồng bộ tiến độ game (các khóa localStorage mà game tự ghi) với tài khoản. Game và cổng cùng origin nên cổng đọc/ghi
// thẳng các khóa này, không phải sửa từng game. Bản nào sửa sau thì thắng (theo từng khóa).

/** Khóa được đồng bộ: ván dở, thống kê, tóm tắt, cài đặt, tiến độ của từng game, cùng vài tùy chọn chung của cổng. */
const SYNC_KEYS = [
  /^playnine-[a-z0-9]+-(save|game|settings|stats|summary|progress)-v\d+$/,
  /^sudoku-vn-(save|stats|settings|progress)-v\d+$/,
  /^xiangqi\.level$/,
  /^playnine-(lang|sound-v1)$/,
  /^game-portal-(recent|theme)-v1$/,
]
export const isSyncKey = (key: string): boolean => SYNC_KEYS.some((r) => r.test(key))

/** Khóa thuộc về game nào (để không ghi đè dữ liệu của game đang mở); không thuộc game nào thì null. */
export function gameOfKey(key: string): string | null {
  if (key.startsWith('sudoku-vn-')) return 'sudoku'
  if (key.startsWith('xiangqi.')) return 'xiangqi'
  const m = /^playnine-([a-z0-9]+)-(save|game|settings|stats|summary|progress)-v\d+$/.exec(key)
  return m ? m[1] : null
}

const META_KEY = 'playnine-cloud-v1'
// Giới hạn của put_saves: 100 mục mỗi lần, 200.000 ký tự mỗi giá trị.
const BATCH = 100
const MAX_VALUE = 200000

/** h: băm của giá trị đã đồng bộ lần cuối (null = khóa không có); t: giờ (ms) sửa trên máy của giá trị đó. */
type KeyMeta = { h: number | null; t: number }
type UserMeta = { since: string | null; keys: Record<string, KeyMeta> }

/** Băm FNV-1a 32-bit: đủ để biết giá trị đã đổi so với lần đồng bộ trước mà không phải lưu bản sao. */
export function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export type SyncEnv = {
  api: Pick<ServerApi, 'mySaves' | 'putSaves'>
  userId: string
  storage: Storage
  now?: () => number
  /** Khóa không được ghi đè lúc này (thuộc game đang mở); vẫn được đẩy lên. */
  skip?: (key: string) => boolean
}

export type SyncResult = { pulled: number; pushed: number }

function loadMeta(storage: Storage, userId: string): UserMeta {
  try {
    const all = JSON.parse(storage.getItem(META_KEY) || '{}') as Record<string, UserMeta>
    const m = all[userId]
    if (m && typeof m === 'object' && m.keys) return m
  } catch {
    /* hỏng thì làm lại từ đầu */
  }
  return { since: null, keys: {} }
}

function saveMeta(storage: Storage, userId: string, meta: UserMeta): void {
  let all: Record<string, UserMeta> = {}
  try {
    all = JSON.parse(storage.getItem(META_KEY) || '{}') as Record<string, UserMeta>
  } catch {
    /* ghi đè bản hỏng */
  }
  // Mỗi tài khoản trên máy một bản theo dõi riêng; chỉ giữ 5 tài khoản gần nhất.
  const next = { ...Object.fromEntries(Object.entries(all).filter(([id]) => id !== userId).slice(-4)), [userId]: meta }
  try {
    storage.setItem(META_KEY, JSON.stringify(next))
  } catch {
    /* hết dung lượng: lần sau đồng bộ lại */
  }
}

function localKeys(storage: Storage): string[] {
  const out: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && isSyncKey(k)) out.push(k)
  }
  return out
}

/**
 * Một lượt đồng bộ: tìm khóa đã đổi trên máy, kéo phần mới từ server (bản server mới hơn thì ghi đè máy),
 * rồi đẩy các khóa máy mới hơn lên. Khóa chưa từng đồng bộ trên máy này coi như cũ nhất (t = 0) để bản trên
 * server (nếu có) thắng.
 */
export async function syncOnce(env: SyncEnv): Promise<SyncResult> {
  const { api, userId, storage } = env
  const now = env.now ?? Date.now
  const meta = loadMeta(storage, userId)

  // 1. Khóa đổi trên máy kể từ lần đồng bộ trước.
  const dirty = new Map<string, { value: string | null; t: number }>()
  const keys = new Set([...localKeys(storage), ...Object.keys(meta.keys).filter(isSyncKey)])
  for (const key of keys) {
    const value = storage.getItem(key)
    if (value !== null && value.length > MAX_VALUE) continue
    const h = value === null ? null : hash(value)
    const m = meta.keys[key]
    if (m && m.h === h) continue
    if (!m && value === null) continue
    dirty.set(key, { value, t: m ? now() : 0 })
  }

  // 2. Kéo phần server nhận sau lần trước.
  let pulled = 0
  let since = meta.since
  let held = false
  const rows = await api.mySaves(meta.since)
  for (const row of rows) {
    if (!since || row.syncedAt > since) since = row.syncedAt
    if (!isSyncKey(row.key)) continue
    const at = Date.parse(row.updatedAt)
    const mine = dirty.get(row.key)
    if (mine && mine.t >= at) continue
    if (env.skip?.(row.key)) {
      // Game đang mở: chưa ghi đè, cũng không đẩy bản cũ của máy lên; giữ mốc để lượt sau kéo lại.
      dirty.delete(row.key)
      held = true
      continue
    }
    const cur = storage.getItem(row.key)
    if (cur !== row.value) {
      try {
        if (row.value === null) storage.removeItem(row.key)
        else storage.setItem(row.key, row.value)
        pulled++
      } catch {
        continue
      }
    }
    dirty.delete(row.key)
    meta.keys[row.key] = { h: row.value === null ? null : hash(row.value), t: at }
  }

  if (!held) meta.since = since

  // 3. Đẩy các khóa máy mới hơn.
  let pushed = 0
  const items: SaveItem[] = [...dirty].map(([key, d]) => ({ key, value: d.value, updatedAt: new Date(d.t).toISOString() }))
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH)
    await api.putSaves(batch)
    for (const it of batch) {
      const d = dirty.get(it.key)!
      meta.keys[it.key] = { h: d.value === null ? null : hash(d.value), t: d.t }
      pushed++
    }
  }

  saveMeta(storage, userId, meta)
  return { pulled, pushed }
}
