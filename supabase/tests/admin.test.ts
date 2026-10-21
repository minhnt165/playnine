import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb, newUser } from './harness'

async function makeAdmin(db: PGlite, name = 'Admin'): Promise<string> {
  const id = await newUser(db, { full_name: name })
  await db.query("update profiles set role = 'admin' where id = $1", [id])
  return id
}

// Gọi một câu lệnh với tư cách một người dùng.
const as = <T = any>(db: PGlite, uid: string, sql: string, params: any[] = []) =>
  asUser(db, uid, () => db.query<T>(sql, params))

const iso = (ms: number) => new Date(Date.now() + ms).toISOString()
const HOUR = 3600_000
const NOPE = '00000000-0000-0000-0000-000000000009'

// Sự kiện hợp lệ; ghi đè từng trường qua `over`.
const ev = (over: Record<string, unknown> = {}) => ({
  title: { en: 'Cup', vi: 'Giải' },
  description: { en: 'Desc' },
  game_id: '2048',
  mode: '4x4',
  agg: 'best',
  starts_at: iso(HOUR),
  ends_at: iso(3 * HOUR),
  award_top: 3,
  ...over,
})

const save = (db: PGlite, uid: string, e: unknown) =>
  as<{ id: string }>(db, uid, 'select admin_save_event($1::jsonb) as id', [JSON.stringify(e)]).then((r) => r.rows[0].id)

async function addEvent(
  db: PGlite,
  v: { startsAgo?: string; endsIn?: string; awardTop?: number; status?: string } = {},
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into events (title, game_id, mode, agg, starts_at, ends_at, award_top, status)
     values ('{"en":"Cup"}'::jsonb, '2048', '4x4', 'best', now() - $1::interval, now() + $2::interval, $3, $4) returning id`,
    [v.startsAgo ?? '2 hours', v.endsIn ?? '1 hour', v.awardTop ?? 3, v.status ?? 'scheduled'],
  )
  return r.rows[0].id
}

async function addRun(
  db: PGlite,
  user: string,
  v: { game?: string; mode?: string; score?: number; startedAgo?: string; endedAgo?: string; status?: string } = {},
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into runs (user_id, game_id, mode, started_at, ended_at, score, status)
     values ($1, $2, $3, now() - $4::interval, now() - $5::interval, $6, $7) returning id`,
    [user, v.game ?? '2048', v.mode ?? '4x4', v.startedAgo ?? '31 minutes', v.endedAgo ?? '30 minutes', v.score ?? 100, v.status ?? 'finished'],
  )
  return r.rows[0].id
}

const status = async (db: PGlite, id: string) =>
  (await db.query<any>('select status from events where id = $1', [id])).rows[0].status
const count = async (db: PGlite, table: string, id: string) =>
  Number((await db.query<any>(`select count(*) as n from ${table} where event_id = $1`, [id])).rows[0].n)

describe('admin access', () => {
  it('every admin RPC refuses anon and players', async () => {
    const db = await createDb()
    const player = await newUser(db, { full_name: 'Player' })
    const u = '00000000-0000-0000-0000-000000000001'
    const calls = [
      `admin_update_game('2048', true, '{}'::jsonb)`,
      `admin_save_event('{}'::jsonb)`,
      `admin_cancel_event('${u}')`,
      `admin_recompute_event('${u}')`,
      `admin_save_collection('{}'::jsonb)`,
      `admin_delete_collection('${u}')`,
      `admin_runs()`,
      `admin_reject_run('${u}')`,
      `admin_players()`,
      `admin_set_banned('${u}', true)`,
    ]
    expect(calls).toHaveLength(10)
    for (const c of calls) {
      await expect(asAnon(db, () => db.query(`select * from ${c}`)), c).rejects.toThrow(/permission denied/)
      await expect(as(db, player, `select * from ${c}`), c).rejects.toThrow(/forbidden/)
    }
  })
})

