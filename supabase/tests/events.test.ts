import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb, newUser } from './harness'

// Tạo sự kiện bằng superuser; thời gian tương đối với now() (chuỗi interval, có thể âm).
async function addEvent(
  db: PGlite,
  v: { game?: string; mode?: string; agg?: string; startsAgo?: string; endsIn?: string; awardTop?: number; status?: string } = {},
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into events (title, game_id, mode, agg, starts_at, ends_at, award_top, status)
     values ('{"en":"Cup","vi":"Giải"}'::jsonb, $1, $2, $3, now() - $4::interval, now() + $5::interval, $6, $7) returning id`,
    [v.game ?? '2048', v.mode ?? '4x4', v.agg ?? 'best', v.startsAgo ?? '2 hours', v.endsIn ?? '1 hour', v.awardTop ?? 3, v.status ?? 'scheduled'],
  )
  return r.rows[0].id
}

// Tạo ván đã kết thúc bằng superuser; startedAgo/endedAgo là interval lùi từ now().
async function addRun(
  db: PGlite,
  user: string,
  game: string,
  mode: string,
  v: { score?: number; time?: number; won?: boolean; assisted?: boolean; startedAgo?: string; endedAgo?: string; status?: string },
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into runs (user_id, game_id, mode, started_at, ended_at, score, time_ms, won, assisted, status)
     values ($1, $2, $3, now() - $4::interval, now() - $5::interval, $6, $7, $8, $9, $10) returning id`,
    [
      user, game, mode, v.startedAgo ?? '31 minutes', v.endedAgo ?? '30 minutes',
      v.score ?? null, v.time ?? null, v.won ?? null, v.assisted ?? false, v.status ?? 'finished',
    ],
  )
  return r.rows[0].id
}

const names = async (db: PGlite, id: string) => {
  const rows = (await db.query<any>('select p.display_name as name, b.value from _event_board($1) b join profiles p on p.id = b.user_id order by b.rank', [id])).rows
  return rows.map((r) => [r.name, Number(r.value)])
}

const leaderboard = (db: PGlite, id: string) =>
  asAnon(db, async () =>
    (await db.query<any>('select * from event_leaderboard($1)', [id])).rows.map((r) => [r.rank, r.display_name, Number(r.value)]),
  )

const count = async (db: PGlite, table: string, id: string) =>
  Number((await db.query<any>(`select count(*) as n from ${table} where event_id = $1`, [id])).rows[0].n)

describe('events tables', () => {
  it('anyone reads events, results, badges and collections; nobody writes them directly', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const ev = await addEvent(db)
    await db.query('insert into event_results (event_id, user_id, rank, value) values ($1, $2, 1, 5)', [ev, a])
    await db.query('insert into badges (user_id, event_id, rank) values ($1, $2, 1)', [a, ev])
    await db.query(`insert into collections (title, starts_at) values ('{"en":"C"}'::jsonb, now())`)
    const writes: Record<string, string[]> = {
      events: [
        `insert into events (title, game_id, mode, agg, starts_at, ends_at) values ('{"en":"x"}', '2048', '4x4', 'best', now(), now() + interval '1 hour')`,
        `update events set award_top = 1`,
        `delete from events`,
      ],
      event_results: [
        `insert into event_results (event_id, user_id, rank, value) values ('${ev}', '${a}', 2, 1)`,
        `update event_results set rank = 2`,
        `delete from event_results`,
      ],
      badges: [
        `insert into badges (user_id, event_id, rank) values ('${a}', '${ev}', 2)`,
        `update badges set rank = 2`,
        `delete from badges`,
      ],
      collections: [
        `insert into collections (title, starts_at) values ('{"en":"x"}', now())`,
        `update collections set sort = 1`,
        `delete from collections`,
      ],
    }
    for (const run of [(fn: () => Promise<any>) => asAnon(db, fn), (fn: () => Promise<any>) => asUser(db, a, fn)]) {
      for (const [table, stmts] of Object.entries(writes)) {
        expect((await run(() => db.query<any>(`select count(*) as n from ${table}`))).rows[0].n).toBeDefined()
        for (const s of stmts) await expect(run(() => db.query(s))).rejects.toThrow(/permission denied/)
      }
    }
    expect(Number((await asAnon(db, () => db.query<any>('select count(*) as n from events'))).rows[0].n)).toBe(1)
    expect(Number((await asAnon(db, () => db.query<any>('select count(*) as n from collections'))).rows[0].n)).toBe(1)
  })

  it('is_admin is true only for admins', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const q = async () => (await db.query<any>('select is_admin() as v')).rows[0].v
    expect(await asAnon(db, q)).toBe(false)
    expect(await asUser(db, a, q)).toBe(false)
    await db.query("update profiles set role = 'admin' where id = $1", [a])
    expect(await asUser(db, a, q)).toBe(true)
  })

  it('migration works without pg_cron', async () => {
    const db = await createDb()
    expect(Number((await db.query<any>("select count(*) as n from pg_namespace where nspname = 'cron'")).rows[0].n)).toBe(0)
  })
})

