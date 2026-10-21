import type {
  AuthUser, BestRow, FinishResult, GameMeta, LeaderRow, Period, Profile, RunResult,
} from './types'

/** Giao diện duy nhất cổng dùng để nói chuyện với server (Supabase thật hoặc fake khi test). */
export interface ServerApi {
  currentUser(): Promise<AuthUser | null>
  onAuthChange(cb: (u: AuthUser | null) => void): () => void
  signInWithGoogle(): Promise<void>
  signOut(): Promise<void>
  gameMeta(): Promise<GameMeta[]>
  playTotals(): Promise<Record<string, number>>
  recordPlay(gameId: string): Promise<void>
  startRun(gameId: string, mode: string): Promise<string>
  finishRun(runId: string, r: RunResult): Promise<FinishResult>
  leaderboard(gameId: string, mode: string, period: Period, limit?: number): Promise<LeaderRow[]>
  myRank(gameId: string, mode: string, period: Period): Promise<{ rank: number; value: number } | null>
  profile(userId: string): Promise<Profile | null>
  profileBests(userId: string): Promise<BestRow[]>
  updateDisplayName(name: string): Promise<void>
}
