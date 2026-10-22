import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb, newUser } from './harness'

const put = (db: PGlite, uid: string, items: unknown) =>
  asUser(db, uid, () => db.query<{ n: number }>('select put_saves($1::jsonb) as n', [JSON.stringify(items)])).then((r) => r.rows[0].n)
const saves = async (db: PGlite, uid: string, since: string | null = null) =>
  (await asUser(db, uid, () => db.query<any>('select * from my_saves($1)', [since]))).rows.map((r) => [r.key, r.value])

const iso = (ms: number) => new Date(Date.now() + ms).toISOString()

describe('cloud saves', () => {
  it('ghi, đọc lại; bản cũ hơn không đè bản mới; null là xóa (vẫn trả về để máy khác xóa theo)', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'An' })
    expect(await put(db, a, [{ key: 'playnine-2048-stats-v1', value: '{"games":3}', updated_at: iso(-60_000) }, { key: 'xiangqi.level', value: '2', updated_at: iso(-60_000) }])).toBe(2)
    expect(await put(db, a, [{ key: 'playnine-2048-stats-v1', value: '{"games":1}', updated_at: iso(-120_000) }])).toBe(0)
    expect(await put(db, a, [{ key: 'playnine-2048-stats-v1', value: '{"games":4}', updated_at: iso(-1000) }])).toBe(1)
    await put(db, a, [{ key: 'xiangqi.level', value: null, updated_at: iso(0) }])
    expect((await saves(db, a)).sort()).toEqual([['playnine-2048-stats-v1', '{"games":4}'], ['xiangqi.level', null]])
  })

  it('my_saves(p_since) lọc theo giờ server nhận (kể cả bản đẩy lên có updated_at rất cũ); mỗi người chỉ thấy của mình', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'An' })
    const b = await newUser(db, { anonymous: true })
    await put(db, a, [{ key: 'k1', value: 'a', updated_at: iso(-60_000) }])
    await db.query("update user_saves set synced_at = now() - interval '1 hour'")
    await put(db, a, [{ key: 'k2', value: 'b', updated_at: '1970-01-01T00:00:00Z' }])
    expect(await saves(db, a, iso(-30_000))).toEqual([['k2', 'b']])
    expect(await saves(db, b)).toEqual([])
    await put(db, b, [{ key: 'k1', value: 'guest', updated_at: iso(0) }])
    expect(await saves(db, b)).toEqual([['k1', 'guest']])
    expect((await saves(db, a)).find((r) => r[0] === 'k1')![1]).toBe('a')
  })

  it('giờ tương lai bị kẹp về hiện tại; khóa trùng trong một lô lấy bản mới nhất', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'An' })
    await put(db, a, [{ key: 'k', value: 'old', updated_at: iso(-5000) }, { key: 'k', value: 'new', updated_at: iso(-1000) }])
    expect(await saves(db, a)).toEqual([['k', 'new']])
    await put(db, a, [{ key: 'f', value: 'x', updated_at: iso(10 * 86_400_000) }])
    const at = (await db.query<any>("select updated_at from user_saves where key = 'f'")).rows[0].updated_at
    expect(new Date(at).getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('kiểm tra dữ liệu và giới hạn; anon không gọi được', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'An' })
    for (const bad of [{ a: 1 }, [{ key: 'bad key', value: 'x' }], [{ key: 'k', value: 5 }], [{ key: '', value: 'x' }], ['x']]) {
      await expect(put(db, a, bad), JSON.stringify(bad)).rejects.toThrow(/invalid_items/)
    }
    await expect(put(db, a, [{ key: 'k', value: 'x'.repeat(200001) }])).rejects.toThrow(/invalid_items/)
    await expect(put(db, a, Array.from({ length: 101 }, (_, i) => ({ key: 'k' + i, value: 'x' })))).rejects.toThrow(/too_many_items/)
    for (let i = 0; i < 4; i++) await put(db, a, Array.from({ length: 100 }, (_, j) => ({ key: `k${i}-${j}`, value: 'x' })))
    await expect(put(db, a, [{ key: 'one-more', value: 'x' }])).rejects.toThrow(/too_many_keys/)
    const c = await newUser(db, { full_name: 'Chi' })
    for (let i = 0; i < 9; i++) await put(db, c, [{ key: 'big' + i, value: 'x'.repeat(200000) }])
    await put(db, c, [{ key: 'big9', value: 'x'.repeat(200000) }])
    await expect(put(db, c, [{ key: 'big10', value: 'x' }])).rejects.toThrow(/too_large/)
    await expect(asAnon(db, () => db.query("select put_saves('[]'::jsonb)"))).rejects.toThrow(/permission denied/)
    await expect(asAnon(db, () => db.query('select * from my_saves()'))).rejects.toThrow(/permission denied/)
    await expect(asAnon(db, () => db.query('select * from user_saves'))).rejects.toThrow(/permission denied/)
  })
})
