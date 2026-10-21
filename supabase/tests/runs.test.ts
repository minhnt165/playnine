import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb, newUser } from './harness'

// Tạo ván đã kết thúc bằng superuser (bỏ qua RPC) để dựng dữ liệu bảng xếp hạng.
async function addRun(
  db: PGlite,
  user: string,
  game: string,
  mode: string,
  v: { score?: number; time?: number; won?: boolean; assisted?: boolean; ago?: string; status?: string },
) {
  await db.query(
    `insert into runs (user_id, game_id, mode, started_at, ended_at, score, time_ms, won, assisted, status)
     values ($1, $2, $3, now() - $4::interval - interval '1 minute', now() - $4::interval, $5, $6, $7, $8, $9)`,
    [user, game, mode, v.ago ?? '0 seconds', v.score ?? null, v.time ?? null, v.won ?? null, v.assisted ?? false, v.status ?? 'finished'],
  )
}

// Tạo ván đang mở với started_at lùi `ago` (superuser).
async function openRun(db: PGlite, user: string, game: string, mode: string, ago: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    'insert into runs (user_id, game_id, mode, started_at) values ($1, $2, $3, now() - $4::interval) returning id',
    [user, game, mode, ago],
  )
  return r.rows[0].id
}

const finish = (db: PGlite, user: string, id: string, score: number | null, time: number | null, won: boolean, assisted = false) =>
  asUser(db, user, async () =>
    (await db.query<{ r: any }>('select finish_run($1, $2, $3, $4, $5) as r', [id, score, time, won, assisted])).rows[0].r,
  )

const board = (db: PGlite, g: string, m: string, p: string) =>
  asAnon(db, async () =>
    (await db.query<any>('select * from leaderboard($1, $2, $3)', [g, m, p])).rows.map((r) => ({
      rank: r.rank,
      name: r.display_name,
      value: Number(r.value),
    })),
  )

describe('start_run', () => {
  it('start_run creates an open run', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const id = await asUser(db, a, async () => (await db.query<any>("select start_run('2048', '4x4') as id")).rows[0].id)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    const r = (await db.query<any>('select * from runs where id = $1', [id])).rows[0]
    expect(r.status).toBe('started')
    expect(r.user_id).toBe(a)
    await expect(asUser(db, a, () => db.query("select start_run('2048', 'nope')"))).rejects.toThrow(/unknown_game_or_mode/)
    await expect(asUser(db, a, () => db.query("select start_run('nope', '4x4')"))).rejects.toThrow(/unknown_game_or_mode/)
    await expect(asAnon(db, () => db.query("select start_run('2048', '4x4')"))).rejects.toThrow()
    const b = await newUser(db, { full_name: 'Bob' })
    await db.query('update profiles set banned = true where id = $1', [b])
    await expect(asUser(db, b, () => db.query("select start_run('2048', '4x4')"))).rejects.toThrow(/banned/)
  })
})

