// Chỉ dùng trong test; không được import từ code chạy thật.
import type { ServerApi } from './api'
import type {
  AdminPlayer, AdminRun, AuthUser, Badge, BestRow, Collection, FeedItem, FinishResult, HistoryRun, SaveRow, GameEvent, GameMeta, LeaderRow, Period,
  PlayerRow, PointsSummary, Post, Profile, RatingSummary, RunResult, TopRow,
} from './types'

export type FakeRun = { id: string; gameId: string; mode: string; result?: RunResult }
export type FakeState = {
  user: AuthUser | null
  games: GameMeta[]
  /** Khóa bảng xếp hạng: `${gameId}|${mode}|${period}` */
  boards: Record<string, LeaderRow[]>
  totals: Record<string, number>
  profiles: Record<string, Profile>
  bests: Record<string, BestRow[]>
  runs: FakeRun[]
  myRanks: Record<string, { rank: number; value: number }>
  /** Xếp hạng người chơi, khóa `${kind}|${period}`. */
  playerBoards: Record<string, PlayerRow[]>
  /** Bảng điểm theo game, khóa `${gameId}|${period}`. */
  gamePoints: Record<string, LeaderRow[]>
  myGamePoints: Record<string, { rank: number; value: number }>
  ratings: Record<string, RatingSummary>
  myRatings: Record<string, number>
  /** Mọi bài (kể cả nháp); posts() chỉ trả bài đã đăng. */
  posts: Post[]
  /** Game yêu thích của người đang đăng nhập (mới thêm trước). */
  favorites: string[]
  /** Lịch sử ván của người đang đăng nhập (mới nhất trước). */
  history: HistoryRun[]
  /** Tiến độ game trên tài khoản (như bảng user_saves). */
  saves: SaveRow[]
  /** Mọi tin tự động (kể cả đã ẩn); newsFeed() chỉ trả tin chưa ẩn. */
  feed: FeedItem[]
  /** Điểm theo id người chơi. */
  points: Record<string, PointsSummary>
  /** Top mọi game theo kỳ. */
  topBoards: Partial<Record<Period, TopRow[]>>
  finish: FinishResult
  events: GameEvent[]
  /** Bảng xếp hạng sự kiện theo id sự kiện. */
  eventBoards: Record<string, LeaderRow[]>
  collections: Collection[]
  /** Huy hiệu theo id người chơi. */
  badges: Record<string, Badge[]>
  adminRuns: AdminRun[]
  adminPlayers: AdminPlayer[]
}

const defaultGames = (): GameMeta[] => [
  { id: 'sugoku', metric: 'time_low', hidden: false, modes: [{ key: 'easy', label: { en: 'Easy', vi: 'Dễ' } }] },
  { id: 'minesweeper', metric: 'time_low', hidden: false, modes: [{ key: 'beginner', label: { en: 'Beginner', vi: 'Dễ' } }] },
]

export type FakeApi = ServerApi & {
  state: FakeState
  calls: { method: string; args: unknown[] }[]
  fail(method: keyof ServerApi, err?: Error): void
}