describe('event board', () => {
  it('counts only runs fully inside the window', async () => {
    const db = await createDb()
    const [a, b, c, d] = [
      await newUser(db, { full_name: 'Alice' }),
      await newUser(db, { full_name: 'Bob' }),
      await newUser(db, { full_name: 'Cara' }),
      await newUser(db, { full_name: 'Dan' }),
    ]
    const ev = await addEvent(db)
    await addRun(db, a, '2048', '4x4', { score: 500 })
    await addRun(db, b, '2048', '4x4', { score: 900, startedAgo: '3 hours', endedAgo: '1 hour' })
    await addRun(db, c, '2048', '3x3', { score: 800 })
    await addRun(db, d, '2048', '4x4', { score: 999, status: 'rejected' })
    expect(await names(db, ev)).toEqual([['Alice', 500]])
  })

  it('sum adds scores and counts wins', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const e1 = await addEvent(db, { agg: 'sum' })
    await addRun(db, a, '2048', '4x4', { score: 100, startedAgo: '50 minutes', endedAgo: '40 minutes' })
    await addRun(db, a, '2048', '4x4', { score: 300 })
    expect(await names(db, e1)).toEqual([['Alice', 400]])
    const e2 = await addEvent(db, { game: 'caro', mode: 'easy', agg: 'sum' })
    await addRun(db, a, 'caro', 'easy', { won: true, startedAgo: '50 minutes', endedAgo: '49 minutes' })
    await addRun(db, a, 'caro', 'easy', { won: true, startedAgo: '40 minutes', endedAgo: '39 minutes' })
    await addRun(db, a, 'caro', 'easy', { won: false })
    await addRun(db, a, 'caro', 'easy', { won: true, assisted: true })
    expect(await names(db, e2)).toEqual([['Alice', 2]])
  })

  it('time_low best keeps the fastest unassisted win', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const c = await newUser(db, { full_name: 'Cara' })
    const ev = await addEvent(db, { game: 'minesweeper', mode: 'easy' })
    await addRun(db, a, 'minesweeper', 'easy', { time: 90000, won: true })
    await addRun(db, a, 'minesweeper', 'easy', { time: 30000, won: true, assisted: true })
    await addRun(db, b, 'minesweeper', 'easy', { time: 10000, won: false })
    await addRun(db, c, 'minesweeper', 'easy', { time: 40000, won: true })
    expect(await names(db, ev)).toEqual([['Cara', 40000], ['Alice', 90000]])
  })

  it('ties go to whoever got there first', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const ev = await addEvent(db)
    await addRun(db, a, '2048', '4x4', { score: 500, startedAgo: '11 minutes', endedAgo: '10 minutes' })
    await addRun(db, b, '2048', '4x4', { score: 500, startedAgo: '61 minutes', endedAgo: '60 minutes' })
    expect(await names(db, ev)).toEqual([['Bob', 500], ['Alice', 500]])
  })

  it('banned players are left out', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const ev = await addEvent(db)
    await addRun(db, a, '2048', '4x4', { score: 500 })
    await db.query('update profiles set banned = true where id = $1', [a])
    expect(await names(db, ev)).toEqual([])
  })
})