describe('finish_run', () => {
  it('finish_run accepts a plausible score and returns ranks', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const id = await openRun(db, a, '2048', '4x4', '60 seconds')
    const r = await finish(db, a, id, 5000, null, false)
    expect(r).toEqual({ status: 'finished', reason: null, ranks: { week: 1, all: 1 } })
    const row = (await db.query<any>('select * from runs where id = $1', [id])).rows[0]
    expect(row.status).toBe('finished')
    expect(row.ended_at).not.toBeNull()
    expect(Number(row.score)).toBe(5000)
  })

  describe('rejects each implausible run', () => {
    const cases: {
      reason: string
      game: string
      mode: string
      ago: string
      score: number | null
      time: number | null
      won: boolean
      setup?: (db: PGlite, user: string) => Promise<void>
    }[] = [
      { reason: 'too_fast', game: '2048', mode: '4x4', ago: '0 seconds', score: 100, time: null, won: false },
      { reason: 'missing_value', game: '2048', mode: '4x4', ago: '60 seconds', score: null, time: null, won: false },
      { reason: 'missing_value', game: 'minesweeper', mode: 'easy', ago: '60 seconds', score: null, time: null, won: true },
      { reason: 'time_mismatch', game: 'minesweeper', mode: 'easy', ago: '60 seconds', score: null, time: 100000, won: true },
      { reason: 'time_too_low', game: 'minesweeper', mode: 'easy', ago: '60 seconds', score: null, time: 500, won: true },
      {
        reason: 'score_too_high',
        game: 'tg',
        mode: 'm',
        ago: '60 seconds',
        score: 1001,
        time: null,
        won: false,
        setup: async (db) => {
          await db.query(
            `insert into games (id, metric, modes) values ('tg', 'score_high', '[{"key":"m","rules":{"max_score":1000}}]'::jsonb)`,
          )
        },
      },
      { reason: 'bad_value', game: '2048', mode: '4x4', ago: '60 seconds', score: -5, time: null, won: false },
      { reason: 'bad_value', game: 'minesweeper', mode: 'easy', ago: '60 seconds', score: null, time: -1000, won: true },
      { reason: 'score_rate', game: '2048', mode: '4x4', ago: '10 seconds', score: 30000, time: null, won: false },
      { reason: 'expired', game: '2048', mode: '4x4', ago: '25 hours', score: 100, time: null, won: false },
      {
        reason: 'banned',
        game: '2048',
        mode: '4x4',
        ago: '60 seconds',
        score: 100,
        time: null,
        won: false,
        setup: async (db, u) => {
          await db.query('update profiles set banned = true where id = $1', [u])
        },
      },
    ]
    for (const c of cases) {
      it(`${c.reason} (${c.game}/${c.mode})`, async () => {
        const db = await createDb()
        const a = await newUser(db, { full_name: 'Alice' })
        if (c.setup) await c.setup(db, a)
        const id = await openRun(db, a, c.game, c.mode, c.ago)
        const r = await finish(db, a, id, c.score, c.time, c.won)
        expect(r).toEqual({ status: 'rejected', reason: c.reason, ranks: {} })
        const row = (await db.query<any>('select * from runs where id = $1', [id])).rows[0]
        expect(row.status).toBe('rejected')
        expect(row.reject_reason).toBe(c.reason)
        expect(row.ended_at).not.toBeNull()
      })
    }
  })

  it('finish_run twice is a no-op', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const id = await openRun(db, a, '2048', '4x4', '60 seconds')
    expect((await finish(db, a, id, 5000, null, false)).status).toBe('finished')
    const r = await finish(db, a, id, 9999, null, true)
    expect(r).toEqual({ status: 'rejected', reason: 'not_open', ranks: {} })
    const row = (await db.query<any>('select * from runs where id = $1', [id])).rows[0]
    expect(row.status).toBe('finished')
    expect(Number(row.score)).toBe(5000)
    expect(row.won).toBe(false)
  })

  it("finish_run of another player's run is refused", async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const id = await openRun(db, a, '2048', '4x4', '60 seconds')
    const r = await finish(db, b, id, 5000, null, false)
    expect(r).toEqual({ status: 'rejected', reason: 'not_open', ranks: {} })
    const row = (await db.query<any>('select * from runs where id = $1', [id])).rows[0]
    expect(row.status).toBe('started')
    expect(row.ended_at).toBeNull()
    expect(row.score).toBeNull()
  })

  it('daily mode ranks by day', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, a, 'sudoku', 'daily', { time: 15000, won: true, ago: '25 hours' })
    const id = await openRun(db, b, 'sudoku', 'daily', '60 seconds')
    const r = await finish(db, b, id, null, 20000, true)
    expect(r).toEqual({ status: 'finished', reason: null, ranks: { day: 1 } })
    expect(await board(db, 'sudoku', 'daily', 'day')).toEqual([{ rank: 1, name: 'Bob', value: 20000 }])
    expect((await board(db, 'sudoku', 'daily', 'all')).map((x) => x.name)).toEqual(['Alice', 'Bob'])
  })

  it('lost or assisted runs get no ranks', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const lost = await finish(db, a, await openRun(db, a, 'minesweeper', 'easy', '60 seconds'), null, 20000, false)
    expect(lost).toEqual({ status: 'finished', reason: null, ranks: {} })
    const asst = await finish(db, a, await openRun(db, a, 'minesweeper', 'easy', '60 seconds'), null, 20000, true, true)
    expect(asst).toEqual({ status: 'finished', reason: null, ranks: {} })
  })
})