describe('admin_update_game', () => {
  it("hides a game and replaces one mode's rules", async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const modes = async () => (await db.query<any>("select modes from games where id = '2048'")).rows[0].modes
    const hidden = async () => (await db.query<any>("select hidden from games where id = '2048'")).rows[0].hidden
    const before = await modes()
    await as(db, admin, `select admin_update_game('2048', true, '{"4x4":{"max_score":500,"min_time_ms":1}}'::jsonb)`)
    expect(await hidden()).toBe(true)
    const after = await modes()
    expect(after.map((m: any) => m.key)).toEqual(before.map((m: any) => m.key))
    expect(after.map((m: any) => m.label)).toEqual(before.map((m: any) => m.label))
    const rules = (ms: any[], k: string) => ms.find((m) => m.key === k).rules
    expect(rules(after, '4x4')).toEqual({ max_score: 500, min_time_ms: 1 })
    expect(rules(after, '3x3')).toEqual(rules(before, '3x3'))
    expect(rules(after, '5x5')).toEqual(rules(before, '5x5'))
    // p_hidden null giữ nguyên, p_rules rỗng không đổi luật.
    await as(db, admin, `select admin_update_game('2048', null, '{}'::jsonb)`)
    expect(await hidden()).toBe(true)
    expect(await modes()).toEqual(after)
    await as(db, admin, `select admin_update_game('2048', false, null)`)
    expect(await hidden()).toBe(false)
  })

  it('rejects unknown games, modes and bad rules', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const upd = (game: string, rules: string) => as(db, admin, 'select admin_update_game($1, true, $2::jsonb)', [game, rules])
    await expect(upd('nope', '{}')).rejects.toThrow(/unknown_game/)
    await expect(upd('2048', '{"9x9":{}}')).rejects.toThrow(/unknown_mode/)
    await expect(upd('2048', '{"4x4":{"max_score":-1}}')).rejects.toThrow(/bad_rules/)
    await expect(upd('2048', '{"4x4":{"foo":1}}')).rejects.toThrow(/bad_rules/)
    await expect(upd('2048', '{"4x4":{"max_score":"x"}}')).rejects.toThrow(/bad_rules/)
    await expect(upd('2048', '{"4x4":5}')).rejects.toThrow(/bad_rules/)
    expect((await db.query<any>("select hidden from games where id = '2048'")).rows[0].hidden).toBe(false)
  })
})