describe('closing', () => {
  it('tick moves scheduled to live and closes ended events once', async () => {
    const db = await createDb()
    const [a, b, c] = [
      await newUser(db, { full_name: 'Alice' }),
      await newUser(db, { full_name: 'Bob' }),
      await newUser(db, { full_name: 'Cara' }),
    ]
    const started = await addEvent(db, { startsAgo: '1 hour', endsIn: '1 hour' })
    const future = await addEvent(db, { startsAgo: '-1 hour', endsIn: '2 hours' })
    const ended = await addEvent(db, { startsAgo: '3 hours', endsIn: '-1 hour', awardTop: 2 })
    const run = (u: string, s: number) =>
      addRun(db, u, '2048', '4x4', { score: s, startedAgo: '2 hours 31 minutes', endedAgo: '2 hours 30 minutes' })
    await run(a, 300)
    await run(b, 200)
    await run(c, 100)
    const tick = async () => Number((await db.query<any>('select _tick_events(now()) as n')).rows[0].n)
    const status = async (id: string) => (await db.query<any>('select status from events where id = $1', [id])).rows[0].status
    expect(await tick()).toBe(1)
    expect(await status(started)).toBe('live')
    expect(await status(future)).toBe('scheduled')
    expect(await status(ended)).toBe('closed')
    expect(await count(db, 'event_results', ended)).toBe(3)
    expect(await count(db, 'badges', ended)).toBe(2)
    expect(await tick()).toBe(0)
    expect(await count(db, 'event_results', ended)).toBe(3)
    expect(await count(db, 'badges', ended)).toBe(2)
  })

  it('closed results are frozen', async () => {
    const db = await createDb()
    const [a, b, c] = [
      await newUser(db, { full_name: 'Alice' }),
      await newUser(db, { full_name: 'Bob' }),
      await newUser(db, { full_name: 'Cara' }),
    ]
    const ev = await addEvent(db, { startsAgo: '3 hours', endsIn: '-1 hour' })
    const ra = await addRun(db, a, '2048', '4x4', { score: 900, startedAgo: '2 hours 31 minutes', endedAgo: '2 hours 30 minutes' })
    await addRun(db, b, '2048', '4x4', { score: 700, startedAgo: '2 hours 31 minutes', endedAgo: '2 hours 30 minutes' })
    await addRun(db, c, '2048', '4x4', { score: 500, startedAgo: '2 hours 31 minutes', endedAgo: '2 hours 30 minutes' })
    await db.query('select _tick_events(now())')
    const frozen = [[1, 'Alice', 900], [2, 'Bob', 700], [3, 'Cara', 500]]
    expect(await leaderboard(db, ev)).toEqual(frozen)
    await db.query("update runs set status = 'rejected' where id = $1", [ra])
    await db.query('update profiles set banned = true where id = $1', [b])
    expect(await leaderboard(db, ev)).toEqual(frozen)
    await db.query('select _close_event($1)', [ev])
    expect(await leaderboard(db, ev)).toEqual([[1, 'Cara', 500]])
    expect(await count(db, 'event_results', ev)).toBe(1)
    expect(await count(db, 'badges', ev)).toBe(1)
  })

  it('an overdue event that is not closed yet ranks the same as after closing', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const ev = await addEvent(db, { startsAgo: '2 hours', endsIn: '-10 minutes', status: 'live' })
    await addRun(db, a, '2048', '4x4', { score: 100, startedAgo: '31 minutes', endedAgo: '30 minutes' })
    await addRun(db, b, '2048', '4x4', { score: 900, startedAgo: '20 minutes', endedAgo: '5 minutes' })
    const before = await leaderboard(db, ev)
    expect(before).toEqual([[1, 'Alice', 100]])
    expect(Number((await db.query<any>('select _tick_events(now()) as n')).rows[0].n)).toBe(1)
    expect(await leaderboard(db, ev)).toEqual(before)
  })

  it('cancelled events have no board and are never closed', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const ev = await addEvent(db, { status: 'cancelled', startsAgo: '3 hours', endsIn: '-1 hour' })
    await addRun(db, a, '2048', '4x4', { score: 100, startedAgo: '2 hours 31 minutes', endedAgo: '2 hours 30 minutes' })
    expect(await leaderboard(db, ev)).toEqual([])
    expect(Number((await db.query<any>('select _tick_events(now()) as n')).rows[0].n)).toBe(0)
    expect((await db.query<any>('select status from events where id = $1', [ev])).rows[0].status).toBe('cancelled')
    expect(await count(db, 'event_results', ev)).toBe(0)
  })

  it('award_top 0 gives no badges', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const ev = await addEvent(db, { startsAgo: '3 hours', endsIn: '-1 hour', awardTop: 0 })
    await addRun(db, a, '2048', '4x4', { score: 100, startedAgo: '2 hours 31 minutes', endedAgo: '2 hours 30 minutes' })
    await db.query('select _tick_events(now())')
    expect(await count(db, 'event_results', ev)).toBe(1)
    expect(await count(db, 'badges', ev)).toBe(0)
  })

  it("profile_badges lists a player's badges with the event title", async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const ev = await addEvent(db, { startsAgo: '3 hours', endsIn: '-1 hour' })
    await addRun(db, a, '2048', '4x4', { score: 100, startedAgo: '2 hours 31 minutes', endedAgo: '2 hours 30 minutes' })
    await db.query('select _tick_events(now())')
    const rows = (await asAnon(db, () => db.query<any>('select * from profile_badges($1)', [a]))).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ event_id: ev, rank: 1, title: { en: 'Cup', vi: 'Giải' }, game_id: '2048', mode: '4x4' })
    expect(rows[0].awarded_at).toBeTruthy()
  })

  it('event_leaderboard clamps the limit', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const ev = await addEvent(db)
    await addRun(db, a, '2048', '4x4', { score: 2 })
    await addRun(db, b, '2048', '4x4', { score: 1 })
    const n = async (l: number) =>
      (await asAnon(db, () => db.query<any>('select * from event_leaderboard($1, $2)', [ev, l]))).rows.length
    expect(await n(0)).toBe(1)
    expect(await n(-3)).toBe(1)
    expect(await n(1000)).toBe(2)
  })
})

