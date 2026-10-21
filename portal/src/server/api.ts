import type {
  AdminPlayer, AdminRun, AuthUser, Badge, BestRow, Collection, CollectionInput, EventInput, FinishResult, GameEvent,
  GameMeta, LeaderRow, Period, Profile, RunFilter, RunResult, Rules,
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
  /** Mọi sự kiện, mọi trạng thái (bảng events đọc công khai). */
  events(): Promise<GameEvent[]>
  eventLeaderboard(eventId: string, limit?: number): Promise<LeaderRow[]>
  /** Mọi bộ sưu tập; client tự lọc theo thời gian. */
  collections(): Promise<Collection[]>
  profileBadges(userId: string): Promise<Badge[]>
  // Các hàm admin: lỗi SQL (forbidden, event_started...) nằm trong message của Error.
  adminUpdateGame(gameId: string, hidden: boolean | null, rules: Record<string, Rules>): Promise<void>
  adminSaveEvent(e: EventInput): Promise<string>
  adminCancelEvent(id: string): Promise<void>
  adminRecomputeEvent(id: string): Promise<void>
  adminSaveCollection(c: CollectionInput): Promise<string>
  adminDeleteCollection(id: string): Promise<void>
  adminRuns(f: RunFilter): Promise<AdminRun[]>
  adminRejectRun(runId: string, reason?: string): Promise<void>
  adminPlayers(query: string): Promise<AdminPlayer[]>
  adminSetBanned(userId: string, banned: boolean): Promise<void>
}