describe('admin_save_event', () => {
  it('creates and validates', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    await expect(save(db, admin, ev({ title: { en: '   ' } }))).rejects.toThrow(/bad_title/)
    await expect(save(db, admin, ev({ game_id: 'nope' }))).rejects.toThrow(/unknown_game_or_mode/)
    await expect(save(db, admin, ev({ mode: 'nope' }))).rejects.toThrow(/unknown_game_or_mode/)
    await expect(save(db, admin, ev({ game_id: 'minesweeper', mode: 'easy', agg: 'sum' }))).rejects.toThrow(/bad_agg/)
    await expect(save(db, admin, ev({ agg: 'avg' }))).rejects.toThrow(/bad_agg/)
    await expect(save(db, admin, ev({ starts_at: iso(2 * HOUR), ends_at: iso(HOUR) }))).rejects.toThrow(/bad_time/)
    await expect(save(db, admin, ev({ award_top: 101 }))).rejects.toThrow(/bad_award/)
    await expect(save(db, admin, ev({ award_top: -1 }))).rejects.toThrow(/bad_award/)
    expect(Number((await db.query<any>('select count(*) as n from events')).rows[0].n)).toBe(0)
    const id = await save(db, admin, ev({ title: { en: '  Cup  ', vi: ' ' } }))
    const row = (await db.query<any>('select * from events where id = $1', [id])).rows[0]
    expect(row).toMatchObject({ status: 'scheduled', game_id: '2048', mode: '4x4', agg: 'best', award_top: 3 })
    expect(row.title).toEqual({ en: 'Cup' })
    expect(row.description).toEqual({ en: 'Desc' })
    await expect(save(db, admin, ev({ id: NOPE }))).rejects.toThrow(/not_found/)
  })

  it('editing an event follows its phase', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const row = async (id: string) => (await db.query<any>('select * from events where id = $1', [id])).rows[0]

    const up = await save(db, admin, ev())
    await save(db, admin, ev({ id: up, starts_at: iso(2 * HOUR), ends_at: iso(4 * HOUR), game_id: 'caro', mode: 'easy', agg: 'sum' }))
    expect(await row(up)).toMatchObject({ game_id: 'caro', mode: 'easy', agg: 'sum', status: 'scheduled' })

    const live = await addEvent(db, { startsAgo: '1 hour', endsIn: '1 hour', status: 'live' })
    const l = await row(live)
    const startsAt = l.starts_at.toISOString()
    const endsAt = l.ends_at.toISOString()
    const lb = { id: live, title: { en: 'Cup' }, game_id: '2048', mode: '4x4', agg: 'best', award_top: 3, starts_at: startsAt, ends_at: endsAt }
    await expect(save(db, admin, { ...lb, starts_at: iso(-2 * HOUR) })).rejects.toThrow(/event_started/)
    await expect(save(db, admin, { ...lb, game_id: 'caro', mode: 'easy' })).rejects.toThrow(/event_started/)
    await expect(save(db, admin, { ...lb, ends_at: iso(-HOUR / 2) })).rejects.toThrow(/bad_time/)
    const later = iso(5 * HOUR)
    await save(db, admin, { ...lb, title: { en: 'Renamed' }, award_top: 5, ends_at: later })
    const after = await row(live)
    expect(after).toMatchObject({ title: { en: 'Renamed' }, award_top: 5 })
    expect(after.ends_at.toISOString()).toBe(later)

    const closed = await addEvent(db, { startsAgo: '3 hours', endsIn: '-1 hour', status: 'closed' })
    const c = await row(closed)
    const cb = { id: closed, game_id: '2048', mode: '4x4', agg: 'best', starts_at: c.starts_at.toISOString(), ends_at: c.ends_at.toISOString() }
    await expect(save(db, admin, { ...cb, title: { en: 'Cup' }, award_top: 1 })).rejects.toThrow(/event_locked/)
    await save(db, admin, { ...cb, title: { en: 'Final' }, description: { vi: 'Mô tả' }, award_top: 3 })
    expect(await row(closed)).toMatchObject({ title: { en: 'Final' }, description: { vi: 'Mô tả' } })
  })
})

describe('cancel and recompute', () => {
  it('cancel only scheduled or live events', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const closed = await addEvent(db, { startsAgo: '3 hours', endsIn: '-1 hour', status: 'closed' })
    await expect(as(db, admin, 'select admin_cancel_event($1)', [closed])).rejects.toThrow(/event_locked/)
    await expect(as(db, admin, 'select admin_cancel_event($1)', [NOPE])).rejects.toThrow(/not_found/)
    const sched = await addEvent(db, { startsAgo: '-1 hour', endsIn: '2 hours' })
    const live = await addEvent(db, { status: 'live' })
    await as(db, admin, 'select admin_cancel_event($1)', [sched])
    await as(db, admin, 'select admin_cancel_event($1)', [live])
    expect(await status(db, sched)).toBe('cancelled')
    expect(await status(db, live)).toBe('cancelled')
    await expect(as(db, admin, 'select admin_cancel_event($1)', [sched])).rejects.toThrow(/event_locked/)
    // Sự kiện đã hủy dù quá hạn cũng không bị tick đóng.
    await db.query("update events set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = $1", [live])
    await db.query('select _tick_events(now())')
    expect(await status(db, live)).toBe('cancelled')
    expect(await count(db, 'event_results', live)).toBe(0)
  })

  it('recompute only closed events and keeps badges unique', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const users = [await newUser(db, { full_name: 'Alice' }), await newUser(db, { full_name: 'Bob' }), await newUser(db, { full_name: 'Cara' })]
    const e1 = await addEvent(db, { startsAgo: '3 hours', endsIn: '-1 hour', awardTop: 2 })
    for (const [i, u] of users.entries()) {
      await addRun(db, u, { score: 300 - i * 100, startedAgo: '2 hours 31 minutes', endedAgo: '2 hours 30 minutes' })
    }
    await expect(as(db, admin, 'select admin_recompute_event($1)', [e1])).rejects.toThrow(/not_closed/)
    await db.query('select _tick_events(now())')
    expect(await status(db, e1)).toBe('closed')
    await as(db, admin, 'select admin_recompute_event($1)', [e1])
    await as(db, admin, 'select admin_recompute_event($1)', [e1])
    expect(await count(db, 'badges', e1)).toBe(2)
    expect(await count(db, 'event_results', e1)).toBe(3)
    const cancelled = await addEvent(db, { status: 'cancelled' })
    await expect(as(db, admin, 'select admin_recompute_event($1)', [cancelled])).rejects.toThrow(/not_closed/)
  })
})

