import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountWith } from '../events/testUtil'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import type { GameMeta, PlayerRow } from '../server/types'
import { LeaderboardsPage } from './LeaderboardsPage'

const en = (k: string) => DICT.en[k] as string
const pr = (rank: number, name: string, value: number): PlayerRow => ({ rank, userId: 'u' + rank, displayName: name, avatarUrl: null, value })
const GAMES: GameMeta[] = [
  { id: '2048', metric: 'score_high', hidden: false, points: 5, modes: [{ key: '4x4', label: { en: '4x4', vi: '4x4' } }] },
  { id: 'sudoku', metric: 'time_low', hidden: true, points: 10, modes: [{ key: 'easy', label: { en: 'Easy', vi: 'Dễ' } }] },
]

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('LeaderboardsPage', () => {
  it('tab Người chơi mặc định xếp theo điểm tuần: top 3 lên bục, còn lại dạng danh sách', async () => {
    const api = createFakeApi({ games: GAMES, playerBoards: { 'points|week': [pr(1, 'An', 900), pr(2, 'Bình', 800), pr(3, 'Chi', 700), pr(4, 'Dũng', 600)] } })
    const { container } = mountWith(api, <LeaderboardsPage />)
    expect(await screen.findByText('An')).toBeInTheDocument()
    expect(api.calls.find((c) => c.method === 'playerLeaderboard')!.args).toEqual(['points', 'week', 50])
    expect(container.querySelectorAll('.lbs-podium li')).toHaveLength(3)
    expect(container.querySelector('.lb-list')!.textContent).toContain('Dũng')
    expect(container.querySelector('.lbs-podium .rank-1')!.textContent).toContain('900 pts')
  })

  it('xếp theo huy hiệu chỉ có kỳ mọi lúc', async () => {
    const api = createFakeApi({ games: GAMES })
    mountWith(api, <LeaderboardsPage />)
    fireEvent.click(await screen.findByRole('button', { name: en('lbs.badges') }))
    await waitFor(() => expect(api.calls.at(-1)!.args).toEqual(['badges', 'all', 50]))
    expect(screen.queryByRole('button', { name: en('lb.week') })).toBeNull()
  })

  it('tab Theo game: chỉ game không ẩn, chọn game thì nhớ lại và hiện bảng điểm của game đó', async () => {
    const api = createFakeApi({ games: GAMES })
    mountWith(api, <LeaderboardsPage />)
    fireEvent.click(await screen.findByRole('tab', { name: en('lbs.games') }))
    const picker = await screen.findByRole('group', { name: en('lbs.pick') })
    expect(within(picker).getAllByRole('button')).toHaveLength(1)
    expect(within(picker).getByRole('button', { pressed: true })).toHaveTextContent('2048')
    await waitFor(() => expect(api.calls.some((c) => c.method === 'gamePointsBoard' && c.args[0] === '2048')).toBe(true))
    expect(localStorage.getItem('playnine-lbs-tab')).toBe('games')
  })

  it('không server: lbs.unavailable', () => {
    mountWith(null, <LeaderboardsPage />)
    expect(screen.getByText(en('lbs.unavailable'))).toBeInTheDocument()
  })
})
