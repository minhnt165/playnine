import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createDb, newUser } from './harness'

async function makeAdmin(db: PGlite): Promise<string> {
  const id = await newUser(db, { full_name: 'Admin' })
  await db.query("update profiles set role = 'admin' where id = $1", [id])
  return id
}

const iso = (ms: number) => new Date(Date.now() + ms).toISOString()
const DAY = 86_400_000

// Tin hợp lệ; ghi đè từng trường qua `over`.
const item = (over: Record<string, unknown> = {}) => ({
  url: 'https://www.ign.com/articles/a',
  source: 'IGN',
  lang: 'en',
  title: 'A headline',
  summary: 'Short summary',
  image_url: 'https://assets.ign.com/a.jpg',
  published_at: iso(-3_600_000),
  ...over,
})

// Như PostgREST với service role key.
async function ingest(db: PGlite, items: unknown): Promise<number> {
  await db.exec('set role service_role')
  try {
    return (await db.query<{ n: number }>('select ingest_news($1::jsonb) as n', [JSON.stringify(items)])).rows[0].n
  } finally {
    await db.exec('reset role')
  }
}

const all = async (db: PGlite) => (await db.query<any>('select * from news_feed order by url')).rows

describe('ingest_news', () => {
  it('thêm tin, bỏ trùng url (giữ cờ ẩn), trả số tin mới', async () => {
    const db = await createDb()
    expect(await ingest(db, [item(), item({ url: 'https://gamek.vn/b.chn', source: 'GameK', lang: 'vi' })])).toBe(2)
    await db.query("update news_feed set hidden = true where url = 'https://www.ign.com/articles/a'")
    expect(await ingest(db, [item({ title: 'Changed' }), item({ url: 'https://www.ign.com/articles/a' })])).toBe(0)
    const rows = await all(db)
    expect(rows).toHaveLength(2)
    expect(rows[1].title).toBe('A headline')
    expect(rows[1].hidden).toBe(true)
  })

  it('bỏ mục sai: không https, thiếu tiêu đề, ngôn ngữ lạ, quá 30 ngày; ảnh sai thì null; giờ tương lai kẹp về hiện tại', async () => {
    const db = await createDb()
    const n = await ingest(db, [
      item({ url: 'http://x.com/a' }),
      item({ url: 'https://x.com/b', title: '  ' }),
      item({ url: 'https://x.com/c', lang: 'fr' }),
      item({ url: 'https://x.com/d', published_at: iso(-31 * DAY) }),
      item({ url: 'https://x.com/e', image_url: 'javascript:alert(1)', published_at: iso(5 * DAY) }),
      item({ url: 'https://x.com/f', published_at: 'not a date', summary: 'x'.repeat(900) }),
      'not an object',
    ])
    expect(n).toBe(2)
    const [e, f] = await all(db)
    expect(e.url).toBe('https://x.com/e')
    expect(e.image_url).toBeNull()
    expect(new Date(e.published_at).getTime()).toBeLessThanOrEqual(Date.now() + 1000)
    expect(f.summary).toHaveLength(400)
  })

  it('xóa tin quá 30 ngày mỗi lần chạy', async () => {
    const db = await createDb()
    await ingest(db, [item()])
    await db.query("update news_feed set published_at = now() - interval '31 days'")
    await ingest(db, [])
    expect(await all(db)).toHaveLength(0)
  })

  it('không phải mảng hoặc quá 500 mục: lỗi', async () => {
    const db = await createDb()
    await expect(ingest(db, { a: 1 })).rejects.toThrow(/invalid_items/)
    await expect(ingest(db, Array.from({ length: 501 }, (_, i) => item({ url: 'https://x.com/' + i })))).rejects.toThrow(/too_many_items/)
  })

  it('anon và người chơi không gọi được ingest_news', async () => {
    const db = await createDb()
    const player = await newUser(db, { full_name: 'Bob' })
    await expect(asAnon(db, () => db.query("select ingest_news('[]'::jsonb)"))).rejects.toThrow(/permission denied/)
    await expect(asUser(db, player, () => db.query("select ingest_news('[]'::jsonb)"))).rejects.toThrow(/permission denied/)
  })
})

describe('đọc và quản lý tin', () => {
  it('anon thấy tin không ẩn, không ghi trực tiếp được', async () => {
    const db = await createDb()
    await ingest(db, [item(), item({ url: 'https://x.com/hidden' })])
    await db.query("update news_feed set hidden = true where url = 'https://x.com/hidden'")
    const urls = (await asAnon(db, () => db.query<any>('select url from news_feed'))).rows.map((r) => r.url)
    expect(urls).toEqual(['https://www.ign.com/articles/a'])
    await expect(asAnon(db, () => db.query("delete from news_feed"))).rejects.toThrow(/permission denied/)
    await expect(asAnon(db, () => db.query("insert into news_feed (url, source, lang, title, published_at) values ('https://z.com', 'Z', 'en', 'Z', now())"))).rejects.toThrow(/permission denied/)
  })

  it('admin xem cả tin ẩn và ẩn/hiện được; người chơi bị từ chối', async () => {
    const db = await createDb()
    const admin = await makeAdmin(db)
    const player = await newUser(db, { full_name: 'Bob' })
    await ingest(db, [item(), item({ url: 'https://x.com/old', published_at: iso(-2 * DAY) })])
    const list = (await asUser(db, admin, () => db.query<any>('select * from admin_news_feed()'))).rows
    expect(list.map((r) => r.url)).toEqual(['https://www.ign.com/articles/a', 'https://x.com/old'])
    await asUser(db, admin, () => db.query('select admin_hide_news($1, true)', [list[0].id]))
    expect((await asAnon(db, () => db.query<any>('select url from news_feed'))).rows.map((r) => r.url)).toEqual(['https://x.com/old'])
    expect((await asUser(db, admin, () => db.query<any>('select hidden from admin_news_feed()'))).rows.map((r) => r.hidden)).toEqual([true, false])
    await asUser(db, admin, () => db.query('select admin_hide_news($1, false)', [list[0].id]))
    expect((await asAnon(db, () => db.query<any>('select url from news_feed'))).rows).toHaveLength(2)
    await expect(asUser(db, admin, () => db.query("select admin_hide_news('00000000-0000-0000-0000-000000000000', true)"))).rejects.toThrow(/not_found/)
    await expect(asUser(db, player, () => db.query('select * from admin_news_feed()'))).rejects.toThrow(/forbidden/)
    await expect(asUser(db, player, () => db.query('select admin_hide_news($1, true)', [list[0].id]))).rejects.toThrow(/forbidden/)
  })
})