describe('collections', () => {
  it('CRUD with dedupe, validation and delete', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const saveC = (c: unknown) =>
      as<{ id: string }>(db, admin, 'select admin_save_collection($1::jsonb) as id', [JSON.stringify(c)]).then((r) => r.rows[0].id)
    const col = (over: Record<string, unknown> = {}) => ({
      title: { en: 'Picks', vi: 'Chọn lọc' }, game_ids: ['caro', '2048', 'caro', 'sudoku', '2048'], starts_at: iso(-HOUR), ...over,
    })
    await expect(saveC(col({ title: { en: ' ' } }))).rejects.toThrow(/bad_title/)
    await expect(saveC(col({ game_ids: ['caro', 'nope'] }))).rejects.toThrow(/unknown_game/)
    await expect(saveC(col({ starts_at: iso(HOUR), ends_at: iso(-HOUR) }))).rejects.toThrow(/bad_time/)
    const id = await saveC(col({ sort: 4 }))
    const row = async () => (await db.query<any>('select * from collections where id = $1', [id])).rows[0]
    expect(await row()).toMatchObject({ game_ids: ['caro', '2048', 'sudoku'], sort: 4, ends_at: null, title: { en: 'Picks', vi: 'Chọn lọc' } })
    await saveC({ ...col({ game_ids: ['sudoku'], ends_at: iso(HOUR) }), id })
    expect(await row()).toMatchObject({ game_ids: ['sudoku'], sort: 4 })
    expect((await row()).ends_at).toBeTruthy()
    await expect(saveC({ ...col(), id: NOPE })).rejects.toThrow(/not_found/)
    await as(db, admin, 'select admin_delete_collection($1)', [id])
    expect(Number((await db.query<any>('select count(*) as n from collections')).rows[0].n)).toBe(0)
  })
})

