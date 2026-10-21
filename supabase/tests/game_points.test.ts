import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb as createBaseDb, newUser, withoutModePoints } from './harness'

// Các test ở đây kiểm luật theo điểm mặc định của game; điểm riêng từng mode có ở mode_points.test.ts.
const createDb = async () => withoutModePoints(await createBaseDb())

// Thứ Tư 2026-10-21 10:00 giờ Việt Nam; tuần hiện tại bắt đầu thứ Hai 2026-10-19 00:00 (+07).
const NOW = '2026-10-21 10:00:00+07'

// Tạo n ván bằng superuser, ván thứ i kết thúc lúc `at` - i giây.
async function addRun(
  db: PGlite,
  user: string,
  game: string,
  mode: string,
  v: { at?: string; won?: boolean; assisted?: boolean; status?: string; n?: number } = {},
) {
  await db.query(
    `insert into runs (user_id, game_id, mode, started_at, ended_at, score, won, assisted, status)
     select $1, $2, $3, $4::timestamptz - interval '1 minute' - i * interval '1 second', $4::timestamptz - i * interval '1 second',
            1, $5, $6, $7
     from generate_series(1, $8::int) i`,
    [user, game, mode, v.at ?? NOW, v.won ?? false, v.assisted ?? false, v.status ?? 'finished', v.n ?? 1],
  )
}

const board = async (db: PGlite, game: string, period: string, limit: number | null = 50, now = NOW) =>
  (await db.query<any>('select * from _game_points_board_at($1, $2, $3, $4)', [game, period, limit, now])).rows.map((r) => [
    r.rank,
    r.display_name,
    Number(r.value),
  ])

const tops = async (db: PGlite, period: string, limit: number | null = 3, now = NOW) =>
  (await db.query<any>('select * from _top_boards_at($1, $2, $3)', [period, limit, now])).rows.map((r) => [
    r.game_id,
    r.mode,
    r.rank,
    r.display_name,
    Number(r.value),
  ])