export function createFakeApi(seed: Partial<FakeState> = {}): FakeApi {
  const state: FakeState = {
    user: null, games: defaultGames(), boards: {}, totals: {}, profiles: {}, bests: {}, runs: [], myRanks: {},
    playerBoards: {}, topBoards: {}, points: {}, posts: [], feed: [], favorites: [], history: [], saves: [], gamePoints: {}, myGamePoints: {}, ratings: {}, myRatings: {},
    finish: { status: 'finished', reason: null, ranks: {} },
    events: [], eventBoards: {}, collections: [], badges: {}, adminRuns: [], adminPlayers: [],
    ...seed,
  }
  const calls: FakeApi['calls'] = []
  const failures = new Map<string, Error>()
  const listeners = new Set<(u: AuthUser | null) => void>()

  // Ghi lại lời gọi và ném lỗi nếu phương thức đã bị đặt fail().
  const run = async <T>(method: string, args: unknown[], fn: () => T): Promise<T> => {
    calls.push({ method, args })
    const err = failures.get(method)
    if (err) throw err
    return fn()
  }

  return {
    state,
    calls,
    fail(method, err = new Error(`fake ${method} failed`)) {
      failures.set(method, err)
    },
    currentUser: () => run('currentUser', [], () => state.user),
    onAuthChange(cb) {
      calls.push({ method: 'onAuthChange', args: [] })
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    signInWithGoogle: () => run('signInWithGoogle', [], () => undefined),
    signInAsGuest: () =>
      run('signInAsGuest', [], () => {
        state.user = { id: 'guest-1', displayName: 'Guest-ABCD', avatarUrl: null, isGuest: true }
        listeners.forEach((l) => l(state.user))
      }),
    linkGoogle: () => run('linkGoogle', [], () => undefined),
    signOut: () =>
      run('signOut', [], () => {
        state.user = null
        listeners.forEach((l) => l(null))
      }),
    gameMeta: () => run('gameMeta', [], () => state.games),
    playTotals: () => run('playTotals', [], () => state.totals),
    recordPlay: (gameId) =>
      run('recordPlay', [gameId], () => {
        state.totals[gameId] = (state.totals[gameId] ?? 0) + 1
      }),
    startRun: (gameId, mode) =>
      run('startRun', [gameId, mode], () => {
        const id = `run-${state.runs.length + 1}`
        state.runs.push({ id, gameId, mode })
        return id
      }),
    finishRun: (runId, r) =>
      run('finishRun', [runId, r], () => {
        const found = state.runs.find((x) => x.id === runId)
        if (found) found.result = r
        return state.finish
      }),
    leaderboard: (gameId, mode, period: Period, limit) =>
      run('leaderboard', [gameId, mode, period, limit], () =>
        (state.boards[`${gameId}|${mode}|${period}`] ?? []).slice(0, limit ?? 50),
      ),
    myRank: (gameId, mode, period) =>
      run('myRank', [gameId, mode, period], () => state.myRanks[`${gameId}|${mode}|${period}`] ?? null),
    playerLeaderboard: (kind, period, limit) =>
      run('playerLeaderboard', [kind, period, limit], () => (state.playerBoards[`${kind}|${period}`] ?? []).slice(0, limit ?? 50)),
    gamePointsBoard: (gameId, period, limit) =>
      run('gamePointsBoard', [gameId, period, limit], () => (state.gamePoints[`${gameId}|${period}`] ?? []).slice(0, limit ?? 50)),
    myGamePoints: (gameId, period) => run('myGamePoints', [gameId, period], () => state.myGamePoints[`${gameId}|${period}`] ?? null),
    ratingSummary: () => run('ratingSummary', [], () => state.ratings),
    myRatings: () => run('myRatings', [], () => state.myRatings),
    rateGame: (gameId, stars) =>
      run('rateGame', [gameId, stars], () => {
        if (stars === null) delete state.myRatings[gameId]
        else state.myRatings[gameId] = stars
      }),
    playerPoints: (userId) => run('playerPoints', [userId], () => state.points[userId] ?? {}),
    topBoards: (period, limit) => run('topBoards', [period, limit], () => state.topBoards[period] ?? []),
    profile: (userId) => run('profile', [userId], () => state.profiles[userId] ?? null),
    profileBests: (userId) => run('profileBests', [userId], () => state.bests[userId] ?? []),
    updateDisplayName: (name) =>
      run('updateDisplayName', [name], () => {
        if (state.user) state.user = { ...state.user, displayName: name }
        listeners.forEach((l) => l(state.user))
      }),
    events: () => run('events', [], () => state.events),
    eventLeaderboard: (eventId, limit) =>
      run('eventLeaderboard', [eventId, limit], () => (state.eventBoards[eventId] ?? []).slice(0, limit ?? 50)),
    collections: () => run('collections', [], () => state.collections),
    profileBadges: (userId) => run('profileBadges', [userId], () => state.badges[userId] ?? []),
    posts: () =>
      run('posts', [], () =>
        state.posts
          .filter((p) => p.publishedAt !== null && Date.parse(p.publishedAt) <= Date.now())
          .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!)),
      ),
    post: (slug) =>
      run('post', [slug], () => state.posts.find((p) => p.slug === slug && p.publishedAt !== null && Date.parse(p.publishedAt) <= Date.now()) ?? null),
    adminPosts: () => run('adminPosts', [], () => state.posts),
    adminSavePost: (p) =>
      run('adminSavePost', [p], () => {
        const id = p.id ?? `post-${state.posts.length + 1}`
        const saved: Post = { ...p, id, updatedAt: new Date().toISOString() }
        state.posts = state.posts.some((x) => x.id === id) ? state.posts.map((x) => (x.id === id ? saved : x)) : [...state.posts, saved]
        return id
      }),
    adminDeletePost: (id) =>
      run('adminDeletePost', [id], () => {
        state.posts = state.posts.filter((p) => p.id !== id)
      }),
    favorites: () =>
      run('favorites', [], () => {
        if (!state.user) throw new Error('not_authenticated')
        return state.favorites
      }),
    setFavorite: (gameId, on) =>
      run('setFavorite', [gameId, on], () => {
        if (!state.user) throw new Error('not_authenticated')
        state.favorites = on ? (state.favorites.includes(gameId) ? state.favorites : [gameId, ...state.favorites]) : state.favorites.filter((g) => g !== gameId)
      }),
    myRuns: (opts = {}) =>
      run('myRuns', [opts], () => {
        if (!state.user) throw new Error('not_authenticated')
        return state.history
          .filter((r) => (!opts.gameId || r.gameId === opts.gameId) && (!opts.before || r.endedAt < opts.before))
          .slice(0, opts.limit ?? 30)
      }),
    mySaves: (since) =>
      run('mySaves', [since], () => {
        if (!state.user) throw new Error('not_authenticated')
        return state.saves.filter((s) => since === null || s.syncedAt > since)
      }),
    putSaves: (items) =>
      run('putSaves', [items], () => {
        if (!state.user) throw new Error('not_authenticated')
        let n = 0
        for (const it of items) {
          const cur = state.saves.find((s) => s.key === it.key)
          if (cur && Date.parse(cur.updatedAt) >= Date.parse(it.updatedAt)) continue
          // Giờ server nhận luôn tăng dần (như now() của các transaction nối tiếp).
          const last = Math.max(0, ...state.saves.map((s) => Date.parse(s.syncedAt)))
          const row: SaveRow = { key: it.key, value: it.value, updatedAt: it.updatedAt, syncedAt: new Date(Math.max(Date.now(), last + 1)).toISOString() }
          state.saves = [...state.saves.filter((s) => s.key !== it.key), row]
          n++
        }
        return n
      }),
    newsFeed: (limit) =>
      run('newsFeed', [limit], () =>
        state.feed
          .filter((f) => !f.hidden)
          .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
          .slice(0, limit ?? 60),
      ),
    adminNewsFeed: () => run('adminNewsFeed', [], () => state.feed),
    adminHideNews: (id, hidden) =>
      run('adminHideNews', [id, hidden], () => {
        if (!state.feed.some((f) => f.id === id)) throw new Error('not_found')
        state.feed = state.feed.map((f) => (f.id === id ? { ...f, hidden } : f))
      }),
    adminUpdateGame: (gameId, hidden, rules, points, modePoints) =>
      // Ghi đúng số tham số đã truyền (bỏ các tham số cuối undefined).
      run('adminUpdateGame', modePoints !== undefined ? [gameId, hidden, rules, points, modePoints] : points === undefined ? [gameId, hidden, rules] : [gameId, hidden, rules, points], () => {
        state.games = state.games.map((g) =>
          g.id !== gameId
            ? g
            : {
                ...g,
                hidden: hidden ?? g.hidden,
                ...(points != null ? { points } : {}),
                modes: g.modes.map((m0) => {
                  const m = rules[m0.key] ? { ...m0, rules: rules[m0.key] } : m0
                  if (!modePoints || !(m.key in modePoints)) return m
                  const v = modePoints[m.key]
                  if (v !== null) return { ...m, points: v }
                  const { points: _drop, ...rest } = m
                  return rest
                }),
              },
        )
      }),
    adminSaveEvent: (e) =>
      run('adminSaveEvent', [e], () => {
        const id = e.id ?? `ev-${state.events.length + 1}`
        const old = state.events.find((x) => x.id === id)
        const saved = { ...old, ...e, id, status: old?.status ?? 'scheduled' } as GameEvent
        state.events = old ? state.events.map((x) => (x.id === id ? saved : x)) : [...state.events, saved]
        return id
      }),
    adminCancelEvent: (id) =>
      run('adminCancelEvent', [id], () => {
        state.events = state.events.map((e) => (e.id === id ? { ...e, status: 'cancelled' } : e))
      }),
    adminRecomputeEvent: (id) => run('adminRecomputeEvent', [id], () => undefined),
    adminSaveCollection: (c) =>
      run('adminSaveCollection', [c], () => {
        const id = c.id ?? `col-${state.collections.length + 1}`
        const saved: Collection = { ...c, id }
        state.collections = state.collections.some((x) => x.id === id)
          ? state.collections.map((x) => (x.id === id ? saved : x))
          : [...state.collections, saved]
        return id
      }),
    adminDeleteCollection: (id) =>
      run('adminDeleteCollection', [id], () => {
        state.collections = state.collections.filter((c) => c.id !== id)
      }),
    adminRuns: (f) =>
      run('adminRuns', [f], () =>
        state.adminRuns
          .filter(
            (r) =>
              (f.gameId === undefined || r.gameId === f.gameId) &&
              (f.mode === undefined || r.mode === f.mode) &&
              (f.userId === undefined || r.userId === f.userId) &&
              (f.status === undefined || r.status === f.status) &&
              (f.before === undefined || r.startedAt < f.before),
          )
          .slice(0, f.limit ?? 50),
      ),
    adminRejectRun: (runId, reason) =>
      run('adminRejectRun', [runId, reason], () => {
        state.adminRuns = state.adminRuns.map((r) =>
          r.id === runId ? { ...r, status: 'rejected', rejectReason: reason ?? null } : r,
        )
      }),
    adminPlayers: (query) =>
      run('adminPlayers', [query], () => {
        const q = query.trim().toLowerCase()
        return state.adminPlayers.filter((p) => !q || p.id === query.trim() || p.displayName.toLowerCase().includes(q))
      }),
    adminSetBanned: (userId, banned) =>
      run('adminSetBanned', [userId, banned], () => {
        state.adminPlayers = state.adminPlayers.map((p) => (p.id === userId ? { ...p, banned } : p))
      }),
  }
}