describe('admin_runs', () => {
  it('filters and pages', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    for (let i = 0; i < 5; i++) await addRun(db, a, { startedAgo: `${10 + i} minutes`, endedAgo: `${9 + i} minutes`, score: i })
    await addRun(db, b, { game: 'caro', mode: 'easy', startedAgo: '20 minutes', endedAgo: '19 minutes' })
    await addRun(db, b, { startedAgo: '30 minutes', endedAgo: '29 minutes', status: 'rejected' })
    const q = async (args: string, params: any[] = []) => (await as(db, admin, `select * from admin_runs(${args})`, params)).rows
    const all = await q('')
    expect(all).toHaveLength(7)
    const times = all.map((r: any) => +new Date(r.started_at))
    expect(times).toEqual([...times].sort((x, y) => y - x))
    expect(all[0]).toHaveProperty('display_name')
    expect(await q("p_game_id => 'caro'")).toHaveLength(1)
    expect(await q("p_game_id => '2048', p_mode => '3x3'")).toHaveLength(0)
    expect(await q('p_user_id => $1::uuid', [b])).toHaveLength(2)
    expect(await q("p_status => 'rejected'")).toHaveLength(1)
    expect(await q('p_limit => 0')).toHaveLength(1)
    expect(await q('p_limit => 100000')).toHaveLength(7)
    // Phân trang bằng p_before: không trùng, không sót.
    const seen: string[] = []
    let before: string | null = null
    for (let guard = 0; guard < 10; guard++) {
      const page: any[] = before ? await q('p_before => $1::timestamptz, p_limit => 3', [before]) : await q('p_limit => 3')
      if (!page.length) break
      seen.push(...page.map((r) => r.id))
      before = page[page.length - 1].started_at.toISOString()
    }
    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
  })

  it('admin_reject_run hides the run from every board', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const evId = await addEvent(db, { status: 'live' })
    const top = await addRun(db, a, { score: 900 })
    await addRun(db, b, { score: 100 })
    const lb = async () =>
      (await asAnon(db, () => db.query<any>("select display_name from leaderboard('2048', '4x4', 'all')"))).rows.map((r) => r.display_name)
    const elb = async () =>
      (await asAnon(db, () => db.query<any>('select display_name from event_leaderboard($1)', [evId]))).rows.map((r) => r.display_name)
    expect(await lb()).toEqual(['Alice', 'Bob'])
    expect(await elb()).toEqual(['Alice', 'Bob'])
    await as(db, admin, 'select admin_reject_run($1)', [top])
    expect(await lb()).toEqual(['Bob'])
    expect(await elb()).toEqual(['Bob'])
    const r = (await db.query<any>('select status, reject_reason from runs where id = $1', [top])).rows[0]
    expect(r).toEqual({ status: 'rejected', reject_reason: 'admin' })
    const open = (await db.query<any>("insert into runs (user_id, game_id, mode) values ($1, '2048', '4x4') returning id", [a])).rows[0].id
    await as(db, admin, 'select admin_reject_run($1, $2)', [open, '  cheating '])
    expect((await db.query<any>('select status, reject_reason from runs where id = $1', [open])).rows[0]).toEqual({ status: 'rejected', reject_reason: 'cheating' })
    await expect(as(db, admin, 'select admin_reject_run($1)', [NOPE])).rejects.toThrow(/not_found/)
  })
})

describe('players', () => {
  it('admin_players searches by name or id and escapes wildcards', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db, 'Root')
    const a = await newUser(db, { full_name: 'Alice' })
    await newUser(db, { full_name: 'Bob' })
    await newUser(db, { full_name: 'Al_ice' })
    await addRun(db, a)
    await addRun(db, a)
    const q = async (query: string | null) => (await as(db, admin, 'select * from admin_players($1::text)', [query])).rows
    expect(await q(null)).toHaveLength(4)
    expect(await q('')).toHaveLength(4)
    expect((await q('al')).map((r: any) => r.display_name).sort()).toEqual(['Al_ice', 'Alice'])
    expect(await q('%')).toHaveLength(0)
    expect((await q('_')).map((r: any) => r.display_name)).toEqual(['Al_ice'])
    expect(await q('\\')).toHaveLength(0)
    const byId = await q(a)
    expect(byId).toHaveLength(1)
    expect(byId[0]).toMatchObject({ id: a, display_name: 'Alice', role: 'player', banned: false })
    expect(Number(byId[0].runs)).toBe(2)
    expect((await q(admin))[0].role).toBe('admin')
    expect((await as(db, admin, 'select * from admin_players(null, 2)')).rows).toHaveLength(2)
  })

  it('admin_set_banned bans and unbans, never self', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const a = await newUser(db, { full_name: 'Alice' })
    await addRun(db, a, { score: 50 })
    const lb = async () =>
      (await asAnon(db, () => db.query<any>("select display_name from leaderboard('2048', '4x4', 'all')"))).rows.length
    expect(await lb()).toBe(1)
    await expect(as(db, admin, 'select admin_set_banned($1, true)', [admin])).rejects.toThrow(/cannot_ban_self/)
    await expect(as(db, admin, 'select admin_set_banned($1, true)', [NOPE])).rejects.toThrow(/not_found/)
    await as(db, admin, 'select admin_set_banned($1, true)', [a])
    await expect(as(db, a, "select start_run('2048', '4x4')")).rejects.toThrow(/banned/)
    expect(await lb()).toBe(0)
    await as(db, admin, 'select admin_set_banned($1, false)', [a])
    expect(await lb()).toBe(1)
    await as(db, a, "select start_run('2048', '4x4')")
  })
})
