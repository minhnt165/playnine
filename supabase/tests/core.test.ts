import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb, newUser } from './harness'
import { readManifests } from './manifests'

const manifests = readManifests().map(({ m }) => m)

describe('spike', () => {
  it('pglite supports roles, RLS and the Asia/Ho_Chi_Minh zone', async () => {
    const db = new PGlite()
    await db.exec(`
      create role tester nologin;
      create table t (id int, owner text);
      insert into t values (1,'a'),(2,'b');
      alter table t enable row level security;
      create policy p on t for select using (owner = 'a');
      grant select on t to tester;
    `)
    await db.exec('set role tester')
    const r = await db.query('select * from t')
    await db.exec('reset role')
    expect(r.rows).toHaveLength(1)
    const z = await db.query("select now() at time zone 'Asia/Ho_Chi_Minh' as t")
    expect(z.rows).toHaveLength(1)
  })
})

describe('core schema', () => {
  it('bảng games khớp manifest của mọi game (metric, điểm, mode, nhãn, luật)', async () => {
    const db = await createDb()
    const r = await db.query<{ id: string; metric: string; modes: any[]; points: number }>('select * from games')
    expect(r.rows.map((g) => g.id).sort()).toEqual(manifests.map((m) => m.id).sort())
    for (const m of manifests) {
      const g = r.rows.find((x) => x.id === m.id)!
      expect({ metric: g.metric, points: g.points, modes: g.modes }, m.id).toEqual({
        metric: m.server.metric,
        points: m.server.points,
        modes: m.server.modes,
      })
    }
  })

  it('creates a profile from Google metadata', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: '  Minh Nguyen  ', avatar_url: 'https://a/b.png' })
    const p = (await db.query<any>('select * from profiles where id = $1', [a])).rows[0]
    expect(p.display_name).toBe('Minh Nguyen')
    expect(p.avatar_url).toBe('https://a/b.png')
    expect(p.role).toBe('player')
    expect(p.banned).toBe(false)
    const b = await newUser(db, { email: 'lan.tran@x.com' })
    expect((await db.query<any>('select display_name from profiles where id = $1', [b])).rows[0].display_name).toBe('lan.tran')
    const c = await newUser(db, { full_name: 'X' })
    expect((await db.query<any>('select display_name from profiles where id = $1', [c])).rows[0].display_name).toBe('Player')
  })

  it('anyone reads games, play_counts and profiles', async () => {
    const db = await createDb()
    await newUser(db, { full_name: 'Reader' })
    await asAnon(db, async () => {
      expect((await db.query('select * from games')).rows.length).toBe(manifests.length)
      await db.query('select * from play_counts')
      expect((await db.query('select id, display_name, avatar_url from profiles')).rows.length).toBe(1)
    })
  })

  it('profiles expose only public columns to anon and authenticated', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    for (const as of [(fn: () => Promise<unknown>) => asAnon(db, fn), (fn: () => Promise<unknown>) => asUser(db, a, fn)]) {
      await expect(as(() => db.query('select role from profiles'))).rejects.toThrow(/permission denied/)
      await expect(as(() => db.query('select * from profiles'))).rejects.toThrow(/permission denied/)
      await expect(as(() => db.query('select banned from profiles'))).rejects.toThrow(/permission denied/)
      const r = (await as(() => db.query<any>('select id, display_name, avatar_url from profiles'))) as { rows: any[] }
      expect(r.rows).toHaveLength(1)
    }
  })

  it('rejects display names made only of tabs or NBSP', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    for (const bad of ['\t\t', '\u00a0\u00a0\u00a0', '\t\u00a0']) {
      await expect(asUser(db, a, () => db.query('update profiles set display_name = $2 where id = $1', [a, bad]))).rejects.toThrow()
    }
    const ok = await asUser(db, a, () => db.query("update profiles set display_name = 'Bao Anh' where id = $1", [a]))
    expect(ok.affectedRows).toBe(1)
    const b = await newUser(db, { full_name: '\t\t\t' })
    expect((await db.query<any>('select display_name from profiles where id = $1', [b])).rows[0].display_name).toBe('Player')
  })

  it('runs are not directly readable or writable', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    await db.query("insert into runs (user_id, game_id, mode) values ($1, '2048', '4x4')", [a])
    const attempts = [(fn: () => Promise<unknown>) => asUser(db, a, fn), (fn: () => Promise<unknown>) => asAnon(db, fn)]
    for (const as of attempts) {
      await as(async () => {
        let rows = 0
        try {
          rows = (await db.query('select * from runs')).rows.length
        } catch {
          rows = 0
        }
        expect(rows).toBe(0)
      })
      await expect(
        as(() => db.query("insert into runs (user_id, game_id, mode) values ($1, '2048', '4x4')", [a])),
      ).rejects.toThrow()
    }
  })

  it('a player renames only themself', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    const b = await newUser(db, { full_name: 'Bob' })
    await asUser(db, a, async () => {
      const r = await db.query("update profiles set display_name = 'An' where id = $1", [a])
      expect(r.affectedRows).toBe(1)
      const o = await db.query("update profiles set display_name = 'An' where id = $1", [b])
      expect(o.affectedRows).toBe(0)
      await expect(db.query("update profiles set role = 'admin' where id = $1", [a])).rejects.toThrow()
      await expect(db.query("update profiles set display_name = ' ' where id = $1", [a])).rejects.toThrow()
      await expect(
        db.query('update profiles set display_name = $2 where id = $1', [a, 'x'.repeat(25)]),
      ).rejects.toThrow()
    })
  })

  it('record_play counts guests and players per day', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    await asAnon(db, async () => {
      await db.query("select record_play('2048')")
      await db.query("select record_play('2048')")
    })
    await asUser(db, a, () => db.query("select record_play('2048')"))
    await asAnon(db, () => db.query("select record_play('nope')"))
    const t = await asAnon(db, () => db.query<any>('select * from play_totals()'))
    expect(t.rows.map((r) => [r.game_id, Number(r.total)])).toEqual([['2048', 3]])
    expect((await db.query('select * from play_counts')).rows).toHaveLength(1)
  })

  it('internal functions are not executable by anon or authenticated', async () => {
    const db = await createDb()
    for (const role of ['anon', 'authenticated']) {
      const r = await db.query<any>(
        "select has_function_privilege($1, 'public.handle_new_user()', 'execute') as ok",
        [role],
      )
      expect(r.rows[0].ok).toBe(false)
    }
    const ok = await db.query<any>(
      "select has_function_privilege('anon', 'public.record_play(text)', 'execute') as a, has_function_privilege('authenticated', 'public.play_totals()', 'execute') as b",
    )
    expect(ok.rows[0]).toEqual({ a: true, b: true })
  })

  it('deleting an auth user removes the profile and their runs', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    await db.query("insert into runs (user_id, game_id, mode) values ($1, '2048', '4x4')", [a])
    await db.query('delete from auth.users where id = $1', [a])
    expect((await db.query('select * from runs')).rows).toHaveLength(0)
    expect((await db.query('select * from profiles')).rows).toHaveLength(0)
  })

  it('ping returns 1 for anon', async () => {
    const db = await createDb()
    const r = await asAnon(db, () => db.query<any>('select ping() as v'))
    expect(r.rows[0].v).toBe(1)
  })
})