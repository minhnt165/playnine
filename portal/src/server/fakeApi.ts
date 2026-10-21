// Chỉ dùng trong test; không được import từ code chạy thật.
import type { ServerApi } from './api'
import type {
  AdminPlayer, AdminRun, AuthUser, Badge, BestRow, Collection, FinishResult, GameEvent, GameMeta, LeaderRow, Period,
  Profile, RunResult,
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
    adminUpdateGame: (gameId, hidden, rules) =>
      run('adminUpdateGame', [gameId, hidden, rules], () => {
        state.games = state.games.map((g) =>
          g.id !== gameId
            ? g
            : {
                ...g,
                hidden: hidden ?? g.hidden,
                modes: g.modes.map((m) => (rules[m.key] ? { ...m, rules: rules[m.key] } : m)),
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
