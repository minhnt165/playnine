import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeApi } from '../server/fakeApi'
import { gameOfKey, isSyncKey, syncOnce } from './cloudSave'

const USER = { id: 'u1', displayName: 'An', avatarUrl: null }

/** localStorage riêng cho từng "máy". */
function memStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init))
  return {
    get length() {
      return m.size
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  }
}

let clock = Date.parse('2026-10-22T10:00:00Z')
const now = () => clock

beforeEach(() => {
  clock = Date.parse('2026-10-22T10:00:00Z')
})

describe('khóa đồng bộ', () => {
  it('chỉ khóa tiến độ game và vài tùy chọn chung', () => {
    for (const k of ['playnine-2048-stats-v1', 'playnine-ran-game-v1', 'playnine-covua-save-v1', 'sudoku-vn-progress-v1', 'xiangqi.level', 'playnine-lang', 'playnine-sound-v1', 'game-portal-recent-v1']) {
      expect(isSyncKey(k), k).toBe(true)
    }
    for (const k of ['playnine-cloud-v1', 'playnine-run-2048', 'playnine-return-hash', 'playnine-favorites-v1', 'sb-xyz-auth-token', 'playnine-lbs-tab']) {
      expect(isSyncKey(k), k).toBe(false)
    }
    expect(gameOfKey('playnine-covua-save-v1')).toBe('covua')
    expect(gameOfKey('sudoku-vn-save-v1')).toBe('sudoku')
    expect(gameOfKey('xiangqi.level')).toBe('xiangqi')
    expect(gameOfKey('playnine-lang')).toBeNull()
  })
})

describe('syncOnce', () => {
  it('máy A đẩy tiến độ lên; máy B trống kéo về; khóa khác không đụng tới', async () => {
    const api = createFakeApi({ user: USER })
    const a = memStorage({ 'playnine-2048-stats-v1': '{"games":5}', 'sb-auth': 'secret' })
    expect(await syncOnce({ api, userId: 'u1', storage: a, now })).toEqual({ pulled: 0, pushed: 1 })
    expect(api.state.saves.map((s) => s.key)).toEqual(['playnine-2048-stats-v1'])
    const b = memStorage()
    expect(await syncOnce({ api, userId: 'u1', storage: b, now })).toEqual({ pulled: 1, pushed: 0 })
    expect(b.getItem('playnine-2048-stats-v1')).toBe('{"games":5}')
    // Lượt sau không có gì đổi.
    expect(await syncOnce({ api, userId: 'u1', storage: b, now })).toEqual({ pulled: 0, pushed: 0 })
  })

  it('bản sửa sau thắng; dữ liệu cũ chưa từng đồng bộ trên máy mới không đè bản trên server', async () => {
    const api = createFakeApi({ user: USER })
    const a = memStorage({ 'playnine-caro-stats-v1': 'A1' })
    await syncOnce({ api, userId: 'u1', storage: a, now })
    clock += 60_000
    a.setItem('playnine-caro-stats-v1', 'A2')
    await syncOnce({ api, userId: 'u1', storage: a, now })
    // Máy B có dữ liệu cũ từ trước khi đăng nhập: server thắng.
    const b = memStorage({ 'playnine-caro-stats-v1': 'B-old' })
    await syncOnce({ api, userId: 'u1', storage: b, now })
    expect(b.getItem('playnine-caro-stats-v1')).toBe('A2')
    // B chơi tiếp: bản mới của B lên server, A kéo về.
    clock += 60_000
    b.setItem('playnine-caro-stats-v1', 'B2')
    await syncOnce({ api, userId: 'u1', storage: b, now })
    await syncOnce({ api, userId: 'u1', storage: a, now })
    expect(a.getItem('playnine-caro-stats-v1')).toBe('B2')
  })

  it('xóa trên một máy (ví dụ xong ván dở) thì máy kia cũng xóa', async () => {
    const api = createFakeApi({ user: USER })
    const a = memStorage({ 'playnine-covua-save-v1': 'board' })
    const b = memStorage()
    await syncOnce({ api, userId: 'u1', storage: a, now })
    await syncOnce({ api, userId: 'u1', storage: b, now })
    expect(b.getItem('playnine-covua-save-v1')).toBe('board')
    clock += 1000
    a.removeItem('playnine-covua-save-v1')
    await syncOnce({ api, userId: 'u1', storage: a, now })
    expect(api.state.saves.find((s) => s.key === 'playnine-covua-save-v1')!.value).toBeNull()
    await syncOnce({ api, userId: 'u1', storage: b, now })
    expect(b.getItem('playnine-covua-save-v1')).toBeNull()
  })

  it('game đang mở: không ghi đè, không đẩy bản cũ lên, lượt sau (đã đóng game) mới kéo về', async () => {
    const api = createFakeApi({ user: USER })
    const a = memStorage({ 'playnine-ran-stats-v1': 'A' })
    await syncOnce({ api, userId: 'u1', storage: a, now })
    const b = memStorage()
    await syncOnce({ api, userId: 'u1', storage: b, now })
    clock += 5000
    a.setItem('playnine-ran-stats-v1', 'A2')
    await syncOnce({ api, userId: 'u1', storage: a, now })
    const skip = (k: string) => gameOfKey(k) === 'ran'
    const r = await syncOnce({ api, userId: 'u1', storage: b, now, skip })
    expect(r.pulled).toBe(0)
    expect(b.getItem('playnine-ran-stats-v1')).toBe('A')
    expect(api.state.saves.find((s) => s.key === 'playnine-ran-stats-v1')!.value).toBe('A2')
    await syncOnce({ api, userId: 'u1', storage: b, now })
    expect(b.getItem('playnine-ran-stats-v1')).toBe('A2')
  })

  it('mỗi tài khoản theo dõi riêng; đẩy theo lô 100; lỗi server thì ném ra, lượt sau đẩy lại', async () => {
    const api = createFakeApi({ user: USER })
    const init: Record<string, string> = {}
    for (let i = 0; i < 150; i++) init[`playnine-g${i}-stats-v1`] = String(i)
    const a = memStorage(init)
    await syncOnce({ api, userId: 'u1', storage: a, now })
    expect(api.calls.filter((c) => c.method === 'putSaves').map((c) => (c.args[0] as unknown[]).length)).toEqual([100, 50])
    const meta = JSON.parse(a.getItem('playnine-cloud-v1')!)
    expect(Object.keys(meta)).toEqual(['u1'])
    clock += 1000
    a.setItem('playnine-g1-stats-v1', 'changed')
    api.fail('putSaves')
    await expect(syncOnce({ api, userId: 'u1', storage: a, now })).rejects.toThrow()
    const api2 = createFakeApi({ user: USER, saves: api.state.saves })
    expect((await syncOnce({ api: api2, userId: 'u1', storage: a, now })).pushed).toBe(1)
  })
})
