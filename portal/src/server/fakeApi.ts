// Chỉ dùng trong test; không được import từ code chạy thật.
import type { ServerApi } from './api'
import type { AuthUser, BestRow, FinishResult, GameMeta, LeaderRow, Period, Profile, RunResult } from './types'

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
  }
}