describe('game_points_board', () => {
  it('counts only that game, across all modes, doubling unassisted wins', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, a, 'caro', 'easy', { won: true }) // 30
    await addRun(db, a, 'caro', 'hard', { won: true, assisted: true }) // 15
    await addRun(db, a, 'caro', 'medium', { won: false }) // 15
    await addRun(db, a, 'caro', 'easy', { won: true, status: 'rejected' })
    await addRun(db, b, '2048', '4x4', { n: 3 }) // 15 ở 2048
    expect(await board(db, 'caro', 'all')).toEqual([[1, 'Alice', 60]])
    expect(await board(db, '2048', 'all')).toEqual([[1, 'Bob', 15]])
    // Huy hiệu không tính vào điểm game.
    const ev = (
      await db.query<any>(
        `insert into events (title, game_id, mode, agg, starts_at, ends_at, status)
         values ('{"en":"Cup"}'::jsonb, 'caro', 'easy', 'best', now() - interval '2 days', now() - interval '1 day', 'closed') returning id`,
      )
    ).rows[0].id
    await db.query('insert into badges (user_id, event_id, rank, awarded_at) values ($1, $2, 1, $3)', [b, ev, NOW])
    expect(await board(db, 'caro', 'all')).toEqual([[1, 'Alice', 60]])
  })

  it('caps at 20 counted runs per user per game per Vietnam day', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    await addRun(db, a, '2048', '4x4', { n: 21, at: '2026-10-21 09:00:00+07' })
    expect(await board(db, '2048', 'all')).toEqual([[1, 'Alice', 100]])
    await addRun(db, a, '2048', '3x3', { at: '2026-10-21 09:30:00+07' })
    expect(await board(db, '2048', 'all')).toEqual([[1, 'Alice', 100]])
    await addRun(db, a, '2048', '3x3', { at: '2026-10-22 00:00:30+07' })
    expect(await board(db, '2048', 'all')).toEqual([[1, 'Alice', 105]])
    // Giới hạn tính riêng từng game.
    await addRun(db, a, 'phagach', 'default', { at: '2026-10-21 09:45:00+07' })
    expect(await board(db, 'phagach', 'all')).toEqual([[1, 'Alice', 5]])
  })

  it('buckets by day and Monday-based week, ties to whoever got there first', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const c = await newUser(db, { full_name: 'Cam' })
    await addRun(db, a, 'caro', 'easy', { at: '2026-10-21 09:00:00+07' }) // hôm nay 15
    await addRun(db, b, 'caro', 'easy', { at: '2026-10-21 08:00:00+07' }) // hôm nay 15, sớm hơn
    await addRun(db, b, 'caro', 'easy', { won: true, at: '2026-10-19 00:10:00+07' }) // tuần này 30
    await addRun(db, c, 'caro', 'easy', { won: true, n: 4, at: '2026-10-18 23:59:00+07' }) // tuần trước 120
    expect(await board(db, 'caro', 'day')).toEqual([
      [1, 'Bob', 15],
      [2, 'Alice', 15],
    ])
    expect(await board(db, 'caro', 'week')).toEqual([
      [1, 'Bob', 45],
      [2, 'Alice', 15],
    ])
    expect(await board(db, 'caro', 'all')).toEqual([
      [1, 'Cam', 120],
      [2, 'Bob', 45],
      [3, 'Alice', 15],
    ])
    expect(await board(db, 'caro', 'all', 0)).toHaveLength(1)
    await expect(board(db, 'caro', 'month')).rejects.toThrow(/bad_period/)
  })

  it('excludes banned and zero-point players; hidden game is empty, unknown game is an error', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const c = await newUser(db, { full_name: 'Cam' })
    await addRun(db, a, 'caro', 'easy', { won: true, at: '2026-10-21 08:00:00+07' })
    await addRun(db, b, 'caro', 'easy', { won: true, n: 2 })
    await addRun(db, c, 'caro', 'easy', { won: true })
    await db.query('update profiles set banned = true where id = $1', [b])
    expect(await board(db, 'caro', 'all')).toEqual([
      [1, 'Alice', 30],
      [2, 'Cam', 30],
    ])
    // Game 0 điểm: có ván nhưng không ai có điểm.
    await db.query("update games set points = 0 where id = 'xepbai'")
    await addRun(db, c, 'xepbai', 'draw1', { won: true })
    expect(await board(db, 'xepbai', 'all')).toEqual([])
    await db.query("update games set hidden = true where id = 'caro'")
    expect(await board(db, 'caro', 'all')).toEqual([])
    await expect(board(db, 'nope', 'all')).rejects.toThrow(/unknown_game/)
  })

  it('anon and authenticated can call game_points_board (uses now())', async () => {
    const db = await createDb()
    const g = await newUser(db, { anonymous: true })
    await addRun(db, g, 'caro', 'easy', { won: true, at: new Date().toISOString() })
    for (const run of [(fn: () => Promise<any>) => asAnon(db, fn), (fn: () => Promise<any>) => asUser(db, g, fn)]) {
      const rows = (await run(() => db.query<any>("select * from game_points_board('caro', 'day')"))).rows
      expect(rows.map((r: any) => [r.rank, r.user_id, Number(r.value), !!r.achieved_at])).toEqual([[1, g, 30, true]])
    }
  })
})

describe('my_game_points', () => {
  it("returns the caller's rank and points, empty when zero or banned; anon cannot call it", async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const c = await newUser(db, { full_name: 'Cam' })
    const t = new Date().toISOString()
    await addRun(db, a, 'caro', 'easy', { at: t })
    await addRun(db, b, 'caro', 'easy', { won: true, at: t })
    await addRun(db, c, 'caro', 'easy', { won: true, n: 3, at: t })
    await db.query('update profiles set banned = true where id = $1', [c])
    const mine = async (uid: string, game = 'caro', period = 'all') =>
      (await asUser(db, uid, () => db.query<any>('select * from my_game_points($1, $2)', [game, period]))).rows.map((r) => [
        r.rank,
        Number(r.value),
      ])
    expect(await mine(a)).toEqual([[2, 15]])
    expect(await mine(b)).toEqual([[1, 30]])
    expect(await mine(c)).toEqual([])
    expect(await mine(a, '2048')).toEqual([])
    await expect(mine(a, 'nope')).rejects.toThrow(/unknown_game/)
    await expect(asAnon(db, () => db.query("select * from my_game_points('caro', 'all')"))).rejects.toThrow(/permission denied/)
  })
})

