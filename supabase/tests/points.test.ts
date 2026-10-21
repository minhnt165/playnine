import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb as createBaseDb, newUser, withoutModePoints } from './harness'

// Các test ở đây kiểm luật theo điểm mặc định của game; điểm riêng từng mode có ở mode_points.test.ts.
const createDb = async () => withoutModePoints(await createBaseDb())

// Thứ Tư 2026-10-21 10:00 giờ Việt Nam; tuần hiện tại bắt đầu thứ Hai 2026-10-19 00:00 (+07).
const NOW = '2026-10-21 10:00:00+07'

// Tạo ván finished bằng superuser với ended_at tuyệt đối (mặc định NOW).
async function addRun(
  db: PGlite,
  user: string,
  game: string,
  mode: string,
  v: { at?: string; score?: number; won?: boolean; assisted?: boolean; status?: string; n?: number } = {},
) {
  await db.query(
    `insert into runs (user_id, game_id, mode, started_at, ended_at, score, won, assisted, status)
     select $1, $2, $3, $4::timestamptz - interval '1 minute' - i * interval '1 second', $4::timestamptz - i * interval '1 second',
            $5, $6, $7, $8
     from generate_series(1, $9::int) i`,
    [user, game, mode, v.at ?? NOW, v.score ?? null, v.won ?? false, v.assisted ?? false, v.status ?? 'finished', v.n ?? 1],
  )
}

// Huy hiệu cho một sự kiện mới (mỗi huy hiệu một sự kiện để tránh trùng khóa).
async function addBadge(db: PGlite, user: string, rank: number, at = NOW) {
  const ev = (
    await db.query<any>(
      `insert into events (title, game_id, mode, agg, starts_at, ends_at, status)
       values ('{"en":"Cup"}'::jsonb, '2048', '4x4', 'best', $1::timestamptz - interval '2 days', $1::timestamptz - interval '1 hour', 'closed')
       returning id`,
      [at],
    )
  ).rows[0].id
  await db.query('insert into badges (user_id, event_id, rank, awarded_at) values ($1, $2, $3, $4)', [user, ev, rank, at])
}

const board = async (db: PGlite, period: string, now = NOW, limit = 50) =>
  (await db.query<any>("select * from _player_board_at('points', $1, $2, $3)", [period, limit, now])).rows.map((r) => [
    r.rank,
    r.display_name,
    Number(r.value),
  ])

const mine = async (db: PGlite, user: string, now = NOW) =>
  (await db.query<any>('select * from _player_points_at($1, $2)', [user, now])).rows.map((r) => [r.period, Number(r.points), r.rank])

const allPoints = async (db: PGlite, user: string) => (await mine(db, user)).find((r) => r[0] === 'all')![1]

async function makeAdmin(db: PGlite): Promise<string> {
  const id = await newUser(db, { full_name: 'Admin' })
  await db.query("update profiles set role = 'admin' where id = $1", [id])
  return id
}

describe('games.points', () => {
  it('seeds a fixed number of points per game and anyone can read it', async () => {
    const db = await createDb()
    const rows = (await asAnon(db, () => db.query<any>('select id, metric, modes, hidden, points from games order by id'))).rows
    const got = Object.fromEntries(rows.map((r) => [r.id, r.points]))
    expect(got).toEqual({
      ran: 5, xepgach: 5, phagach: 5, '2048': 5, minesweeper: 5, noihinh: 5,
      sudoku: 10, tranhan: 10, xepbai: 10, bonlientiep: 10,
      covua: 15, xiangqi: 15, co9o: 15, caro: 15, codam: 15, coganh: 15, colat: 15, oanquan: 15,
    })
    const u = await newUser(db, { full_name: 'Alice' })
    expect((await asUser(db, u, () => db.query<any>("select points from games where id = 'caro'"))).rows[0].points).toBe(15)
    await expect(db.query("update games set points = 1001 where id = 'caro'")).rejects.toThrow()
    await expect(db.query("update games set points = -1 where id = 'caro'")).rejects.toThrow()
  })
})

