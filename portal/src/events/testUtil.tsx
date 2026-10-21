import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '../i18n/i18n'
import type { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import type { GameEvent, GameMeta, LeaderRow } from '../server/types'

/** Mốc giờ cố định cho các test sự kiện. */
export const NOW = '2026-10-21T10:00:00Z'

export const GAMES: GameMeta[] = [
  {
    id: '2048', metric: 'score_high', hidden: false,
    modes: [
      { key: '4x4', label: { en: '4x4', vi: '4x4' } },
      { key: '3x3', label: { en: '3x3', vi: '3x3' } },
    ],
  },
]

export const ev = (over: Partial<GameEvent> = {}): GameEvent => ({
  id: 'e1',
  title: { en: 'Spring cup', vi: 'Cúp xuân' },
  description: { en: 'Be the best', vi: '' },
  gameId: '2048',
  mode: '4x4',
  agg: 'best',
  startsAt: '2026-10-21T09:00:00Z',
  endsAt: '2026-10-21T12:00:00Z',
  awardTop: 2,
  status: 'live',
  ...over,
})

export const row = (rank: number, name: string, value: number, userId = `u${rank}`): LeaderRow => ({
  rank, userId, displayName: name, avatarUrl: null, value, achievedAt: NOW,
})

/** Render trong I18nProvider + ServerProvider (api null = không có server). */
export const mountWith = (api: ReturnType<typeof createFakeApi> | null, ui: ReactNode) =>
  render(
    <I18nProvider>
      <ServerProvider api={api}>{ui}</ServerProvider>
    </I18nProvider>,
  )
