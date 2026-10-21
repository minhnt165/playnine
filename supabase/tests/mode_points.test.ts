import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb, newUser } from './harness'

const NOW = '2026-10-21 10:00:00+07'

async function addRun(db: PGlite, user: string, game: string, mode: string, v: { won?: boolean; assisted?: boolean } = {}) {
  await db.query(
    `insert into runs (user_id, game_id, mode, started_at, ended_at, score, won, assisted, status)
     values ($1, $2, $3, $4::timestamptz - interval '1 minute', $4::timestamptz, 1, $5, $6, 'finished')`,
    [user, game, mode, NOW, v.won ?? false, v.assisted ?? false],
  )
}

async function makeAdmin(db: PGlite): Promise<string> {
  const id = await newUser(db, { full_name: 'Admin' })
  await db.query("update profiles set role = 'admin' where id = $1", [id])
  return id
}

const modePoints = async (db: PGlite, game: string) =>
  Object.fromEntries(
    (await db.query<any>("select m->>'key' as k, m->'points' as p from games, jsonb_array_elements(modes) m where id = $1", [game])).rows.map((r) => [r.k, r.p]),
  )

const gameBoard = async (db: PGlite, game: string) =>
  (await db.query<any>("select * from _game_points_board_at($1, 'all', 50, $2)", [game, NOW])).rows.map((r) => [r.display_name, Number(r.value)])

describe('mode points seed', () => {
  it('mọi mode của mọi game đều có điểm riêng, số nguyên 0..1000; độ khó tăng thì điểm không giảm', async () => {
    const db = await createDb()
    const rows = (await db.query<any>("select g.id, m->>'key' as k, m->'points' as p from games g, jsonb_array_elements(g.modes) m")).rows
    expect(rows.length).toBeGreaterThan(40)
    for (const r of rows) {
      expect(typeof r.p, `${r.id}/${r.k}`).toBe('number')
      expect(Number.isInteger(r.p) && r.p >= 0 && r.p <= 1000).toBe(true)
    }
    expect(await modePoints(db, 'sudoku')).toEqual({ easy: 5, medium: 8, hard: 12, expert: 16, extreme: 20, daily: 10 })
    expect(await modePoints(db, 'covua')).toEqual({ easy: 10, medium: 15, hard: 25 })
    for (const g of ['caro', 'co9o', 'codam', 'coganh', 'colat', 'oanquan', 'xiangqi', 'bonlientiep', 'minesweeper']) {
      const p = await modePoints(db, g)
      expect(p.easy < p.medium && p.medium < p.hard, g).toBe(true)
    }
    // Mode giữ nguyên key, label, rules.
    const sudoku = (await db.query<any>("select modes from games where id = 'sudoku'")).rows[0].modes
    expect(sudoku[0]).toMatchObject({ key: 'easy', label: { en: 'Easy', vi: 'Dễ' }, rules: { min_time_ms: 10000 }, points: 5 })
  })
})

describe('điểm ván theo mode', () => {
  it('mỗi ván lấy điểm của mode, thắng không trợ giúp x2; mode không có điểm riêng dùng games.points', async () => {
    const db = await createDb()
    const a = await newUser(db, { full_name: 'Alice' })
    await addRun(db, a, 'sudoku', 'easy') // 5
    await addRun(db, a, 'sudoku', 'extreme', { won: true }) // 40
    await addRun(db, a, 'sudoku', 'hard', { won: true, assisted: true }) // 12
    expect(await gameBoard(db, 'sudoku')).toEqual([['Alice', 57]])
    await db.query(`update games set points = 7, modes = (select jsonb_agg(case when m->>'key' = 'easy' then m - 'points' else m end order by o)
      from jsonb_array_elements(modes) with ordinality t(m, o)) where id = 'sudoku'`)
    expect(await gameBoard(db, 'sudoku')).toEqual([['Alice', 59]])
    // Mode lạ (đã bị bỏ khỏi game) vẫn tính theo games.points.
    await addRun(db, a, 'sudoku', 'retired')
    expect(await gameBoard(db, 'sudoku')).toEqual([['Alice', 66]])
    const total = (await db.query<any>("select value from _points_at('all', $1, $2)", [NOW, a])).rows[0].value
    expect(Number(total)).toBe(66)
  })
})

describe('admin_update_game p_mode_points', () => {
  it('đặt, xóa điểm từng mode; giữ rules; mode không nêu giữ nguyên', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    await asUser(db, admin, () =>
      db.query(`select admin_update_game('caro', null, '{"easy":{"min_duration_ms":5}}'::jsonb, null, '{"easy": 3, "hard": null}'::jsonb)`),
    )
    expect(await modePoints(db, 'caro')).toEqual({ easy: 3, medium: 15, hard: null })
    const modes = (await db.query<any>("select modes, points from games where id = 'caro'")).rows[0]
    expect(modes.modes[0].rules).toEqual({ min_duration_ms: 5 })
    expect(modes.modes.map((m: any) => m.key)).toEqual(['easy', 'medium', 'hard'])
    // Gọi kiểu cũ (4 tham số, 3 tham số) vẫn được và không đụng điểm mode.
    await asUser(db, admin, () => db.query("select admin_update_game('caro', null, '{}'::jsonb, 20)"))
    await asUser(db, admin, () => db.query("select admin_update_game('caro', false, '{}'::jsonb)"))
    expect(await modePoints(db, 'caro')).toEqual({ easy: 3, medium: 15, hard: null })
    expect((await db.query<any>("select points from games where id = 'caro'")).rows[0].points).toBe(20)
    const u = await newUser(db, { full_name: 'Bob' })
    await addRun(db, u, 'caro', 'hard', { won: true }) // 20 x2
    await addRun(db, u, 'caro', 'easy') // 3
    expect(await gameBoard(db, 'caro')).toEqual([['Bob', 43]])
  })

  it('kiểm tra giá trị: số nguyên 0..1000 hoặc null, mode phải có; chỉ admin', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const player = await newUser(db, { full_name: 'Bob' })
    const upd = (uid: string, mp: string) => asUser(db, uid, () => db.query("select admin_update_game('caro', null, '{}'::jsonb, null, $1::jsonb)", [mp]))
    for (const bad of ['{"easy": -1}', '{"easy": 1001}', '{"easy": 2.5}', '{"easy": "5"}', '{"easy": 99999}', '[1]']) {
      await expect(upd(admin, bad), bad).rejects.toThrow(/bad_points/)
    }
    await expect(upd(admin, '{"nope": 5}')).rejects.toThrow(/unknown_mode/)
    await upd(admin, '{"easy": 0, "medium": 1000}')
    expect(await modePoints(db, 'caro')).toEqual({ easy: 0, medium: 1000, hard: 25 })
    await expect(upd(player, '{"easy": 5}')).rejects.toThrow(/forbidden/)
    await expect(asAnon(db, () => db.query("select admin_update_game('caro', null, '{}'::jsonb, null, '{}'::jsonb)"))).rejects.toThrow(/permission denied/)
  })
})
