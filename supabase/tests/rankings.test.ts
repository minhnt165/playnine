import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb, newUser } from './harness'

// Thứ Tư 2026-10-21 10:00 giờ Việt Nam; tuần hiện tại bắt đầu thứ Hai 2026-10-19 00:00 (+07).
const NOW = '2026-10-21 10:00:00+07'

const guestName = (id: string) => 'Guest-' + id.replace(/-/g, '').slice(0, 4).toUpperCase()

const profile = async (db: PGlite, id: string) =>
  (await db.query<any>('select display_name, avatar_url from profiles where id = $1', [id])).rows[0]

// Tạo ván bằng superuser với ended_at tuyệt đối (mặc định là NOW).
async function addRun(
  db: PGlite,
  user: string,
  game: string,
  mode: string,
  v: { at?: string; score?: number; time?: number; won?: boolean; assisted?: boolean; status?: string } = {},
) {
  await db.query(
    `insert into runs (user_id, game_id, mode, started_at, ended_at, score, time_ms, won, assisted, status)
     values ($1, $2, $3, $4::timestamptz - interval '1 minute', $4::timestamptz, $5, $6, $7, $8, $9)`,
    [user, game, mode, v.at ?? NOW, v.score ?? null, v.time ?? null, v.won ?? null, v.assisted ?? false, v.status ?? 'finished'],
  )
}

const players = async (db: PGlite, kind: string, period: string, limit: number | null = 50, now = NOW) =>
  (await db.query<any>('select * from _player_board_at($1, $2, $3, $4)', [kind, period, limit, now])).rows.map((r) => [
    r.rank,
    r.display_name,
    Number(r.value),
  ])

describe('guest profiles', () => {
  it('anonymous users get a Guest-XXXX name; normal users keep the old naming', async () => {
    const db = await createDb()
    const g = await newUser(db, { anonymous: true })
    const p = await profile(db, g)
    expect(p.display_name).toBe(guestName(g))
    expect(p.display_name).toMatch(/^Guest-[0-9A-F]{4}$/)
    expect(p.avatar_url).toBeNull()
    const a = await newUser(db, { full_name: '  Minh Nguyen  ', avatar_url: 'https://a/b.png' })
    expect(await profile(db, a)).toEqual({ display_name: 'Minh Nguyen', avatar_url: 'https://a/b.png' })
    const b = await newUser(db, { email: 'lan.tran@x.com' })
    expect((await profile(db, b)).display_name).toBe('lan.tran')
    const c = await newUser(db, { full_name: 'X' })
    expect((await profile(db, c)).display_name).toBe('Player')
  })

  it('linking Google renames a guest still on the default name and fills the avatar', async () => {
    const db = await createDb()
    const g = await newUser(db, { anonymous: true })
    await db.query(
      `update auth.users set is_anonymous = false, email = 'minh@x.com',
         raw_user_meta_data = '{"full_name":"Minh Nguyen","avatar_url":"https://a/m.png"}'::jsonb where id = $1`,
      [g],
    )
    expect(await profile(db, g)).toEqual({ display_name: 'Minh Nguyen', avatar_url: 'https://a/m.png' })
  })

  it('linking keeps a name the guest chose but still fills the avatar', async () => {
    const db = await createDb()
    const g = await newUser(db, { anonymous: true })
    await asUser(db, g, () => db.query("update profiles set display_name = 'Bao Anh' where id = $1", [g]))
    await db.query(
      `update auth.users set is_anonymous = false,
         raw_user_meta_data = '{"full_name":"Minh Nguyen","avatar_url":"https://a/m.png"}'::jsonb where id = $1`,
      [g],
    )
    expect(await profile(db, g)).toEqual({ display_name: 'Bao Anh', avatar_url: 'https://a/m.png' })
  })

  it('follows the real GoTrue order: identity row, email, then is_anonymous without touching metadata', async () => {
    const db = await createDb()
    const g = await newUser(db, { anonymous: true })
    await db.query(
      `insert into auth.identities (provider_id, user_id, identity_data, provider)
       values ('123', $1, '{"full_name":"Lan Tran","picture":"https://a/l.png","email":"lan@x.com"}'::jsonb, 'google')`,
      [g],
    )
    await db.query("update auth.users set email = 'lan@x.com' where id = $1", [g])
    expect((await profile(db, g)).display_name).toBe(guestName(g))
    await db.query('update auth.users set is_anonymous = false where id = $1', [g])
    expect(await profile(db, g)).toEqual({ display_name: 'Lan Tran', avatar_url: 'https://a/l.png' })
    // Lần đăng nhập Google sau đổi metadata: tên đã không còn là tên khách nên giữ nguyên.
    await db.query(`update auth.users set raw_user_meta_data = '{"full_name":"Someone Else"}'::jsonb where id = $1`, [g])
    expect((await profile(db, g)).display_name).toBe('Lan Tran')
  })

  it('keeps the guest name when linking brings no usable name, and renames once metadata arrives', async () => {
    const db = await createDb()
    const g = await newUser(db, { anonymous: true })
    await db.query('update auth.users set is_anonymous = false where id = $1', [g])
    expect(await profile(db, g)).toEqual({ display_name: guestName(g), avatar_url: null })
    await db.query(`update auth.users set raw_user_meta_data = '{"name":"Hoa Le","avatar_url":"https://a/h.png"}'::jsonb where id = $1`, [g])
    expect(await profile(db, g)).toEqual({ display_name: 'Hoa Le', avatar_url: 'https://a/h.png' })
  })

  it('metadata updates of normal users do not touch their profile', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    await asUser(db, a, () => db.query("update profiles set display_name = 'Al' where id = $1", [a]))
    await db.query(`update auth.users set raw_user_meta_data = '{"full_name":"Alice B","avatar_url":"https://a/x.png"}'::jsonb where id = $1`, [a])
    expect(await profile(db, a)).toEqual({ display_name: 'Al', avatar_url: null })
  })

  it('a guest can start and finish a run and shows up on the leaderboard', async () => {
    const db = await createDb()
    const g = await newUser(db, { anonymous: true })
    const id = await asUser(db, g, async () => (await db.query<any>("select start_run('2048', '4x4') as id")).rows[0].id)
    await db.query("update runs set started_at = now() - interval '60 seconds' where id = $1", [id])
    const r = await asUser(db, g, async () => (await db.query<any>('select finish_run($1, 5000, null, false, false) as r', [id])).rows[0].r)
    expect(r).toEqual({ status: 'finished', reason: null, ranks: { week: 1, all: 1 } })
    const rows = (await asAnon(db, () => db.query<any>("select * from leaderboard('2048', '4x4', 'all')"))).rows
    expect(rows.map((x) => [x.rank, x.display_name, Number(x.value)])).toEqual([[1, guestName(g), 5000]])
  })
})

