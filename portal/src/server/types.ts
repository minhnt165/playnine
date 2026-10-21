export type Metric = 'score_high' | 'time_low' | 'wins'
export type Period = 'day' | 'week' | 'all'
export type Profile = { id: string; displayName: string; avatarUrl: string | null }
export type AuthUser = Profile & { isAdmin?: boolean }
export type Rules = { min_duration_ms?: number; max_score?: number; max_score_per_sec?: number; min_time_ms?: number }
export type ModeMeta = { key: string; label: { en: string; vi: string }; rules?: Rules }
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
export type Text = { en: string; vi?: string }
export type EventAgg = 'best' | 'sum'
export type EventStatus = 'scheduled' | 'live' | 'closed' | 'cancelled'
export type EventPhase = 'upcoming' | 'live' | 'ended' | 'cancelled'
export type GameEvent = {
  id: string
  title: Text
  description: Partial<Text>
  gameId: string
  mode: string
  agg: EventAgg
  startsAt: string
  endsAt: string
  awardTop: number
  status: EventStatus
}
export type EventInput = Omit<GameEvent, 'id' | 'status'> & { id?: string }
export type Collection = { id: string; title: Text; gameIds: string[]; startsAt: string; endsAt: string | null; sort: number }
export type CollectionInput = Omit<Collection, 'id'> & { id?: string }
export type Badge = { eventId: string; rank: number; awardedAt: string; title: Text; gameId: string; mode: string }
export type RunStatusDb = 'started' | 'finished' | 'rejected'
export type AdminRun = {
  id: string
  userId: string
  displayName: string
  gameId: string
  mode: string
  startedAt: string
  endedAt: string | null
  score: number | null
  timeMs: number | null
  won: boolean | null
  assisted: boolean
  status: RunStatusDb
  rejectReason: string | null
}
export type RunFilter = { gameId?: string; mode?: string; userId?: string; status?: RunStatusDb; before?: string; limit?: number }
export type AdminPlayer = {
  id: string
  displayName: string
  avatarUrl: string | null
  role: 'player' | 'admin'
  banned: boolean
  createdAt: string
  runs: number
}
