import type { AdminPlayer, AdminRun, AuthUser, GameMeta } from '../server/types'

export const ADMIN: AuthUser = { id: 'a1', displayName: 'Admin', avatarUrl: null, isAdmin: true }

export const GAMES_META: GameMeta[] = [
  {
    id: '2048',
    metric: 'score_high',
    hidden: false,
    modes: [
      { key: '4x4', label: { en: '4x4', vi: '4x4' }, rules: { min_duration_ms: 1000, max_score: 500000 } },
      { key: '3x3', label: { en: '3x3', vi: '3x3' }, rules: { max_score: 1000, max_score_per_sec: 2.5 } },
    ],
  },
  {
    id: 'sugoku',
    metric: 'time_low',
    hidden: true,
    modes: [{ key: 'easy', label: { en: 'Easy', vi: 'Dễ' } }],
  },
]

export const player = (id: string, name: string, over: Partial<AdminPlayer> = {}): AdminPlayer => ({
  id,
  displayName: name,
  avatarUrl: null,
  role: 'player',
  banned: false,
  createdAt: '2026-10-01T00:00:00Z',
  runs: 3,
  ...over,
})

export const run = (id: string, over: Partial<AdminRun> = {}): AdminRun => ({
  id,
  userId: 'u1',
  displayName: 'Anna',
  gameId: '2048',
  mode: '4x4',
  startedAt: '2026-10-21T10:00:00.123456+00:00',
  endedAt: '2026-10-21T10:05:00.123456+00:00',
  score: 1234,
  timeMs: null,
  won: true,
  assisted: false,
  status: 'finished',
  rejectReason: null,
  ...over,
})
