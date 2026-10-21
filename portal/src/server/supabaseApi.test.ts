import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createApiFromClient } from './supabaseApi'

type Res = { data: unknown; error: { message: string } | null }

/** Client giả: rpc/from/auth là spy trả dữ liệu dựng sẵn. */
function stub(opts: { rpc?: Res; table?: Res; userId?: string | null } = {}) {
  const rpc = vi.fn(async (..._a: unknown[]) => opts.rpc ?? { data: null, error: null })
  const table = opts.table ?? { data: null, error: null }
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'update', 'eq']) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => table)
  chain.then = (res: (v: Res) => unknown) => Promise.resolve(table).then(res)
  const from = vi.fn((_t: string) => chain)
  const signInWithOAuth = vi.fn(async (..._a: unknown[]) => ({ error: null }))
  const getUser = vi.fn(async () => ({ data: { user: opts.userId === null ? null : { id: opts.userId ?? 'u1' } } }))
  const client = { rpc, from, auth: { signInWithOAuth, getUser } } as unknown as SupabaseClient
  return { api: createApiFromClient(client), rpc, from, chain, signInWithOAuth }
}

describe('supabaseApi', () => {
  it('record_play / start_run dùng đúng tên tham số', async () => {
    const s = stub({ rpc: { data: 'run-1', error: null } })
    await s.api.recordPlay('sugoku')
    expect(s.rpc).toHaveBeenCalledWith('record_play', { p_game_id: 'sugoku' })
    expect(await s.api.startRun('sugoku', 'easy')).toBe('run-1')
    expect(s.rpc).toHaveBeenCalledWith('start_run', { p_game_id: 'sugoku', p_mode: 'easy' })
  })

  it('finish_run: score/timeMs undefined gửi null, map jsonb và chỉ giữ rank có mặt', async () => {
    const s = stub({ rpc: { data: { status: 'finished', reason: null, ranks: { week: '3', all: 12 } }, error: null } })
    const r = await s.api.finishRun('run-1', { timeMs: 5000, won: true, assisted: false })
    expect(s.rpc).toHaveBeenCalledWith('finish_run', {
      p_run_id: 'run-1', p_score: null, p_time_ms: 5000, p_won: true, p_assisted: false,
    })
    expect(r).toEqual({ status: 'finished', reason: null, ranks: { week: 3, all: 12 } })
    const s2 = stub({ rpc: { data: { status: 'rejected', reason: 'too_fast' }, error: null } })
    expect(await s2.api.finishRun('r', { score: 9, won: false, assisted: true })).toEqual({
      status: 'rejected', reason: 'too_fast', ranks: {},
    })
    expect(s2.rpc).toHaveBeenCalledWith('finish_run', {
      p_run_id: 'r', p_score: 9, p_time_ms: null, p_won: false, p_assisted: true,
    })
  })

  it('leaderboard: limit mặc định 50, map snake -> camel, bigint chuỗi -> số', async () => {
    const row = { rank: '1', user_id: 'u1', display_name: 'Ann', avatar_url: '', value: '1234', achieved_at: '2026-01-01T00:00:00Z' }
    const s = stub({ rpc: { data: [row], error: null } })
    const rows = await s.api.leaderboard('g', 'm', 'week')
    expect(s.rpc).toHaveBeenCalledWith('leaderboard', { p_game_id: 'g', p_mode: 'm', p_period: 'week', p_limit: 50 })
    expect(rows).toEqual([
      { rank: 1, userId: 'u1', displayName: 'Ann', avatarUrl: null, value: 1234, achievedAt: '2026-01-01T00:00:00Z' },
    ])
    await s.api.leaderboard('g', 'm', 'all', 5)
    expect(s.rpc).toHaveBeenLastCalledWith('leaderboard', { p_game_id: 'g', p_mode: 'm', p_period: 'all', p_limit: 5 })
  })

  it('my_rank: map số, rỗng -> null', async () => {
    const s = stub({ rpc: { data: [{ rank: '4', value: '99' }], error: null } })
    expect(await s.api.myRank('g', 'm', 'day')).toEqual({ rank: 4, value: 99 })
    expect(s.rpc).toHaveBeenCalledWith('my_rank', { p_game_id: 'g', p_mode: 'm', p_period: 'day' })
    expect(await stub({ rpc: { data: [], error: null } }).api.myRank('g', 'm', 'day')).toBeNull()
  })

  it('profile_bests và play_totals', async () => {
    const s = stub({
      rpc: { data: [{ game_id: 'g', mode: 'm', metric: 'time_low', value: '1500', achieved_at: 't' }], error: null },
    })
    expect(await s.api.profileBests('u9')).toEqual([
      { gameId: 'g', mode: 'm', metric: 'time_low', value: 1500, achievedAt: 't' },
    ])
    expect(s.rpc).toHaveBeenCalledWith('profile_bests', { p_user_id: 'u9' })
    const t = stub({ rpc: { data: [{ game_id: 'a', total: '7' }, { game_id: 'b', total: 2 }], error: null } })
    expect(await t.api.playTotals()).toEqual({ a: 7, b: 2 })
    expect(t.rpc.mock.calls[0]).toEqual(['play_totals', undefined])
  })

  it('gameMeta map hàng games', async () => {
    const modes = [{ key: 'easy', label: { en: 'Easy', vi: 'Dễ' }, rules: {} }]
    const s = stub({ table: { data: [{ id: 'sugoku', metric: 'time_low', modes, hidden: false }], error: null } })
    expect(await s.api.gameMeta()).toEqual([
      { id: 'sugoku', metric: 'time_low', modes: [{ key: 'easy', label: { en: 'Easy', vi: 'Dễ' } }], hidden: false },
    ])
    expect(s.from).toHaveBeenCalledWith('games')
  })

  it('profile map hàng profiles; không có hàng -> null', async () => {
    const s = stub({ table: { data: { id: 'u1', display_name: 'Ann', avatar_url: 'https://x/a.png' }, error: null } })
    expect(await s.api.profile('u1')).toEqual({ id: 'u1', displayName: 'Ann', avatarUrl: 'https://x/a.png' })
    expect(await stub().api.profile('u2')).toBeNull()
  })

  it('updateDisplayName chỉ sửa display_name của chính user', async () => {
    const s = stub({ userId: 'me' })
    await s.api.updateDisplayName('New')
    expect(s.from).toHaveBeenCalledWith('profiles')
    expect(s.chain.update).toHaveBeenCalledWith({ display_name: 'New' })
    expect(s.chain.eq).toHaveBeenCalledWith('id', 'me')
    await expect(stub({ userId: null }).api.updateDisplayName('x')).rejects.toThrow()
  })

  it('lỗi RPC -> promise bị từ chối', async () => {
    const s = stub({ rpc: { data: null, error: { message: 'boom' } } })
    await expect(s.api.recordPlay('g')).rejects.toThrow(/boom/)
    await expect(s.api.leaderboard('g', 'm', 'day')).rejects.toThrow(/boom/)
  })

  it('signInWithGoogle truyền provider và redirectTo = origin + pathname', async () => {
    const s = stub()
    await s.api.signInWithGoogle()
    expect(s.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname },
    })
  })
})