describe('points', () => {
  it('sums game points, doubling unassisted wins only', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    await addRun(db, a, '2048', '4x4', { score: 10 })
    await addRun(db, a, '2048', '4x4', { score: 10, won: true })
    await addRun(db, a, '2048', '4x4', { score: 10, won: true, assisted: true })
    await addRun(db, a, 'caro', 'easy', { won: true })
    await addRun(db, a, 'caro', 'easy', { won: true, status: 'rejected' })
    await db.query("insert into runs (user_id, game_id, mode) values ($1, 'caro', 'easy')", [a])
    expect(await allPoints(db, a)).toBe(5 + 10 + 5 + 30)
  })

  it('adds badge points by rank: 300 / 200 / 100, any other rank 50', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    for (const rank of [1, 2, 3, 7]) await addBadge(db, a, rank)
    expect(await allPoints(db, a)).toBe(650)
    await addRun(db, a, 'caro', 'easy', { won: true })
    expect(await allPoints(db, a)).toBe(680)
  })

  it('caps earning runs at 20 per game per Vietnam calendar day', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    // 21 ván 2048 cùng ngày: ván thứ 21 không có điểm.
    await addRun(db, a, '2048', '4x4', { score: 1, n: 21, at: '2026-10-21 09:00:00+07' })
    expect(await allPoints(db, a)).toBe(100)
    // Giới hạn tính riêng từng game.
    await addRun(db, a, 'caro', 'easy', { at: '2026-10-21 09:30:00+07' })
    expect(await allPoints(db, a)).toBe(115)
    // Ván bị từ chối không chiếm suất.
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, b, '2048', '4x4', { score: 1, n: 5, status: 'rejected', at: '2026-10-21 08:00:00+07' })
    await addRun(db, b, '2048', '4x4', { score: 1, n: 20, at: '2026-10-21 09:00:00+07' })
    expect(await allPoints(db, b)).toBe(100)
    // Ngày hôm sau (từ 00:00 giờ Việt Nam, tức 17:00 UTC) lại được tính.
    await addRun(db, a, '2048', '4x4', { score: 1, at: '2026-10-21 23:59:59+07' })
    expect(await allPoints(db, a)).toBe(115)
    await addRun(db, a, '2048', '4x4', { score: 1, at: '2026-10-22 00:00:30+07' })
    expect(await allPoints(db, a)).toBe(120)
  })

  it('excludes hidden games and banned players', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const c = await newUser(db, { full_name: 'Cam' })
    await addRun(db, a, 'xepbai', 'draw1', { won: true })
    await addRun(db, b, 'caro', 'easy', { won: true })
    await addRun(db, c, 'caro', 'easy', { won: true, n: 3 })
    await db.query("update games set hidden = true where id = 'xepbai'")
    await db.query('update profiles set banned = true where id = $1', [c])
    expect(await board(db, 'all')).toEqual([[1, 'Bob', 30]])
    expect(await mine(db, a)).toEqual([
      ['day', 0, null],
      ['week', 0, null],
      ['all', 0, null],
    ])
    // Người bị khóa vẫn thấy điểm của mình nhưng không có hạng.
    expect(await mine(db, c)).toEqual([
      ['day', 90, null],
      ['week', 90, null],
      ['all', 90, null],
    ])
  })

  it('buckets runs by ended_at and badges by awarded_at into day / week / all', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const c = await newUser(db, { full_name: 'Cam' })
    await addRun(db, a, 'caro', 'easy', { at: '2026-10-21 00:05:00+07' }) // hôm nay: 15
    await addRun(db, a, 'caro', 'easy', { won: true, at: '2026-10-19 00:10:00+07' }) // tuần này: 30
    await addBadge(db, b, 1, '2026-10-20 12:00:00+07') // tuần này: 300
    await addRun(db, b, '2048', '4x4', { score: 1, at: '2026-10-21 08:00:00+07' }) // hôm nay: 5
    await addBadge(db, c, 2, '2026-10-18 23:59:00+07') // tuần trước: 200
    await addRun(db, c, 'caro', 'easy', { won: true, at: '2026-10-21 09:00:00+07' }) // hôm nay: 30
    expect(await board(db, 'day')).toEqual([
      [1, 'Cam', 30],
      [2, 'Alice', 15],
      [3, 'Bob', 5],
    ])
    expect(await board(db, 'week')).toEqual([
      [1, 'Bob', 305],
      [2, 'Alice', 45],
      [3, 'Cam', 30],
    ])
    expect(await board(db, 'all')).toEqual([
      [1, 'Bob', 305],
      [2, 'Cam', 230],
      [3, 'Alice', 45],
    ])
    expect(await mine(db, c)).toEqual([
      ['day', 30, 1],
      ['week', 30, 3],
      ['all', 230, 2],
    ])
    expect(await board(db, 'week', '2026-10-26 00:00:00+07')).toEqual([])
  })

  it('breaks ties by who got there first and keeps limits and errors', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, a, 'caro', 'easy', { at: '2026-10-21 09:00:00+07' })
    await addRun(db, b, 'caro', 'easy', { at: '2026-10-21 08:00:00+07' })
    expect(await board(db, 'day')).toEqual([
      [1, 'Bob', 15],
      [2, 'Alice', 15],
    ])
    expect(await board(db, 'day', NOW, 0)).toHaveLength(1)
    await expect(board(db, 'month')).rejects.toThrow(/bad_period/)
    await expect(db.query("select * from _player_board_at('score', 'all', 10, now())")).rejects.toThrow(/bad_kind/)
  })

  it('anon and authenticated can call player_points and the points board', async () => {
    const db = await createDb()
    const g = await newUser(db, { anonymous: true })
    await db.query(
      "insert into runs (user_id, game_id, mode, started_at, ended_at, status, won) values ($1, 'caro', 'easy', now() - interval '2 minutes', now(), 'finished', true)",
      [g],
    )
    for (const as of [(fn: () => Promise<any>) => asAnon(db, fn), (fn: () => Promise<any>) => asUser(db, g, fn)]) {
      const pts = (await as(() => db.query<any>('select * from player_points($1)', [g]))).rows
      expect(pts.map((r: any) => [r.period, Number(r.points), r.rank])).toEqual([
        ['day', 30, 1],
        ['week', 30, 1],
        ['all', 30, 1],
      ])
      const rows = (await as(() => db.query<any>("select * from player_leaderboard('points', 'all')"))).rows
      expect(rows.map((r: any) => [r.rank, r.user_id, Number(r.value)])).toEqual([[1, g, 30]])
    }
    const p = async (role: string, fn: string) =>
      (await db.query<any>('select has_function_privilege($1, $2, $3) as ok', [role, fn, 'execute'])).rows[0].ok
    for (const role of ['anon', 'authenticated']) {
      expect(await p(role, 'public.player_points(uuid)')).toBe(true)
      for (const fn of ['_points_at(text, timestamptz, uuid)', '_player_rank_at(text, text, timestamptz)', '_player_points_at(uuid, timestamptz)']) {
        expect(await p(role, `public.${fn}`)).toBe(false)
      }
    }
  })
})

