import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ServerApi } from './api'
import type {
  AuthUser, BestRow, FinishResult, GameMeta, LeaderRow, Metric, ModeMeta, Period, Profile, RunResult,
} from './types'

type Row = Record<string, unknown>

const fail = (op: string, error: { message: string } | null): never => {
  throw new Error(`${op}: ${error ? error.message : 'unknown error'}`)
}

const toProfile = (r: Row): Profile => ({
  id: String(r.id),
  displayName: String(r.display_name ?? ''),
  avatarUrl: typeof r.avatar_url === 'string' && r.avatar_url ? r.avatar_url : null,
})

/** Client Supabase thật. Chỉ dùng anon key; mọi ghi của người chơi đi qua RPC. */
export function createSupabaseApi(url: string, anonKey: string): ServerApi {
  return createApiFromClient(
    createClient(url, anonKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
    }),
  )
}

/** Dựng ServerApi từ một client có sẵn (test truyền client giả vào đây). */
export function createApiFromClient(sb: SupabaseClient): ServerApi {

  // Tên/ảnh lấy từ bảng profiles (không lấy từ metadata Google) để tên đã đổi được dùng.
  async function loadProfile(id: string): Promise<Profile | null> {
    const { data, error } = await sb.from('profiles').select('id, display_name, avatar_url').eq('id', id).maybeSingle()
    if (error) fail('profile', error)
    return data ? toProfile(data as Row) : null
  }

  async function userOf(sessionUser: { id: string; user_metadata?: Record<string, unknown> } | undefined): Promise<AuthUser | null> {
    if (!sessionUser) return null
    const p = await loadProfile(sessionUser.id)
    if (p) return p
    // Hàng profiles có thể chưa kịp tạo ngay sau lần đăng nhập đầu.
    const name = sessionUser.user_metadata?.name
    return { id: sessionUser.id, displayName: typeof name === 'string' && name ? name : 'Player', avatarUrl: null }
  }

  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args)
    if (error) fail(fn, error)
    return data as T
  }

  return {
    async currentUser() {
      const { data, error } = await sb.auth.getSession()
      if (error) fail('getSession', error)
      return userOf(data.session?.user)
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        // Không await lời gọi supabase ngay trong callback (tránh deadlock khóa auth).
        setTimeout(() => {
          userOf(session?.user).then(cb, () => cb(null))
        }, 0)
      })
      return () => data.subscription.unsubscribe()
    },
    async signInWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname },
      })
      if (error) fail('signInWithGoogle', error)
    },
    async signOut() {
      const { error } = await sb.auth.signOut()
      if (error) fail('signOut', error)
    },
    async gameMeta() {
      const { data, error } = await sb.from('games').select('id, metric, modes, hidden')
      if (error) fail('gameMeta', error)
      return ((data ?? []) as Row[]).map(
        (r): GameMeta => ({
          id: String(r.id),
          metric: r.metric as Metric,
          modes: (Array.isArray(r.modes) ? r.modes : []).map((m: Row): ModeMeta => ({
            key: String(m.key),
            label: m.label as ModeMeta['label'],
          })),
          hidden: Boolean(r.hidden),
        }),
      )
    },
    async playTotals() {
      const rows = await rpc<Row[] | null>('play_totals')
      const out: Record<string, number> = {}
      for (const r of rows ?? []) out[String(r.game_id)] = Number(r.total)
      return out
    },
    async recordPlay(gameId) {
      await rpc('record_play', { p_game_id: gameId })
    },
    async startRun(gameId, mode) {
      return String(await rpc<string>('start_run', { p_game_id: gameId, p_mode: mode }))
    },
    async finishRun(runId, r: RunResult) {
      const d = await rpc<Row>('finish_run', {
        p_run_id: runId,
        p_score: r.score ?? null,
        p_time_ms: r.timeMs ?? null,
        p_won: r.won,
        p_assisted: r.assisted,
      })
      const ranks: Partial<Record<Period, number>> = {}
      const src = (d.ranks ?? {}) as Row
      for (const k of ['day', 'week', 'all'] as const) if (src[k] != null) ranks[k] = Number(src[k])
      return { status: d.status as FinishResult['status'], reason: (d.reason as string | null) ?? null, ranks }
    },
    async leaderboard(gameId, mode, period, limit = 50) {
      const rows = await rpc<Row[] | null>('leaderboard', {
        p_game_id: gameId, p_mode: mode, p_period: period, p_limit: limit,
      })
      return (rows ?? []).map(
        (r): LeaderRow => ({
          rank: Number(r.rank),
          userId: String(r.user_id),
          displayName: String(r.display_name ?? ''),
          avatarUrl: typeof r.avatar_url === 'string' && r.avatar_url ? r.avatar_url : null,
          value: Number(r.value),
          achievedAt: String(r.achieved_at),
        }),
      )
    },
    async myRank(gameId, mode, period) {
      const rows = await rpc<Row[] | null>('my_rank', { p_game_id: gameId, p_mode: mode, p_period: period })
      const r = rows?.[0]
      return r ? { rank: Number(r.rank), value: Number(r.value) } : null
    },
    profile: loadProfile,
    async profileBests(userId) {
      const rows = await rpc<Row[] | null>('profile_bests', { p_user_id: userId })
      return (rows ?? []).map(
        (r): BestRow => ({
          gameId: String(r.game_id),
          mode: String(r.mode),
          metric: r.metric as Metric,
          value: Number(r.value),
          achievedAt: String(r.achieved_at),
        }),
      )
    },
    async updateDisplayName(name) {
      const { data } = await sb.auth.getUser()
      if (!data.user) throw new Error('updateDisplayName: not signed in')
      const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', data.user.id)
      if (error) fail('updateDisplayName', error)
    },
  }
}