describe('leaderboard', () => {
  it('a stored extreme negative value does not break the board', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await db.query("insert into runs (user_id, game_id, mode, ended_at, score, status) values ($1, '2048', '4x4', now(), -9223372036854775808, 'finished')", [a])
    await addRun(db, b, '2048', '4x4', { score: 50 })
    expect(await board(db, '2048', '4x4', 'all')).toEqual([
      { rank: 1, name: 'Bob', value: 50 },
      { rank: 2, name: 'Alice', value: -9223372036854776000 },
    ])
  })

  it("score_high board keeps each player's best", async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, a, '2048', '4x4', { score: 100, ago: '3 hours' })
    await addRun(db, a, '2048', '4x4', { score: 300, ago: '2 hours' })
    await addRun(db, b, '2048', '4x4', { score: 200, ago: '1 hour' })
    expect(await board(db, '2048', '4x4', 'all')).toEqual([
      { rank: 1, name: 'Alice', value: 300 },
      { rank: 2, name: 'Bob', value: 200 },
    ])
  })

  it('time_low board ignores losses and assisted runs', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, a, 'minesweeper', 'easy', { time: 90000, won: true })
    await addRun(db, a, 'minesweeper', 'easy', { time: 30000, won: true, assisted: true })
    await addRun(db, b, 'minesweeper', 'easy', { time: 10000, won: false })
    expect(await board(db, 'minesweeper', 'easy', 'all')).toEqual([{ rank: 1, name: 'Alice', value: 90000 }])
  })

  it('time_low board ranks the lower time first', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, a, 'minesweeper', 'easy', { time: 90000, won: true })
    await addRun(db, b, 'minesweeper', 'easy', { time: 40000, won: true })
    expect((await board(db, 'minesweeper', 'easy', 'all')).map((x) => x.name)).toEqual(['Bob', 'Alice'])
  })

  it('wins board counts wins in the period', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, a, 'caro', 'easy', { won: true, ago: '2 seconds' })
    await addRun(db, a, 'caro', 'easy', { won: true, ago: '1 second' })
    await addRun(db, a, 'caro', 'easy', { won: true, ago: '14 days' })
    await addRun(db, a, 'caro', 'easy', { won: false })
    await addRun(db, b, 'caro', 'easy', { won: true })
    expect(await board(db, 'caro', 'easy', 'week')).toEqual([
      { rank: 1, name: 'Alice', value: 2 },
      { rank: 2, name: 'Bob', value: 1 },
    ])
    expect(await board(db, 'caro', 'easy', 'all')).toEqual([
      { rank: 1, name: 'Alice', value: 3 },
      { rank: 2, name: 'Bob', value: 1 },
    ])
  })

  it('ties go to whoever got there first', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, a, '2048', '4x4', { score: 500, ago: '1 hour' })
    await addRun(db, b, '2048', '4x4', { score: 500, ago: '3 hours' })
    expect((await board(db, '2048', '4x4', 'all')).map((x) => [x.rank, x.name])).toEqual([
      [1, 'Bob'],
      [2, 'Alice'],
    ])
  })

  it('week starts Monday in Asia/Ho_Chi_Minh', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    // Chủ nhật 23:30 giờ VN = 16:30 UTC; thứ Hai 00:30 giờ VN = 17:30 UTC.
    await db.query(
      `insert into runs (user_id, game_id, mode, started_at, ended_at, score, status) values
       ($1, '2048', '4x4', '2026-10-25T16:29:00Z', '2026-10-25T16:30:00Z', 100, 'finished'),
       ($2, '2048', '4x4', '2026-10-25T17:29:00Z', '2026-10-25T17:30:00Z', 200, 'finished')`,
      [a, b],
    )
    const at = async (now: string, period = 'week') =>
      (
        await db.query<any>("select display_name from _leaderboard_at('2048', '4x4', $2, 50, $1::timestamptz)", [now, period])
      ).rows.map((r) => r.display_name)
    expect(await at('2026-10-26T01:00:00Z')).toEqual(['Bob'])
    expect(await at('2026-10-25T16:45:00Z')).toEqual(['Alice'])
    expect(await at('2026-10-25T16:45:00Z', 'day')).toEqual(['Alice'])
    expect(await at('2026-10-26T01:00:00Z', 'day')).toEqual(['Bob'])
    expect(await at('2026-10-26T01:00:00Z', 'all')).toEqual(['Bob', 'Alice'])
  })

  it('banned and rejected runs are hidden', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, a, '2048', '4x4', { score: 900 })
    await addRun(db, b, '2048', '4x4', { score: 100 })
    await addRun(db, b, '2048', '4x4', { score: 5000, status: 'rejected' })
    await addRun(db, b, '2048', '4x4', { score: 7000, status: 'started' })
    expect((await board(db, '2048', '4x4', 'all')).map((x) => [x.name, x.value])).toEqual([
      ['Alice', 900],
      ['Bob', 100],
    ])
    await db.query('update profiles set banned = true where id = $1', [a])
    expect((await board(db, '2048', '4x4', 'all')).map((x) => x.name)).toEqual(['Bob'])
  })

  it('limit is clamped to 1..100', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, a, '2048', '4x4', { score: 2 })
    await addRun(db, b, '2048', '4x4', { score: 1 })
    const n = async (l: number) =>
      (await asAnon(db, () => db.query<any>("select * from leaderboard('2048', '4x4', 'all', $1)", [l]))).rows.length
    expect(await n(0)).toBe(1)
    expect(await n(-5)).toBe(1)
    expect(await n(1000)).toBe(2)
  })
})