describe('admin_update_game points', () => {
  it('sets points, keeps them on null, validates 0..1000 and stays admin-only', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const player = await newUser(db, { full_name: 'Bob' })
    const pts = async () => (await db.query<any>("select points from games where id = 'caro'")).rows[0].points
    const upd = (uid: string, points: number | null) =>
      asUser(db, uid, () => db.query("select admin_update_game('caro', null, '{}'::jsonb, $1)", [points]))
    await upd(admin, 25)
    expect(await pts()).toBe(25)
    await upd(admin, null)
    expect(await pts()).toBe(25)
    await asUser(db, admin, () => db.query("select admin_update_game('caro', null, '{}'::jsonb)"))
    expect(await pts()).toBe(25)
    await upd(admin, 0)
    expect(await pts()).toBe(0)
    await upd(admin, 1000)
    expect(await pts()).toBe(1000)
    await expect(upd(admin, -1)).rejects.toThrow(/bad_points/)
    await expect(upd(admin, 1001)).rejects.toThrow(/bad_points/)
    await expect(upd(player, 5)).rejects.toThrow(/forbidden/)
    await expect(asAnon(db, () => db.query("select admin_update_game('caro', null, '{}'::jsonb, 5)"))).rejects.toThrow(/permission denied/)
    expect(await pts()).toBe(1000)
    // Điểm mới áp cho cả ván cũ (tính lúc đọc).
    await addRun(db, player, 'caro', 'easy', { won: false })
    expect(await allPoints(db, player)).toBe(1000)
    const overloads = (await db.query<any>("select count(*)::int as n from pg_proc where proname = 'admin_update_game'")).rows[0].n
    expect(overloads).toBe(1)
  })
})
