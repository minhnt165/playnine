import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ServerApi } from './api'
import type {
  AdminPlayer, AdminRun, AuthUser, Badge, BestRow, Collection, EventInput, EventPatch, FeedItem, FinishResult, GameEvent, GameMeta,
  LeaderRow, Metric, ModeMeta, Period, PlayerRow, PointsSummary, Post, Profile, RunResult, Rules, Text, TopRow,
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

const toLeaderRow = (r: Row): LeaderRow => ({
  rank: Number(r.rank),
  userId: String(r.user_id),
  displayName: String(r.display_name ?? ''),
  avatarUrl: typeof r.avatar_url === 'string' && r.avatar_url ? r.avatar_url : null,
  value: Number(r.value),
  achievedAt: String(r.achieved_at),
})

const toEvent = (r: Row): GameEvent => ({
  id: String(r.id),
  title: r.title as Text,
  description: (r.description ?? {}) as GameEvent['description'],
  gameId: String(r.game_id),
  mode: String(r.mode),
  agg: r.agg as GameEvent['agg'],
  startsAt: String(r.starts_at),
  endsAt: String(r.ends_at),
  awardTop: Number(r.award_top),
  status: r.status as GameEvent['status'],
})

const toCollection = (r: Row): Collection => ({
  id: String(r.id),
  title: r.title as Text,
  gameIds: Array.isArray(r.game_ids) ? r.game_ids.map(String) : [],
  startsAt: String(r.starts_at),
  endsAt: r.ends_at == null ? null : String(r.ends_at),
  sort: Number(r.sort ?? 0),
})

const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v))

const toPost = (r: Row): Post => ({
  id: String(r.id),
  slug: String(r.slug),
  title: r.title as Text,
  summary: (r.summary ?? {}) as Post['summary'],
  body: (r.body ?? {}) as Post['body'],
  gameId: r.game_id == null ? null : String(r.game_id),
  tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
  pinned: Boolean(r.pinned),
  publishedAt: r.published_at == null ? null : String(r.published_at),
  updatedAt: String(r.updated_at),
})
const POST_COLS = 'id, slug, title, summary, body, game_id, tags, pinned, published_at, updated_at'

const toFeedItem = (r: Row): FeedItem => ({
  id: String(r.id),
  url: String(r.url),
  source: String(r.source),
  lang: r.lang === 'vi' ? 'vi' : 'en',
  title: String(r.title),
  summary: r.summary == null ? null : String(r.summary),
  imageUrl: r.image_url == null ? null : String(r.image_url),
  publishedAt: String(r.published_at),
  hidden: Boolean(r.hidden),
})
const FEED_COLS = 'id, url, source, lang, title, summary, image_url, published_at, hidden'

