import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../i18n/i18n'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import type { GameEvent, GameMeta, LeaderRow } from '../server/types'
import { Leaderboard } from './Leaderboard'

const en = (k: string) => DICT.en[k] as string
const GAMES: GameMeta[] = [
  {
    id: '2048', metric: 'score_high', hidden: false, points: 5,
    modes: [
      { key: 'classic', label: { en: 'Classic', vi: 'Cổ điển' } },
      { key: 'daily', label: { en: 'Daily', vi: 'Hằng ngày' } },
    ],
  },
]
const row = (rank: number, name: string, value: number, userId = `u${rank}`): LeaderRow => ({
  rank, userId, displayName: name, avatarUrl: null, value, achievedAt: '2026-10-21T00:00:00Z',
})
const U = { id: 'me', displayName: 'Minh', avatarUrl: null }
const boardCalls = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((c) => c.method === 'gamePointsBoard')

const mount = (api: ReturnType<typeof createFakeApi> | null, key = 0) =>
  render(
    <I18nProvider>
      <ServerProvider api={api}>
        <Leaderboard gameId="2048" refreshKey={key} />
      </ServerProvider>
    </I18nProvider>,
  )

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  cleanup()
})

describe('Leaderboard', () => {
  it('không chia mode: chỉ có tab tuần, hôm nay, mọi lúc; mặc định tuần; hiện điểm mỗi ván', async () => {
    const api = createFakeApi({ games: GAMES })
    mount(api)
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((x) => x.textContent)).toEqual([en('lb.week'), en('lb.day'), en('lb.all')])
    expect(screen.queryByRole('tab', { name: 'Classic' })).toBeNull()
    await waitFor(() => expect(boardCalls(api)[0]?.args).toEqual(['2048', 'week', 50]))
    expect(screen.getByText('5 pts / game')).toBeInTheDocument()
  })

  it('hiện các hàng đúng thứ tự, giá trị là điểm đã định dạng, tên là liên kết hồ sơ', async () => {
    const api = createFakeApi({ games: GAMES, gamePoints: { '2048|week': [row(1, 'An', 1234), row(2, 'Bình', 1)] } })
    const { container } = mount(api)
    await screen.findByText('An')
    const rows = [...container.querySelectorAll('.lb-list li')].map((li) => li.textContent)
    expect(rows).toEqual(['1An1,234 pts', '2Bình1 pt'])
    expect(screen.getByRole('link', { name: 'An' })).toHaveAttribute('href', '#/u/u1')
  })

  it('đổi kỳ thì tải bảng của kỳ đó', async () => {
    const api = createFakeApi({ games: GAMES, gamePoints: { '2048|day': [row(1, 'Day', 10)] } })
    mount(api)
    fireEvent.click(await screen.findByRole('tab', { name: en('lb.day') }))
    expect(await screen.findByText('Day')).toBeInTheDocument()
    expect(boardCalls(api).at(-1)!.args).toEqual(['2048', 'day', 50])
  })

  it('người dùng ngoài top: có dấu … và hàng của mình được đánh dấu', async () => {
    const api = createFakeApi({
      user: U, games: GAMES, gamePoints: { '2048|week': [row(1, 'An', 100)] }, myGamePoints: { '2048|week': { rank: 72, value: 15 } },
    })
    const { container } = mount(api)
    await screen.findByText('Minh')
    expect(container.querySelector('.lb-gap')).not.toBeNull()
    expect(container.querySelector('li.me')!.textContent).toContain('72')
  })

  it('người dùng đã nằm trong danh sách: đánh dấu, không thêm dòng …', async () => {
    const api = createFakeApi({ user: U, games: GAMES, gamePoints: { '2048|week': [row(1, 'Minh', 100, 'me')] } })
    const { container } = mount(api)
    await screen.findByText('Minh')
    expect(container.querySelector('li.me')).not.toBeNull()
    expect(container.querySelector('.lb-gap')).toBeNull()
    expect(api.calls.some((c) => c.method === 'myGamePoints')).toBe(false)
  })

  it('tên chứa HTML hiện dạng text', async () => {
    const api = createFakeApi({ games: GAMES, gamePoints: { '2048|week': [row(1, '<b>x</b>', 5)] } })
    const { container } = mount(api)
    await screen.findByText('<b>x</b>')
    expect(container.querySelector('.lb-list b')).toBeNull()
  })

  it('bảng rỗng hiện lb.empty', async () => {
    mount(createFakeApi({ games: GAMES }))
    expect(await screen.findByText(en('lb.empty'))).toBeInTheDocument()
  })

  it('bảng lỗi hoặc myGamePoints lỗi: hiện lb.error', async () => {
    const api = createFakeApi({ games: GAMES })
    api.fail('gamePointsBoard')
    mount(api)
    expect(await screen.findByRole('alert')).toHaveTextContent(en('lb.error'))
    cleanup()
    const api2 = createFakeApi({ user: U, games: GAMES, gamePoints: { '2048|week': [row(1, 'An', 1)] } })
    api2.fail('myGamePoints')
    mount(api2)
    expect(await screen.findByRole('alert')).toHaveTextContent(en('lb.error'))
  })

  it('không server hoặc game chưa có trong metadata → không render', async () => {
    const { container } = mount(null)
    expect(container.innerHTML).toBe('')
    cleanup()
    const api = createFakeApi({ games: [] })
    const view = mount(api)
    await waitFor(() => expect(api.calls.some((c) => c.method === 'gameMeta')).toBe(true))
    expect(view.container.querySelector('.lb-panel')).toBeNull()
  })

  it('refreshKey đổi thì tải lại bảng', async () => {
    const api = createFakeApi({ games: GAMES })
    const view = mount(api)
    await waitFor(() => expect(boardCalls(api).length).toBeGreaterThan(0))
    const before = boardCalls(api).length
    view.rerender(
      <I18nProvider>
        <ServerProvider api={api}>
          <Leaderboard gameId="2048" refreshKey={1} />
        </ServerProvider>
      </I18nProvider>,
    )
    await waitFor(() => expect(boardCalls(api).length).toBe(before + 1))
  })
})

