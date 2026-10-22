import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb, newUser } from './harness'

const as = <T = any>(db: PGlite, uid: string, sql: string, params: any[] = []) => asUser(db, uid, () => db.query<T>(sql, params))
const favs = async (db: PGlite, uid: string) => (await as<{ g: string }>(db, uid, 'select my_favorites() as g')).rows.map((r) => r.g)

async function addRun(
  db: PGlite,
  user: string,
  game: string,
  mode: string,
  at: string,
  v: { won?: boolean; assisted?: boolean; status?: string; score?: number; reason?: string } = {},
) {
  await db.query(
    `insert into runs (user_id, game_id, mode, started_at, ended_at, score, won, assisted, status, reject_reason)
     values ($1, $2, $3, $4::timestamptz - interval '1 minute', $4::timestamptz, $5, $6, $7, $8, $9)`,
    [user, game, mode, at, v.score ?? 100, v.won ?? false, v.assisted ?? false, v.status ?? 'finished', v.reason ?? null],
  )
}

describe('favorites', () => {
  it('thêm, bỏ, mới thêm trước; thêm lại giữ thứ tự cũ; game ẩn không trả về', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'An' })
    await as(db, a, "select set_favorite('2048', true)")
    await db.query("update favorites set created_at = now() - interval '1 hour'")
    await as(db, a, "select set_favorite('sudoku', true)")
    await as(db, a, "select set_favorite('2048', true)")
    expect(await favs(db, a)).toEqual(['sudoku', '2048'])
    await db.query("update games set hidden = true where id = 'sudoku'")
    expect(await favs(db, a)).toEqual(['2048'])
    await db.query("update games set hidden = false where id = 'sudoku'")
    await as(db, a, "select set_favorite('sudoku', false)")
    await as(db, a, "select set_favorite('sudoku', false)") // bỏ lần nữa không lỗi
    expect(await favs(db, a)).toEqual(['2048'])
  })

  it('mỗi người chỉ thấy của mình; game lạ/ẩn bị từ chối; anon không gọi được; khách được', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'An' })
    const guest = await newUser(db, { anonymous: true })
    await as(db, a, "select set_favorite('caro', true)")
    expect(await favs(db, guest)).toEqual([])
    await as(db, guest, "select set_favorite('covua', true)")
    expect(await favs(db, guest)).toEqual(['covua'])
    await expect(as(db, a, "select set_favorite('nope', true)")).rejects.toThrow(/unknown_game/)
    await db.query("update games set hidden = true where id = 'ran'")
    await expect(as(db, a, "select set_favorite('ran', true)")).rejects.toThrow(/unknown_game/)
    await expect(as(db, a, "select set_favorite('caro', null)")).rejects.toThrow(/invalid_on/)
    await expect(asAnon(db, () => db.query("select set_favorite('caro', true)"))).rejects.toThrow(/permission denied/)
    await expect(asAnon(db, () => db.query('select my_favorites()'))).rejects.toThrow(/permission denied/)
    await expect(asAnon(db, () => db.query('select * from favorites'))).rejects.toThrow(/permission denied/)
  })
})

describe('my_runs', () => {
  it('chỉ ván của người gọi, finished và rejected, mới nhất trước; điểm đúng luật', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'An' })
    const b = await newUser(db, { full_name: 'Bình' })
    await addRun(db, a, 'sudoku', 'extreme', '2026-10-20 10:00+07', { won: true }) // 20 x2
    await addRun(db, a, 'sudoku', 'easy', '2026-10-20 11:00+07', { won: true, assisted: true }) // 5
    await addRun(db, a, 'caro', 'hard', '2026-10-20 12:00+07', { status: 'rejected', reason: 'too_fast' })
    await addRun(db, a, 'caro', 'hard', '2026-10-20 13:00+07', { status: 'started' })
    await addRun(db, b, 'caro', 'hard', '2026-10-20 14:00+07', { won: true })
    const rows = (await as<any>(db, a, 'select * from my_runs()')).rows
    expect(rows.map((r) => [r.game_id, r.mode, r.status, r.points])).toEqual([
      ['caro', 'hard', 'rejected', 0],
      ['sudoku', 'easy', 'finished', 5],
      ['sudoku', 'extreme', 'finished', 40],
    ])
    expect(rows[0].reject_reason).toBe('too_fast')
  })

  it('lọc theo game, phân trang theo ended_at, giới hạn 1..100', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'An' })
    for (let i = 0; i < 5; i++) await addRun(db, a, '2048', '4x4', `2026-10-20 1${i}:00+07`)
    await addRun(db, a, 'caro', 'easy', '2026-10-20 18:00+07')
    const page1 = (await as<any>(db, a, "select * from my_runs('2048', null, 2)")).rows
    expect(page1).toHaveLength(2)
    expect(page1.every((r) => r.game_id === '2048')).toBe(true)
    const page2 = (await as<any>(db, a, "select * from my_runs('2048', $1, 2)", [page1[1].ended_at])).rows
    expect(page2.map((r) => new Date(r.ended_at).getTime())).toEqual(
      [...page2].map((r) => new Date(r.ended_at).getTime()).sort((x, y) => y - x),
    )
    expect(new Date(page2[0].ended_at).getTime()).toBeLessThan(new Date(page1[1].ended_at).getTime())
    expect((await as<any>(db, a, 'select * from my_runs(null, null, 1000)')).rows).toHaveLength(6)
    expect((await as<any>(db, a, 'select * from my_runs(null, null, 0)')).rows).toHaveLength(1)
  })

  it('ván thứ 21 trong ngày của cùng game được 0 điểm; game ẩn 0 điểm; anon bị từ chối', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'An' })
    for (let i = 0; i < 21; i++) await addRun(db, a, 'ran', 'classic-normal', `2026-10-20 10:${String(i).padStart(2, '0')}+07`)
    const rows = (await as<any>(db, a, "select * from my_runs('ran', null, 100)")).rows
    expect(rows[0].points).toBe(0)
    expect(rows[1].points).toBe(5)
    await db.query("update games set hidden = true where id = 'ran'")
    expect((await as<any>(db, a, "select points from my_runs('ran', null, 1)")).rows[0].points).toBe(0)
    await expect(asAnon(db, () => db.query('select * from my_runs()'))).rejects.toThrow(/permission denied/)
  })
})
