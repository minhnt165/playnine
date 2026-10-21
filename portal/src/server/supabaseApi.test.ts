import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createApiFromClient } from './supabaseApi'

type Res = { data: unknown; error: { message: string } | null }

/** Client giả: rpc/from/auth là spy trả dữ liệu dựng sẵn. */
function stub(opts: { rpc?: Res | ((fn: string) => Res); table?: Res; userId?: string | null } = {}) {
  const rpc = vi.fn(async (fn: string, ..._a: unknown[]) => {
    const r = opts.rpc
    return typeof r === 'function' ? r(fn) : (r ?? { data: null, error: null })
  })
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

  it('gameMeta giữ rules của từng mode', async () => {
    const modes = [{ key: 'easy', label: { en: 'Easy', vi: 'Dễ' }, rules: { min_duration_ms: 5000, max_score: 10 } }]
    const s = stub({ table: { data: [{ id: 'g', metric: 'score_high', modes, hidden: true }], error: null } })
    const [g] = await s.api.gameMeta()
    expect(g.modes[0].rules).toEqual({ min_duration_ms: 5000, max_score: 10 })
  })

  it('gameMeta map hàng games', async () => {
    const modes = [{ key: 'easy', label: { en: 'Easy', vi: 'Dễ' }, rules: {} }]
    const s = stub({ table: { data: [{ id: 'sugoku', metric: 'time_low', modes, hidden: false }], error: null } })
    expect(await s.api.gameMeta()).toEqual([
      { id: 'sugoku', metric: 'time_low', modes: [{ key: 'easy', label: { en: 'Easy', vi: 'Dễ' }, rules: {} }], hidden: false },
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

  const EV = {
    id: 'e1', title: { en: 'Cup' }, description: {}, game_id: 'sugoku', mode: 'easy', agg: 'best',
    starts_at: '2026-01-01T00:00:00Z', ends_at: '2026-01-02T00:00:00Z', award_top: 3, status: 'live',
  }

  it('events: đọc bảng events và đổi snake -> camel', async () => {
    const s = stub({ table: { data: [EV], error: null } })
    expect(await s.api.events()).toEqual([
      {
        id: 'e1', title: { en: 'Cup' }, description: {}, gameId: 'sugoku', mode: 'easy', agg: 'best',
        startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-02T00:00:00Z', awardTop: 3, status: 'live',
      },
    ])
    expect(s.from).toHaveBeenCalledWith('events')
  })

  it('eventLeaderboard, collections, profileBadges', async () => {
    const row = { rank: '1', user_id: 'u1', display_name: 'Ann', avatar_url: null, value: '9', achieved_at: 't' }
    const s = stub({ rpc: { data: [row], error: null } })
    expect((await s.api.eventLeaderboard('e1'))[0]).toMatchObject({ rank: 1, userId: 'u1', value: 9 })
    expect(s.rpc).toHaveBeenCalledWith('event_leaderboard', { p_event_id: 'e1', p_limit: 50 })
    const c = stub({
      table: {
        data: [{ id: 'c1', title: { en: 'Set' }, game_ids: ['a', 'b'], starts_at: 's', ends_at: null, sort: '2' }],
        error: null,
      },
    })
    expect(await c.api.collections()).toEqual([
      { id: 'c1', title: { en: 'Set' }, gameIds: ['a', 'b'], startsAt: 's', endsAt: null, sort: 2 },
    ])
    expect(c.from).toHaveBeenCalledWith('collections')
    const b = stub({
      rpc: { data: [{ event_id: 'e1', rank: '2', awarded_at: 't', title: { en: 'Cup' }, game_id: 'g', mode: 'm' }], error: null },
    })
    expect(await b.api.profileBadges('u1')).toEqual([
      { eventId: 'e1', rank: 2, awardedAt: 't', title: { en: 'Cup' }, gameId: 'g', mode: 'm' },
    ])
    expect(b.rpc).toHaveBeenCalledWith('profile_badges', { p_user_id: 'u1' })
  })

  it('adminSaveEvent gửi p_event snake_case, tạo mới thì không có id', async () => {
    const s = stub({ rpc: { data: 'new-id', error: null } })
    const input = {
      title: { en: 'Cup' }, description: {}, gameId: 'sugoku', mode: 'easy', agg: 'best' as const,
      startsAt: 's', endsAt: 'e', awardTop: 3,
    }
    expect(await s.api.adminSaveEvent(input)).toBe('new-id')
    expect(s.rpc).toHaveBeenCalledWith('admin_save_event', {
      p_event: {
        title: { en: 'Cup' }, description: {}, game_id: 'sugoku', mode: 'easy', agg: 'best',
        starts_at: 's', ends_at: 'e', award_top: 3,
      },
    })
    expect('id' in (s.rpc.mock.calls[0][1] as { p_event: object }).p_event).toBe(false)
    await s.api.adminSaveEvent({ ...input, id: 'e1' })
    expect((s.rpc.mock.calls[1][1] as { p_event: { id: string } }).p_event.id).toBe('e1')
  })

  it('adminSaveCollection map khóa và bỏ id khi tạo', async () => {
    const s = stub({ rpc: { data: 'c9', error: null } })
    expect(await s.api.adminSaveCollection({ title: { en: 'S' }, gameIds: ['a'], startsAt: 's', endsAt: null, sort: 1 })).toBe('c9')
    expect(s.rpc).toHaveBeenCalledWith('admin_save_collection', {
      p_collection: { title: { en: 'S' }, game_ids: ['a'], starts_at: 's', ends_at: null, sort: 1 },
    })
  })

  it('adminRuns gửi p_* và bỏ tham số undefined, p_before giữ nguyên chuỗi', async () => {
    const row = {
      id: 'r1', user_id: 'u1', display_name: 'Ann', game_id: 'g', mode: 'm', started_at: '2026-01-01T00:00:00.123456+00:00',
      ended_at: null, score: '5', time_ms: null, won: null, assisted: false, status: 'started', reject_reason: null,
    }
    const s = stub({ rpc: { data: [row], error: null } })
    const out = await s.api.adminRuns({ gameId: 'g', before: '2026-01-01T00:00:00.123456+00:00', limit: 20 })
    expect(s.rpc).toHaveBeenCalledWith('admin_runs', {
      p_game_id: 'g', p_before: '2026-01-01T00:00:00.123456+00:00', p_limit: 20,
    })
    const args = s.rpc.mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(args).sort()).toEqual(['p_before', 'p_game_id', 'p_limit'])
    expect('p_mode' in args).toBe(false)
    expect(out[0]).toMatchObject({ id: 'r1', userId: 'u1', score: 5, timeMs: null, rejectReason: null, status: 'started' })
  })

  it('các RPC admin còn lại dùng đúng tên tham số', async () => {
    const player = { id: 'u1', display_name: 'A', avatar_url: null, role: 'admin', banned: false, created_at: 't', runs: '4' }
    const s = stub({ rpc: { data: [player], error: null } })
    await s.api.adminUpdateGame('g', null, { easy: { max_score: 3 } })
    expect(s.rpc).toHaveBeenCalledWith('admin_update_game', { p_game_id: 'g', p_hidden: null, p_rules: { easy: { max_score: 3 } } })
    await s.api.adminCancelEvent('e1')
    expect(s.rpc).toHaveBeenCalledWith('admin_cancel_event', { p_event_id: 'e1' })
    await s.api.adminRecomputeEvent('e1')
    expect(s.rpc).toHaveBeenCalledWith('admin_recompute_event', { p_event_id: 'e1' })
    await s.api.adminDeleteCollection('c1')
    expect(s.rpc).toHaveBeenCalledWith('admin_delete_collection', { p_id: 'c1' })
    await s.api.adminRejectRun('r1', 'why')
    expect(s.rpc).toHaveBeenCalledWith('admin_reject_run', { p_run_id: 'r1', p_reason: 'why' })
    await s.api.adminSetBanned('u1', true)
    expect(s.rpc).toHaveBeenCalledWith('admin_set_banned', { p_user_id: 'u1', p_banned: true })
    expect(await s.api.adminPlayers('ann')).toEqual([
      { id: 'u1', displayName: 'A', avatarUrl: null, role: 'admin', banned: false, createdAt: 't', runs: 4 },
    ])
    expect(s.rpc).toHaveBeenCalledWith('admin_players', { p_query: 'ann', p_limit: 50 })
  })

  it('mã lỗi SQL nằm sau dấu ": " cuối của message', async () => {
    const s = stub({ rpc: { data: null, error: { message: 'event_started' } } })
    await expect(s.api.adminCancelEvent('e')).rejects.toThrow('admin_cancel_event: event_started')
  })

  it('currentUser: isAdmin theo rpc is_admin; RPC lỗi -> false', async () => {
    const mk = (isAdmin: Res) => {
      const s = stub({
        rpc: (fn) => (fn === 'is_admin' ? isAdmin : { data: null, error: null }),
        table: { data: { id: 'u1', display_name: 'Ann', avatar_url: null }, error: null },
      })
      const sb = {
        rpc: s.rpc, from: s.from,
        auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }) },
      } as unknown as SupabaseClient
      return createApiFromClient(sb)
    }
    expect((await mk({ data: true, error: null }).currentUser())?.isAdmin).toBe(true)
    expect((await mk({ data: false, error: null }).currentUser())?.isAdmin).toBe(false)
    expect((await mk({ data: null, error: { message: 'x' } }).currentUser())?.isAdmin).toBe(false)
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