const toAdminRun = (r: Row): AdminRun => ({
  id: String(r.id),
  userId: String(r.user_id),
  displayName: String(r.display_name ?? ''),
  gameId: String(r.game_id),
  mode: String(r.mode),
  startedAt: String(r.started_at),
  endedAt: r.ended_at == null ? null : String(r.ended_at),
  score: numOrNull(r.score),
  timeMs: numOrNull(r.time_ms),
  won: r.won == null ? null : Boolean(r.won),
  assisted: Boolean(r.assisted),
  status: r.status as AdminRun['status'],
  rejectReason: r.reject_reason == null ? null : String(r.reject_reason),
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

  async function userOf(
    sessionUser: { id: string; is_anonymous?: boolean; user_metadata?: Record<string, unknown> } | undefined,
  ): Promise<AuthUser | null> {
    if (!sessionUser) return null
    const isGuest = sessionUser.is_anonymous === true
    const p = await loadProfile(sessionUser.id)
    // RPC lỗi thì coi như không phải admin (không chặn đăng nhập).
    const isAdmin = await sb.rpc('is_admin').then(
      ({ data, error }) => !error && data === true,
      () => false,
    )
    if (p) return { ...p, isAdmin, isGuest }
    // Hàng profiles có thể chưa kịp tạo ngay sau lần đăng nhập đầu.
    const name = sessionUser.user_metadata?.name
    return { id: sessionUser.id, displayName: typeof name === 'string' && name ? name : 'Player', avatarUrl: null, isAdmin, isGuest }
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
    async signInAsGuest() {
      const { error } = await sb.auth.signInAnonymously()
      if (error) fail('signInAsGuest', error)
    },
    async linkGoogle() {
      const { error } = await sb.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname },
      })
      if (error) fail('linkGoogle', error)
    },
    async signOut() {
      const { error } = await sb.auth.signOut()
      if (error) fail('signOut', error)
    },
    async gameMeta() {
      // Server chưa chạy migration điểm thì chưa có cột points: đọc lại như cũ để cổng vẫn chạy.
      let { data, error } = await sb.from('games').select('id, metric, modes, hidden, points')
      if (error) ({ data, error } = await sb.from('games').select('id, metric, modes, hidden'))
      if (error) fail('gameMeta', error)
      return ((data ?? []) as Row[]).map(
        (r): GameMeta => ({
          id: String(r.id),
          metric: r.metric as Metric,
          modes: (Array.isArray(r.modes) ? r.modes : []).map((m: Row): ModeMeta => ({
            key: String(m.key),
            label: m.label as ModeMeta['label'],
            ...(m.rules && typeof m.rules === 'object' ? { rules: m.rules as Rules } : {}),
            ...(typeof m.points === 'number' ? { points: m.points } : {}),
          })),
          hidden: Boolean(r.hidden),
          ...(r.points != null ? { points: Number(r.points) } : {}),
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
      return (rows ?? []).map(toLeaderRow)
    },
    async myRank(gameId, mode, period) {
      const rows = await rpc<Row[] | null>('my_rank', { p_game_id: gameId, p_mode: mode, p_period: period })
      const r = rows?.[0]
      return r ? { rank: Number(r.rank), value: Number(r.value) } : null
    },
    async playerLeaderboard(kind, period, limit = 50) {
      const rows = await rpc<Row[] | null>('player_leaderboard', { p_kind: kind, p_period: period, p_limit: limit })
      return (rows ?? []).map((r): PlayerRow => {
        const { achievedAt: _, ...row } = toLeaderRow(r)
        return row
      })
    },
    async gamePointsBoard(gameId, period, limit = 50) {
      const rows = await rpc<Row[] | null>('game_points_board', { p_game_id: gameId, p_period: period, p_limit: limit })
      return (rows ?? []).map(toLeaderRow)
    },
    async myGamePoints(gameId, period) {
      const rows = await rpc<Row[] | null>('my_game_points', { p_game_id: gameId, p_period: period })
      const r = rows?.[0]
      return r ? { rank: Number(r.rank), value: Number(r.value) } : null
    },
    async ratingSummary() {
      const out: Record<string, { average: number; count: number }> = {}
      for (const r of (await rpc<Row[] | null>('game_rating_summary')) ?? []) {
        out[String(r.game_id)] = { average: Number(r.average), count: Number(r.count) }
      }
      return out
    },
    async myRatings() {
      const out: Record<string, number> = {}
      for (const r of (await rpc<Row[] | null>('my_ratings')) ?? []) out[String(r.game_id)] = Number(r.stars)
      return out
    },
    async rateGame(gameId, stars) {
      await rpc('rate_game', { p_game_id: gameId, p_stars: stars })
    },
    async playerPoints(userId) {
      const rows = await rpc<Row[] | null>('player_points', { p_user_id: userId })
      const out: PointsSummary = {}
      for (const r of rows ?? []) {
        const p = r.period as Period
        if (p === 'day' || p === 'week' || p === 'all') out[p] = { points: Number(r.points), rank: r.rank == null ? null : Number(r.rank) }
      }
      return out
    },
    async topBoards(period, limit = 3) {
      const rows = await rpc<Row[] | null>('top_boards', { p_period: period, p_limit: limit })
      return (rows ?? []).map((r): TopRow => ({ ...toLeaderRow(r), gameId: String(r.game_id), mode: String(r.mode) }))
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
    async events() {
      const { data, error } = await sb.from('events').select('*')
      if (error) fail('events', error)
      return ((data ?? []) as Row[]).map(toEvent)
    },
    async eventLeaderboard(eventId, limit = 50) {
      const rows = await rpc<Row[] | null>('event_leaderboard', { p_event_id: eventId, p_limit: limit })
      return (rows ?? []).map(toLeaderRow)
    },
    async collections() {
      const { data, error } = await sb.from('collections').select('*')
      if (error) fail('collections', error)
      return ((data ?? []) as Row[]).map(toCollection)
    },
    async profileBadges(userId) {
      const rows = await rpc<Row[] | null>('profile_badges', { p_user_id: userId })
      return (rows ?? []).map(
        (r): Badge => ({
          eventId: String(r.event_id),
          rank: Number(r.rank),
          awardedAt: String(r.awarded_at),
          title: r.title as Text,
          gameId: String(r.game_id),
          mode: String(r.mode),
        }),
      )
    },
    async posts() {
      const { data, error } = await sb
        .from('posts')
        .select(POST_COLS)
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false })
      if (error) fail('posts', error)
      return ((data ?? []) as Row[]).map(toPost)
    },
    async post(slug) {
      const { data, error } = await sb.from('posts').select(POST_COLS).eq('slug', slug).maybeSingle()
      if (error) fail('post', error)
      return data ? toPost(data as Row) : null
    },
    async adminPosts() {
      return ((await rpc<Row[] | null>('admin_posts')) ?? []).map(toPost)
    },
    async adminSavePost(p) {
      return String(
        await rpc<string>('admin_save_post', {
          p_post: {
            ...(p.id ? { id: p.id } : {}),
            slug: p.slug,
            title: p.title,
            summary: p.summary,
            body: p.body,
            game_id: p.gameId,
            tags: p.tags,
            pinned: p.pinned,
            published_at: p.publishedAt,
          },
        }),
      )
    },
    async adminDeletePost(id) {
      await rpc('admin_delete_post', { p_id: id })
    },
    async newsFeed(limit = 60) {
      const { data, error } = await sb.from('news_feed').select(FEED_COLS).order('published_at', { ascending: false }).limit(limit)
      if (error) fail('newsFeed', error)
      return ((data ?? []) as Row[]).map(toFeedItem)
    },
    async adminNewsFeed() {
      return ((await rpc<Row[] | null>('admin_news_feed')) ?? []).map(toFeedItem)
    },
    async adminHideNews(id, hidden) {
      await rpc('admin_hide_news', { p_id: id, p_hidden: hidden })
    },
    async adminUpdateGame(gameId, hidden, rules, points, modePoints) {
      // Chỉ gửi p_points / p_mode_points khi đổi, để vẫn gọi được hàm cũ trên server chưa có tham số này.
      await rpc('admin_update_game', {
        p_game_id: gameId,
        p_hidden: hidden,
        p_rules: rules,
        ...(points != null ? { p_points: points } : {}),
        ...(modePoints && Object.keys(modePoints).length > 0 ? { p_mode_points: modePoints } : {}),
      })
    },
    async adminSaveEvent(e: EventInput | EventPatch) {
      // Không có id = tạo mới; không thêm khóa undefined (khóa thiếu nghĩa là giữ giá trị cũ khi sửa).
      const full: Row = {
        id: e.id || undefined,
        title: e.title,
        description: e.description,
        game_id: e.gameId,
        mode: e.mode,
        agg: e.agg,
        starts_at: e.startsAt,
        ends_at: e.endsAt,
        award_top: e.awardTop,
      }
      const p_event: Row = Object.fromEntries(Object.entries(full).filter(([, v]) => v !== undefined))
      return String(await rpc<string>('admin_save_event', { p_event }))
    },
    async adminCancelEvent(id) {
      await rpc('admin_cancel_event', { p_event_id: id })
    },
    async adminRecomputeEvent(id) {
      await rpc('admin_recompute_event', { p_event_id: id })
    },
    async adminSaveCollection(c) {
      const p_collection: Row = {
        ...(c.id ? { id: c.id } : {}),
        title: c.title,
        game_ids: c.gameIds,
        starts_at: c.startsAt,
        ends_at: c.endsAt,
        sort: c.sort,
      }
      return String(await rpc<string>('admin_save_collection', { p_collection }))
    },
    async adminDeleteCollection(id) {
      await rpc('admin_delete_collection', { p_id: id })
    },
    async adminRuns(f) {
      const args: Row = {}
      // p_before giữ nguyên chuỗi server trả (không đi qua Date để khỏi mất độ chính xác micro giây).
      if (f.gameId !== undefined) args.p_game_id = f.gameId
      if (f.mode !== undefined) args.p_mode = f.mode
      if (f.userId !== undefined) args.p_user_id = f.userId
      if (f.status !== undefined) args.p_status = f.status
      if (f.before !== undefined) args.p_before = f.before
      if (f.limit !== undefined) args.p_limit = f.limit
      const rows = await rpc<Row[] | null>('admin_runs', args)
      return (rows ?? []).map(toAdminRun)
    },
    async adminRejectRun(runId, reason) {
      await rpc('admin_reject_run', { p_run_id: runId, p_reason: reason ?? null })
    },
    async adminPlayers(query) {
      const rows = await rpc<Row[] | null>('admin_players', { p_query: query, p_limit: 50 })
      return (rows ?? []).map(
        (r): AdminPlayer => ({
          id: String(r.id),
          displayName: String(r.display_name ?? ''),
          avatarUrl: typeof r.avatar_url === 'string' && r.avatar_url ? r.avatar_url : null,
          role: r.role === 'admin' ? 'admin' : 'player',
          banned: Boolean(r.banned),
          createdAt: String(r.created_at),
          runs: Number(r.runs),
        }),
      )
    },
    async adminSetBanned(userId, banned) {
      await rpc('admin_set_banned', { p_user_id: userId, p_banned: banned })
    },
  }
}