describe('_event_phase', () => {
  it('covers each phase', async () => {
    const db = await createDb()
    const ev = await addEvent(db, { startsAgo: '1 hour', endsIn: '1 hour' })
    const phase = async (shift = '0 seconds') =>
      (await db.query<any>('select _event_phase(e, now() + $2::interval) as p from events e where id = $1', [ev, shift])).rows[0].p
    expect(await phase('-2 hours')).toBe('upcoming')
    expect(await phase()).toBe('live')
    expect(await phase('2 hours')).toBe('ended')
    await db.query("update events set status = 'closed' where id = $1", [ev])
    expect(await phase()).toBe('ended')
    await db.query("update events set status = 'cancelled' where id = $1", [ev])
    expect(await phase()).toBe('cancelled')
  })
})

describe('privileges', () => {
  it('internal helpers are not executable, public RPCs are scoped', async () => {
    const db = await createDb()
    const p = async (role: string, fn: string) =>
      (await db.query<any>('select has_function_privilege($1, $2, $3) as ok', [role, fn, 'execute'])).rows[0].ok
    for (const role of ['anon', 'authenticated']) {
      for (const fn of [
        '_event_phase(public.events, timestamptz)',
        '_event_board(uuid)',
        '_close_event(uuid)',
        '_tick_events(timestamptz)',
        'tick_events()',
      ]) {
        expect(await p(role, `public.${fn}`)).toBe(false)
      }
      for (const fn of ['is_admin()', 'event_leaderboard(uuid, int)', 'profile_badges(uuid)']) {
        expect(await p(role, `public.${fn}`)).toBe(true)
      }
    }
  })
})