describe('Leaderboard tab sự kiện', () => {
  const evt = (over: Partial<GameEvent> = {}): GameEvent => ({
    id: 'e1', title: { en: 'Spring cup' }, description: {}, gameId: '2048', mode: 'daily', agg: 'best',
    startsAt: new Date(Date.now() - 3600_000).toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString(),
    awardTop: 3, status: 'live', ...over,
  })
  const eventCalls = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((c) => c.method === 'eventLeaderboard')

  it('game có sự kiện live (mode nào cũng được): có tab ev.tab, bấm vào thì tải bảng sự kiện', async () => {
    const api = createFakeApi({ games: GAMES, events: [evt()], eventBoards: { e1: [row(1, 'Zed', 777)] } })
    mount(api)
    const tab = await screen.findByRole('tab', { name: en('ev.tab') })
    expect(eventCalls(api)).toHaveLength(0)
    fireEvent.click(tab)
    expect(await screen.findByText('Zed')).toBeInTheDocument()
    expect(eventCalls(api)[0].args[0]).toBe('e1')
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('link', { name: en('ev.details') })).toHaveAttribute('href', '#/events/e1')
  })

  it('sự kiện của game khác: không có tab', async () => {
    const api = createFakeApi({ games: GAMES, events: [evt({ gameId: 'sudoku' })] })
    mount(api)
    await waitFor(() => expect(api.calls.some((c) => c.method === 'events')).toBe(true))
    expect(screen.queryByRole('tab', { name: en('ev.tab') })).toBeNull()
  })

  it('events lỗi: bảng điểm vẫn chạy, không có tab', async () => {
    const api = createFakeApi({ games: GAMES, gamePoints: { '2048|week': [row(1, 'An', 5)] } })
    api.fail('events')
    mount(api)
    expect(await screen.findByText('An')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: en('ev.tab') })).toBeNull()
  })
})