describe('my_rank and profile_bests', () => {
  it("my_rank returns the caller's row", async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const c = await newUser(db, { full_name: 'Cara' })
    await addRun(db, a, '2048', '4x4', { score: 300 })
    await addRun(db, b, '2048', '4x4', { score: 200 })
    const q = (u: string) =>
      asUser(db, u, async () => (await db.query<any>("select * from my_rank('2048', '4x4', 'all')")).rows)
    const rb = await q(b)
    expect(rb.map((r) => [r.rank, Number(r.value)])).toEqual([[2, 200]])
    expect(await q(c)).toEqual([])
    await expect(asAnon(db, () => db.query("select * from my_rank('2048', '4x4', 'all')"))).rejects.toThrow()
  })

  it('profile_bests lists each game/mode', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    await addRun(db, a, '2048', '4x4', { score: 100, ago: '2 hours' })
    await addRun(db, a, '2048', '4x4', { score: 300, ago: '1 hour' })
    await addRun(db, a, '2048', '3x3', { score: 50 })
    await addRun(db, a, 'minesweeper', 'easy', { time: 90000, won: true })
    await addRun(db, a, 'minesweeper', 'easy', { time: 40000, won: true })
    await addRun(db, a, 'minesweeper', 'easy', { time: 10000, won: true, assisted: true })
    await addRun(db, a, 'caro', 'easy', { won: true })
    await addRun(db, a, 'caro', 'easy', { won: true })
    await addRun(db, a, 'caro', 'easy', { won: false })
    const r = await asAnon(db, () => db.query<any>('select * from profile_bests($1)', [a]))
    const got = r.rows
      .map((x) => [x.game_id, x.mode, x.metric, Number(x.value)])
      .sort((x, y) => String(x[0] + x[1]).localeCompare(String(y[0] + y[1])))
    expect(got).toEqual([
      ['2048', '3x3', 'score_high', 50],
      ['2048', '4x4', 'score_high', 300],
      ['caro', 'easy', 'wins', 2],
      ['minesweeper', 'easy', 'time_low', 40000],
    ])
    expect(r.rows.every((x) => x.achieved_at)).toBe(true)
  })
})

describe('privileges', () => {
  it('internal helpers are not executable, public RPCs are scoped', async () => {
    const db = await createDb()
    const p = async (role: string, fn: string) =>
      (await db.query<any>('select has_function_privilege($1, $2, $3) as ok', [role, fn, 'execute'])).rows[0].ok
    for (const role of ['anon', 'authenticated']) {
      expect(await p(role, 'public._leaderboard_at(text, text, text, int, timestamptz)')).toBe(false)
      expect(await p(role, 'public._board_at(text, text, text, timestamptz)')).toBe(false)
    }
    for (const fn of [
      'start_run(text, text)',
      'finish_run(uuid, bigint, bigint, boolean, boolean)',
      'my_rank(text, text, text)',
    ]) {
      expect(await p('anon', `public.${fn}`)).toBe(false)
      expect(await p('authenticated', `public.${fn}`)).toBe(true)
    }
    for (const fn of ['leaderboard(text, text, text, int)', 'profile_bests(uuid)']) {
      expect(await p('anon', `public.${fn}`)).toBe(true)
      expect(await p('authenticated', `public.${fn}`)).toBe(true)
    }
  })
})
