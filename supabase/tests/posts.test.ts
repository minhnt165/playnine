import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb, newUser } from './harness'

async function makeAdmin(db: PGlite, name = 'Admin'): Promise<string> {
  const id = await newUser(db, { full_name: name })
  await db.query("update profiles set role = 'admin' where id = $1", [id])
  return id
}

const as = <T = any>(db: PGlite, uid: string, sql: string, params: any[] = []) =>
  asUser(db, uid, () => db.query<T>(sql, params))

const iso = (ms: number) => new Date(Date.now() + ms).toISOString()
const DAY = 86_400_000

// Bài hợp lệ; ghi đè từng trường qua `over`.
const post = (over: Record<string, unknown> = {}) => ({
  slug: 'hello-world',
  title: { en: 'Hello', vi: 'Xin chào' },
  summary: { en: 'Short', vi: 'Ngắn' },
  body: { en: '## Hi\n\nBody', vi: '## Chào\n\nNội dung' },
  game_id: '2048',
  tags: ['tips'],
  pinned: false,
  published_at: iso(-DAY),
  ...over,
})

const save = (db: PGlite, uid: string, p: unknown) =>
  as<{ id: string }>(db, uid, 'select admin_save_post($1::jsonb) as id', [JSON.stringify(p)]).then((r) => r.rows[0].id)

const row = async (db: PGlite, id: string) => (await db.query<any>('select * from posts where id = $1', [id])).rows[0]

const SEED = ['co-ganh-luat-choi-va-khai-cuoc', 'meo-choi-noi-hinh', 'playnine-moi-diem-thuong-tai-khoan-khach', 'sudoku-5-ky-thuat-giai-nhanh']

describe('posts seed and visibility', () => {
  it('ships 4 published bilingual sample posts readable by anon; only the newest is pinned', async () => {
    const db = await createDb()
    const rows = (await asAnon(db, () => db.query<any>('select * from posts order by published_at desc'))).rows
    expect(rows.map((r) => r.slug).sort()).toEqual(SEED)
    expect(rows[0].slug).toBe('playnine-moi-diem-thuong-tai-khoan-khach')
    expect(rows.map((r) => r.pinned)).toEqual([true, false, false, false])
    expect(rows.map((r) => r.game_id)).toEqual([null, 'noihinh', 'sudoku', 'coganh'])
    for (const r of rows) {
      for (const k of ['en', 'vi']) {
        expect(r.title[k].length).toBeGreaterThan(0)
        expect(r.title[k].length).toBeLessThanOrEqual(120)
        expect(r.summary[k].length).toBeGreaterThan(0)
        expect(r.summary[k].length).toBeLessThanOrEqual(300)
        expect(r.body[k]).toMatch(/^## /m)
        expect(r.body[k].split(/\n\s*\n/).length).toBeGreaterThanOrEqual(4)
        expect(r.body[k].length).toBeLessThanOrEqual(20000)
      }
      expect(r.author_id).toBeNull()
      expect(new Date(r.published_at).getTime()).toBeLessThanOrEqual(Date.now())
    }
  })

  it('anon and players see only published posts, never drafts or scheduled ones', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const player = await newUser(db, { full_name: 'Bob' })
    await save(db, admin, post({ slug: 'live-post' }))
    await save(db, admin, post({ slug: 'draft-post', published_at: null }))
    await save(db, admin, post({ slug: 'future-post', published_at: iso(DAY) }))
    for (const run of [(fn: () => Promise<any>) => asAnon(db, fn), (fn: () => Promise<any>) => asUser(db, player, fn)]) {
      const slugs = (await run(() => db.query<any>('select slug from posts'))).rows.map((r: any) => r.slug)
      expect(slugs).toContain('live-post')
      expect(slugs).not.toContain('draft-post')
      expect(slugs).not.toContain('future-post')
      expect(slugs).toHaveLength(5)
    }
  })

  it('nobody writes posts directly', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const id = (await db.query<any>("select id from posts where slug = 'meo-choi-noi-hinh'")).rows[0].id
    for (const run of [(fn: () => Promise<any>) => asAnon(db, fn), (fn: () => Promise<any>) => asUser(db, admin, fn)]) {
      await expect(run(() => db.query(`insert into posts (slug, title) values ('x-y-z', '{"en":"x"}')`))).rejects.toThrow(/permission denied/)
      await expect(run(() => db.query('update posts set pinned = true where id = $1', [id]))).rejects.toThrow(/permission denied/)
      await expect(run(() => db.query('delete from posts where id = $1', [id]))).rejects.toThrow(/permission denied/)
    }
  })
})

