import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, '..', 'migrations')

// PGlite mới: chạy shim auth rồi mọi migration theo tên file.
export async function createDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(readFileSync(join(here, 'supabase-shim.sql'), 'utf8'))
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const f of files) await db.exec(readFileSync(join(migrationsDir, f), 'utf8'))
  return db
}

// Bỏ khóa "points" khỏi mọi mode, để mọi ván dùng games.points.
export async function withoutModePoints(db: PGlite): Promise<PGlite> {
  await db.exec(`update games g set modes = (
    select jsonb_agg(m - 'points' order by o) from jsonb_array_elements(g.modes) with ordinality t(m, o))`)
  return db
}

export async function newUser(
  db: PGlite,
  meta: { full_name?: string; avatar_url?: string; email?: string; anonymous?: boolean } = {},
): Promise<string> {
  const { email, anonymous, ...rest } = meta
  const r = await db.query<{ id: string }>(
    'insert into auth.users (email, raw_user_meta_data, is_anonymous) values ($1, $2::jsonb, $3) returning id',
    [email ?? null, JSON.stringify(rest), anonymous ?? false],
  )
  return r.rows[0].id
}

async function asRole<T>(db: PGlite, role: string, sub: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`)
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub])
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', '', false)")
  }
}

export const asUser = <T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> =>
  asRole(db, 'authenticated', userId, fn)

export const asAnon = <T>(db: PGlite, fn: () => Promise<T>): Promise<T> => asRole(db, 'anon', '', fn)