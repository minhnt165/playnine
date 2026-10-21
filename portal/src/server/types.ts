export type Metric = 'score_high' | 'time_low' | 'wins'
export type Period = 'day' | 'week' | 'all'
export type AuthUser = { id: string; displayName: string; avatarUrl: string | null }
export type Profile = AuthUser
export type ModeMeta = { key: string; label: { en: string; vi: string } }
export type GameMeta = { id: string; metric: Metric; modes: ModeMeta[]; hidden: boolean }
export type LeaderRow = {
  rank: number
  userId: string
  displayName: string
  avatarUrl: string | null
  value: number
  achievedAt: string
}
export type RunResult = { score?: number; timeMs?: number; won: boolean; assisted: boolean }
export type FinishResult = {
  status: 'finished' | 'rejected'
  reason: string | null
  ranks: Partial<Record<Period, number>>
}
export type BestRow = { gameId: string; mode: string; metric: Metric; value: number; achievedAt: string }