describe('admin posts RPCs', () => {
  it('admin_posts lists everything, newest first by published_at or updated_at', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    await save(db, admin, post({ slug: 'draft-post', published_at: null }))
    await save(db, admin, post({ slug: 'future-post', published_at: iso(DAY) }))
    const slugs = (await as<any>(db, admin, 'select slug from admin_posts()')).rows.map((r) => r.slug)
    expect(slugs).toEqual([
      'future-post',
      'draft-post',
      'playnine-moi-diem-thuong-tai-khoan-khach',
      'meo-choi-noi-hinh',
      'sudoku-5-ky-thuat-giai-nhanh',
      'co-ganh-luat-choi-va-khai-cuoc',
    ])
  })

  it('creates a post with normalised fields and the caller as author', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const id = await save(db, admin, post({
      slug: '  new-post  ',
      title: { en: '  Hello  ', vi: '  ' },
      summary: null,
      tags: [' tips ', 'tips', 'sudoku'],
      game_id: '',
      published_at: null,
    }))
    const r = await row(db, id)
    expect(r.slug).toBe('new-post')
    expect(r.title).toEqual({ en: 'Hello' })
    expect(r.summary).toEqual({})
    expect(r.tags).toEqual(['tips', 'sudoku'])
    expect(r.game_id).toBeNull()
    expect(r.published_at).toBeNull()
    expect(r.pinned).toBe(false)
    expect(r.author_id).toBe(admin)
  })

  it('update replaces editable fields, bumps updated_at and keeps author and created_at', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const other = await makeAdmin(db, 'Other')
    const id = await save(db, admin, post({ pinned: true }))
    await db.query("update posts set created_at = now() - interval '1 day', updated_at = now() - interval '1 day' where id = $1", [id])
    const before = await row(db, id)
    const same = await save(db, other, { id, slug: 'renamed', title: { en: 'New title' } })
    expect(same).toBe(id)
    const r = await row(db, id)
    expect(r.slug).toBe('renamed')
    expect(r.title).toEqual({ en: 'New title' })
    expect(r.summary).toEqual({})
    expect(r.body).toEqual({})
    expect(r.game_id).toBeNull()
    expect(r.tags).toEqual([])
    expect(r.pinned).toBe(false)
    expect(r.published_at).toBeNull()
    expect(r.author_id).toBe(admin)
    expect(r.created_at.getTime()).toBe(before.created_at.getTime())
    expect(r.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime())
    // Giữ nguyên slug của chính mình không tính là trùng.
    await save(db, admin, { id, slug: 'renamed', title: { en: 'Again' } })
    await expect(save(db, admin, { id: '00000000-0000-0000-0000-000000000009', slug: 'abc', title: { en: 'x' } })).rejects.toThrow(/not_found/)
    await expect(save(db, admin, { id: 'nope', slug: 'abc', title: { en: 'x' } })).rejects.toThrow(/not_found/)
  })

  it('rejects bad input with readable codes', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const bad = (over: Record<string, unknown>, code: RegExp) => expect(save(db, admin, post(over))).rejects.toThrow(code)
    for (const slug of ['ab', 'Hello', 'has space', '-lead', 'trail-', 'a--b', 'x'.repeat(81), null, 'viết']) await bad({ slug }, /bad_slug/)
    await bad({ slug: 'meo-choi-noi-hinh' }, /slug_taken/)
    await bad({ title: { vi: 'Chỉ tiếng Việt' } }, /bad_title/)
    await bad({ title: { en: '   ' } }, /bad_title/)
    await bad({ title: { en: 'x'.repeat(121) } }, /bad_title/)
    await bad({ title: 'plain' }, /bad_title/)
    await bad({ title: { en: 5 } }, /bad_title/)
    await bad({ summary: { vi: 'x'.repeat(301) } }, /bad_summary/)
    await bad({ summary: ['x'] }, /bad_summary/)
    await bad({ body: { en: 'x'.repeat(20001) } }, /bad_body/)
    await bad({ game_id: 'nope' }, /unknown_game/)
    await bad({ tags: 'tips' }, /bad_tags/)
    await bad({ tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, /bad_tags/)
    await bad({ tags: ['   '] }, /bad_tags/)
    await bad({ tags: ['x'.repeat(25)] }, /bad_tags/)
    await bad({ tags: [1] }, /bad_tags/)
    await bad({ pinned: 'yes' }, /bad_pinned/)
    await bad({ published_at: 'not a date' }, /bad_time/)
    // Biên hợp lệ.
    const id = await save(db, admin, post({ slug: 'abc', title: { en: 'x'.repeat(120) }, body: { vi: 'x'.repeat(20000) }, tags: ['a', 'b', 'c', 'd', 'e', 'x'.repeat(24)] }))
    expect((await row(db, id)).tags).toHaveLength(6)
    expect((await db.query<any>("select count(*)::int as n from posts where slug = 'hello-world'")).rows[0].n).toBe(0)
  })

  it('deletes a post, not_found when missing', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const id = await save(db, admin, post())
    await as(db, admin, 'select admin_delete_post($1)', [id])
    expect(await row(db, id)).toBeUndefined()
    await expect(as(db, admin, 'select admin_delete_post($1)', [id])).rejects.toThrow(/not_found/)
  })

  it('game deletion clears game_id and author deletion clears author_id', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    await db.query(`insert into games (id, metric, modes) values ('tmp', 'wins', '[{"key":"m","rules":{}}]'::jsonb)`)
    const id = await save(db, admin, post({ game_id: 'tmp' }))
    await db.query("delete from games where id = 'tmp'")
    await db.query('delete from auth.users where id = $1', [admin])
    const r = await row(db, id)
    expect(r.game_id).toBeNull()
    expect(r.author_id).toBeNull()
  })

  it('refuses anon and non-admin players', async () => {
    const db = await createDb()
    const player = await newUser(db, { full_name: 'Bob' })
    const u = '00000000-0000-0000-0000-000000000001'
    const calls = ['admin_posts()', `admin_save_post('${JSON.stringify(post())}'::jsonb)`, `admin_delete_post('${u}')`]
    for (const c of calls) {
      await expect(asAnon(db, () => db.query(`select * from ${c}`)), c).rejects.toThrow(/permission denied/)
      await expect(as(db, player, `select * from ${c}`), c).rejects.toThrow(/forbidden/)
    }
    const p = async (role: string, fn: string) =>
      (await db.query<any>('select has_function_privilege($1, $2, $3) as ok', [role, fn, 'execute'])).rows[0].ok
    for (const role of ['anon', 'authenticated']) expect(await p(role, 'public._i18n_text(jsonb, int)')).toBe(false)
  })
})
