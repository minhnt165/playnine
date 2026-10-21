import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb, newUser } from './harness'

const rate = (db: PGlite, uid: string, game: string, stars: number | null) =>
  asUser(db, uid, () => db.query('select rate_game($1, $2)', [game, stars]))

const mine = async (db: PGlite, uid: string) =>
  (await asUser(db, uid, () => db.query<any>('select * from my_ratings()'))).rows.map((r) => [r.game_id, r.stars])

const summary = async (db: PGlite) =>
  (await asAnon(db, () => db.query<any>('select * from game_rating_summary()'))).rows.map((r) => [
    r.game_id,
    Number(r.average),
    r.count,
  ])

describe('rate_game', () => {
  it('rates, updates and deletes the caller rating', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    await rate(db, a, 'caro', 4)
    await rate(db, a, '2048', 5)
    expect(await mine(db, a)).toEqual([
      ['2048', 5],
      ['caro', 4],
    ])
    await db.query("update game_ratings set updated_at = now() - interval '1 day' where game_id = 'caro'")
    const before = (await db.query<any>("select created_at, updated_at from game_ratings where game_id = 'caro'")).rows[0]
    await rate(db, a, 'caro', 2)
    const after = (await db.query<any>("select created_at, updated_at from game_ratings where game_id = 'caro'")).rows[0]
    expect(after.created_at.getTime()).toBe(before.created_at.getTime())
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime())
    expect(await mine(db, a)).toEqual([
      ['2048', 5],
      ['caro', 2],
    ])
    await rate(db, a, 'caro', null)
    expect(await mine(db, a)).toEqual([['2048', 5]])
    // Xóa khi chưa có đánh giá cũng không lỗi.
    await rate(db, a, 'caro', null)
  })

  it('accepts 1..5 only and rejects hidden or unknown games', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    await rate(db, a, 'caro', 1)
    await rate(db, a, 'caro', 5)
    for (const bad of [0, 6, -1, 100]) await expect(rate(db, a, 'caro', bad)).rejects.toThrow(/bad_stars/)
    await expect(rate(db, a, 'nope', 3)).rejects.toThrow(/unknown_game/)
    await db.query("update games set hidden = true where id = 'xepbai'")
    await expect(rate(db, a, 'xepbai', 3)).rejects.toThrow(/unknown_game/)
    expect(await mine(db, a)).toEqual([['caro', 5]])
  })

  it('refuses anon and banned players; guests (anonymous users) may rate', async () => {
    const db = await createDb()
    await expect(asAnon(db, () => db.query("select rate_game('caro', 3)"))).rejects.toThrow(/permission denied/)
    await expect(asAnon(db, () => db.query('select * from my_ratings()'))).rejects.toThrow(/permission denied/)
    await expect(asAnon(db, () => db.query('select * from game_ratings'))).rejects.toThrow(/permission denied/)
    const b = await newUser(db, { full_name: 'Bob' })
    await db.query('update profiles set banned = true where id = $1', [b])
    await expect(rate(db, b, 'caro', 3)).rejects.toThrow(/banned/)
    // Có JWT nhưng chưa có profile (hiếm, nhưng phải báo lỗi rõ ràng).
    await expect(rate(db, '00000000-0000-0000-0000-000000000009', 'caro', 3)).rejects.toThrow(/no_profile/)
    const g = await newUser(db, { anonymous: true })
    await rate(db, g, 'caro', 4)
    expect(await mine(db, g)).toEqual([['caro', 4]])
    await expect(asUser(db, g, () => db.query('select * from game_ratings'))).rejects.toThrow(/permission denied/)
    await expect(asUser(db, g, () => db.query("insert into game_ratings (user_id, game_id, stars) values ($1, 'caro', 5)", [g]))).rejects.toThrow(
      /permission denied/,
    )
  })
})

describe('game_rating_summary', () => {
  it('averages to one decimal with counts, skipping banned raters, hidden and unrated games', async () => {
    const db = await createDb()
    const u: string[] = []
    for (const n of ['A', 'B', 'C', 'D']) u.push(await newUser(db, { full_name: n + n }))
    await rate(db, u[0], 'caro', 5)
    await rate(db, u[1], 'caro', 4)
    await rate(db, u[2], 'caro', 4) // 13/3 = 4.333 -> 4.3
    await rate(db, u[0], '2048', 3)
    await rate(db, u[1], '2048', 4) // 3.5
    await rate(db, u[0], 'sudoku', 5)
    await rate(db, u[1], 'sudoku', 4)
    await rate(db, u[2], 'sudoku', 4) // 13/3 trước khi khóa D
    await rate(db, u[3], 'sudoku', 1)
    await rate(db, u[3], 'xepbai', 2)
    await rate(db, u[0], 'phagach', 4)
    await db.query('update profiles set banned = true where id = $1', [u[3]])
    await db.query("update games set hidden = true where id = 'phagach'")
    expect(await summary(db)).toEqual([
      ['2048', 3.5, 2],
      ['caro', 4.3, 3],
      ['sudoku', 4.3, 3],
    ])
    // Thêm một lượt: (3 + 4 + 5) / 3 = 4.0.
    await rate(db, u[2], '2048', 5)
    expect((await summary(db)).find((r) => r[0] === '2048')).toEqual(['2048', 4, 3])
    const authed = (await asUser(db, u[0], () => db.query<any>('select * from game_rating_summary()'))).rows
    expect(authed).toHaveLength(3)
  })
})

describe('privileges', () => {
  it('scopes the rating RPCs', async () => {
    const db = await createDb()
    const p = async (role: string, fn: string) =>
      (await db.query<any>('select has_function_privilege($1, $2, $3) as ok', [role, fn, 'execute'])).rows[0].ok
    expect(await p('anon', 'public.rate_game(text, int)')).toBe(false)
    expect(await p('authenticated', 'public.rate_game(text, int)')).toBe(true)
    expect(await p('anon', 'public.my_ratings()')).toBe(false)
    expect(await p('authenticated', 'public.my_ratings()')).toBe(true)
    expect(await p('anon', 'public.game_rating_summary()')).toBe(true)
    expect(await p('authenticated', 'public.game_rating_summary()')).toBe(true)
  })
})