describe('player_leaderboard', () => {
  it('counts finished runs per Asia/Ho_Chi_Minh day and Monday-based week', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const c = await newUser(db, { full_name: 'Cam' })
    await addRun(db, a, '2048', '4x4', { at: '2026-10-21 00:05:00+07', score: 10 })
    await addRun(db, a, 'caro', 'easy', { at: '2026-10-21 09:00:00+07', won: true })
    await addRun(db, a, '2048', '4x4', { at: '2026-10-21 09:30:00+07', score: 10, status: 'rejected' })
    await db.query("insert into runs (user_id, game_id, mode) values ($1, '2048', '4x4')", [a])
    for (let i = 0; i < 3; i++) await addRun(db, b, 'caro', 'easy', { at: '2026-10-19 00:10:00+07', won: false })
    await addRun(db, b, 'caro', 'easy', { at: '2026-10-18 23:30:00+07', won: false })
    for (let i = 0; i < 5; i++) await addRun(db, c, '2048', '3x3', { at: '2026-10-18 23:59:00+07', score: 1 })
    await addRun(db, c, '2048', '3x3', { at: '2026-10-20 23:59:59+07', score: 1, status: 'rejected' })
    expect(await players(db, 'runs', 'day')).toEqual([[1, 'Alice', 2]])
    expect(await players(db, 'runs', 'week')).toEqual([
      [1, 'Bob', 3],
      [2, 'Alice', 2],
    ])
    expect(await players(db, 'runs', 'all')).toEqual([
      [1, 'Cam', 5],
      [2, 'Bob', 4],
      [3, 'Alice', 2],
    ])
    // Sang thứ Hai tuần sau: tuần mới trống, ngày mới trống.
    expect(await players(db, 'runs', 'week', 50, '2026-10-26 00:00:00+07')).toEqual([])
    expect(await players(db, 'runs', 'day', 50, '2026-10-22 00:00:00+07')).toEqual([])
  })

  it('counts only won, unassisted runs for wins', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await addRun(db, a, 'caro', 'easy', { won: true })
    await addRun(db, a, 'caro', 'easy', { won: true, assisted: true })
    await addRun(db, a, 'caro', 'easy', { won: false })
    await addRun(db, a, 'minesweeper', 'easy', { won: true, time: 5000, at: '2026-10-21 08:00:00+07' })
    await addRun(db, b, 'caro', 'easy', { won: true, at: '2026-10-20 10:00:00+07' })
    await addRun(db, b, 'caro', 'easy', { won: true, at: '2026-10-01 10:00:00+07' })
    await addRun(db, b, 'caro', 'easy', { won: true, at: '2026-10-01 11:00:00+07' })
    expect(await players(db, 'wins', 'day')).toEqual([[1, 'Alice', 2]])
    expect(await players(db, 'wins', 'week')).toEqual([
      [1, 'Alice', 2],
      [2, 'Bob', 1],
    ])
    expect(await players(db, 'wins', 'all')).toEqual([
      [1, 'Bob', 3],
      [2, 'Alice', 2],
    ])
  })

  it('excludes banned players and hidden games; ties go to whoever got there first', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const c = await newUser(db, { full_name: 'Cam' })
    const d = await newUser(db, { full_name: 'Dan' })
    await addRun(db, a, 'caro', 'easy', { won: true, at: '2026-10-21 09:00:00+07' })
    await addRun(db, b, 'caro', 'easy', { won: true, at: '2026-10-21 08:00:00+07' })
    for (let i = 0; i < 4; i++) await addRun(db, c, 'caro', 'easy', { won: true })
    await addRun(db, d, 'xepbai', 'draw1', { won: true })
    await db.query('update profiles set banned = true where id = $1', [c])
    await db.query("update games set hidden = true where id = 'xepbai'")
    expect(await players(db, 'runs', 'day')).toEqual([
      [1, 'Bob', 1],
      [2, 'Alice', 1],
    ])
    expect(await players(db, 'wins', 'all')).toEqual([
      [1, 'Bob', 1],
      [2, 'Alice', 1],
    ])
  })

  it('ranks event badges all-time only', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    const c = await newUser(db, { full_name: 'Cam' })
    const ev = async () =>
      (
        await db.query<any>(
          `insert into events (title, game_id, mode, agg, starts_at, ends_at, status)
           values ('{"en":"Cup"}'::jsonb, '2048', '4x4', 'best', now() - interval '2 days', now() - interval '1 day', 'closed') returning id`,
        )
      ).rows[0].id
    const e1 = await ev()
    const e2 = await ev()
    const e3 = await ev()
    for (const [u, e, rank] of [
      [a, e1, 1],
      [a, e2, 2],
      [b, e1, 2],
      [c, e1, 3],
      [c, e2, 1],
      [c, e3, 1],
    ] as const) {
      await db.query('insert into badges (user_id, event_id, rank) values ($1, $2, $3)', [u, e, rank])
    }
    await db.query('update profiles set banned = true where id = $1', [c])
    expect(await players(db, 'badges', 'all')).toEqual([
      [1, 'Alice', 2],
      [2, 'Bob', 1],
    ])
    await expect(players(db, 'badges', 'week')).rejects.toThrow(/bad_period/)
    await expect(players(db, 'badges', 'day')).rejects.toThrow(/bad_period/)
  })

  it('rejects bad kind and period, and clamps the limit to 1..100', async () => {
    const db = await createDb()
    await expect(players(db, 'nope', 'all')).rejects.toThrow(/bad_kind/)
    await expect(players(db, null as unknown as string, 'all')).rejects.toThrow(/bad_kind/)
    await expect(players(db, 'runs', 'month')).rejects.toThrow(/bad_period/)
    await expect(players(db, 'wins', null as unknown as string)).rejects.toThrow(/bad_period/)
    await db.query(`insert into auth.users (raw_user_meta_data)
                    select jsonb_build_object('full_name', 'User ' || i) from generate_series(1, 105) i`)
    await db.query(`insert into runs (user_id, game_id, mode, started_at, ended_at, status)
                    select id, 'caro', 'easy', now() - interval '2 minutes', now() - interval '1 minute', 'finished' from profiles`)
    expect(await players(db, 'runs', 'all', 0)).toHaveLength(1)
    expect(await players(db, 'runs', 'all', -5)).toHaveLength(1)
    expect(await players(db, 'runs', 'all', 7)).toHaveLength(7)
    expect(await players(db, 'runs', 'all', 500)).toHaveLength(100)
    expect(await players(db, 'runs', 'all', null)).toHaveLength(50)
  })

  it('anon and authenticated can call player_leaderboard (uses now())', async () => {
    const db = await createDb()
    const g = await newUser(db, { anonymous: true })
    await db.query(
      "insert into runs (user_id, game_id, mode, started_at, ended_at, status, won) values ($1, 'caro', 'easy', now() - interval '2 minutes', now(), 'finished', true)",
      [g],
    )
    for (const as of [(fn: () => Promise<any>) => asAnon(db, fn), (fn: () => Promise<any>) => asUser(db, g, fn)]) {
      const rows = (await as(() => db.query<any>("select * from player_leaderboard('wins', 'day')"))).rows
      expect(rows.map((r: any) => [r.rank, r.user_id, r.display_name, r.avatar_url, Number(r.value)])).toEqual([
        [1, g, guestName(g), null, 1],
      ])
    }
  })
})

// top_boards (theo điểm từng game) nằm ở game_points.test.ts.

describe('privileges', () => {
  it('internal helpers are not executable; the new RPCs are open to anon and authenticated', async () => {
    const db = await createDb()
    const p = async (role: string, fn: string) =>
      (await db.query<any>('select has_function_privilege($1, $2, $3) as ok', [role, fn, 'execute'])).rows[0].ok
    for (const role of ['anon', 'authenticated']) {
      for (const fn of [
        '_guest_name(uuid)',
        '_auth_display_name(jsonb, text)',
        'handle_new_user()',
        'handle_user_linked()',
        '_period_range(text, timestamptz)',
        '_player_board_at(text, text, int, timestamptz)',
        '_top_boards_at(text, int, timestamptz)',
      ]) {
        expect(await p(role, `public.${fn}`)).toBe(false)
      }
      expect(await p(role, 'public.player_leaderboard(text, text, int)')).toBe(true)
      expect(await p(role, 'public.top_boards(text, int)')).toBe(true)
    }
  })
})