describe('top_boards (points)', () => {
  it('returns the top N by points for every visible game with mode = points', async () => {
    const db = await createDb()
    const u = [] as string[]
    for (const n of ['Ann', 'Ben', 'Cat', 'Dee']) u.push(await newUser(db, { full_name: n }))
    await addRun(db, u[0], '2048', '3x3', { n: 2 }) // 10
    await addRun(db, u[1], '2048', '5x5', { n: 4 }) // 20
    await addRun(db, u[2], '2048', '4x4', { n: 3 }) // 15
    await addRun(db, u[3], '2048', '4x4', { n: 1 }) // 5
    await addRun(db, u[0], 'minesweeper', 'daily', { won: true }) // 10
    await addRun(db, u[1], 'minesweeper', 'easy', { won: true, assisted: true }) // 5
    await addRun(db, u[2], 'ran', 'classic-slow', { n: 5 })
    await db.query("update games set hidden = true where id = 'ran'")
    expect(await tops(db, 'all')).toEqual([
      ['2048', 'points', 1, 'Ben', 20],
      ['2048', 'points', 2, 'Cat', 15],
      ['2048', 'points', 3, 'Ann', 10],
      ['minesweeper', 'points', 1, 'Ann', 10],
      ['minesweeper', 'points', 2, 'Ben', 5],
    ])
    expect(await tops(db, 'day', 1)).toEqual([
      ['2048', 'points', 1, 'Ben', 20],
      ['minesweeper', 'points', 1, 'Ann', 10],
    ])
    expect(await tops(db, 'all', 0)).toHaveLength(2)
    expect(await tops(db, 'week', 3, '2026-10-26 08:00:00+07')).toEqual([])
    await expect(tops(db, 'month')).rejects.toThrow(/bad_period/)
  })

  it('clamps the limit to 1..10', async () => {
    const db = await createDb()
    await db.query(`insert into auth.users (raw_user_meta_data)
                    select jsonb_build_object('full_name', 'User ' || i) from generate_series(1, 12) i`)
    await db.query(`insert into runs (user_id, game_id, mode, started_at, ended_at, score, status)
                    select id, '2048', '3x3', now() - interval '2 minutes', now() - interval '1 minute', 10, 'finished' from profiles`)
    const now = new Date().toISOString()
    expect(await tops(db, 'all', 50, now)).toHaveLength(10)
    expect(await tops(db, 'all', null, now)).toHaveLength(3)
  })

  it('anon and authenticated can call top_boards (uses now())', async () => {
    const db = await createDb()
    const g = await newUser(db, { anonymous: true })
    await addRun(db, g, '2048', '3x3', { at: new Date().toISOString() })
    for (const run of [(fn: () => Promise<any>) => asAnon(db, fn), (fn: () => Promise<any>) => asUser(db, g, fn)]) {
      const rows = (await run(() => db.query<any>("select * from top_boards('week')"))).rows
      expect(rows.map((r: any) => [r.game_id, r.mode, r.rank, r.user_id, Number(r.value), !!r.achieved_at])).toEqual([
        ['2048', 'points', 1, g, 5, true],
      ])
    }
  })
})

describe('privileges', () => {
  it('internal helpers are closed; public RPCs are scoped', async () => {
    const db = await createDb()
    const p = async (role: string, fn: string) =>
      (await db.query<any>('select has_function_privilege($1, $2, $3) as ok', [role, fn, 'execute'])).rows[0].ok
    for (const role of ['anon', 'authenticated']) {
      for (const fn of [
        '_counted_runs_at(text, timestamptz, uuid, text)',
        '_game_points_rank_at(text, text, timestamptz)',
        '_game_points_board_at(text, text, int, timestamptz)',
      ]) {
        expect(await p(role, `public.${fn}`)).toBe(false)
      }
      expect(await p(role, 'public.game_points_board(text, text, int)')).toBe(true)
      expect(await p(role, 'public.top_boards(text, int)')).toBe(true)
    }
    expect(await p('anon', 'public.my_game_points(text, text)')).toBe(false)
    expect(await p('authenticated', 'public.my_game_points(text, text)')).toBe(true)
  })
})
