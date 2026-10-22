import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountWith } from '../events/testUtil'
import { AuthButton } from '../home/AuthButton'
import { DICT } from '../i18n/dict'
import { ProfilePage } from '../profile/ProfilePage'
import { createFakeApi } from '../server/fakeApi'
import type { GameMeta, HistoryRun } from '../server/types'
import { HistoryPage } from './HistoryPage'

const en = (k: string) => DICT.en[k] as string
const ME = { id: 'me', displayName: 'Minh', avatarUrl: null }
const GAMES: GameMeta[] = [
  { id: 'sudoku', metric: 'time_low', hidden: false, modes: [{ key: 'easy', label: { en: 'Easy', vi: 'Dễ' } }] },
  { id: '2048', metric: 'score_high', hidden: false, modes: [{ key: '4x4', label: { en: 'Classic 4x4', vi: '4x4' } }] },
  { id: 'caro', metric: 'wins', hidden: false, modes: [{ key: 'ai', label: { en: 'Vs computer', vi: 'Đấu máy' } }] },
  { id: 'xiangqi', metric: 'wins', hidden: true, modes: [] },
]
// Giờ máy: 21/10/2026 15:00.
const NOW = new Date(2026, 9, 21, 15, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()

const run = (id: string, over: Partial<HistoryRun> = {}): HistoryRun => ({
  id, gameId: 'sudoku', mode: 'easy', status: 'finished', startedAt: at(21, 9), endedAt: at(21, 10),
  score: null, timeMs: 65000, won: true, assisted: false, rejectReason: null, points: 20, ...over,
})

const HISTORY: HistoryRun[] = [
  run('r1', { endedAt: at(21, 14, 5) }),
  run('r2', { gameId: '2048', mode: '4x4', endedAt: at(21, 9, 30), score: 1234, timeMs: null, won: null, points: 0 }),
  run('r3', { gameId: 'caro', mode: 'hard', endedAt: at(20, 22), score: null, timeMs: null, won: false, points: 5 }),
  run('r4', { endedAt: at(15, 8), status: 'rejected', rejectReason: 'too_fast', points: 0 }),
]

const seed = (extra = {}) => createFakeApi({ user: ME, games: GAMES, history: HISTORY, ...extra })
const myRunsCalls = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((c) => c.method === 'myRuns').map((c) => c.args[0])

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('HistoryPage', () => {
  it('gom theo ngày (Today, Yesterday, rồi ngày), hiện mode, kết quả, giá trị theo chỉ số và liên kết', async () => {
    const { container } = mountWith(seed(), <HistoryPage />)
    expect(await screen.findByRole('heading', { level: 2, name: en('history.today') })).toBeInTheDocument()
    const heads = [...container.querySelectorAll('.hist-day h2')].map((h) => h.textContent)
    const older = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(2026, 9, 15))
    expect(heads).toEqual([en('history.today'), en('history.yesterday'), older])
    expect(document.title).toBe(en('history.title') + ' · PlayNine')

    const rows = [...container.querySelectorAll('li.hist-row')] as HTMLElement[]
    expect(rows).toHaveLength(4)
    const [won, done, lost, rejected] = rows.map((r) => within(r))
    expect(won.getByText('Sudoku').closest('a')).toHaveAttribute('href', '#/game/sudoku')
    expect(won.getByText('Easy')).toBeInTheDocument()
    expect(won.getByText(en('history.won'))).toBeInTheDocument()
    expect(won.getByText('01:05')).toBeInTheDocument()
    expect(won.getByRole('link', { name: en('history.playAgain') })).toHaveAttribute('href', '#/play/sudoku')
    expect(done.getByText(en('history.finished'))).toBeInTheDocument()
    expect(done.getByText('1,234')).toBeInTheDocument()
    expect(done.getByText('Classic 4x4')).toBeInTheDocument()
    // Game tính thắng: chỉ hiện kết quả; mode lạ giữ nguyên khóa.
    expect(lost.getByText(en('history.lost'))).toBeInTheDocument()
    expect(lost.getByText('hard')).toBeInTheDocument()
    expect(rows[2].querySelector('.hist-value')).toBeNull()
    expect(rejected.getByText(en('history.rejected'))).toBeInTheDocument()
    expect(rejected.getByText(en('history.reason.too_fast'))).toBeInTheDocument()
    expect(rows[3].querySelector('.hist-value')).toBeNull()
  })

  it('điểm: +N pts khi được cộng, 0 pts mờ kèm lý do; ô tổng kết đếm ván, thắng và điểm', async () => {
    const { container } = mountWith(seed(), <HistoryPage />)
    await screen.findByText(en('history.today'))
    const pts = [...container.querySelectorAll('.hist-pts')] as HTMLElement[]
    expect(pts.map((p) => p.textContent)).toEqual(['+20 pts', '0 pts', '+5 pts', '0 pts'])
    expect(pts[0].classList.contains('is-zero')).toBe(false)
    expect(pts[1]).toHaveClass('is-zero')
    expect(pts[1]).toHaveAttribute('title', en('history.zeroPoints'))
    expect(pts[3]).toHaveAttribute('title', en('history.zeroRejected'))
    const sum = screen.getByRole('list', { name: en('history.sum') })
    expect([...sum.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['4 games', '1 win', '25 points earned'])
  })

  it('lọc theo game gọi myRuns với gameId; game ẩn không có trong danh sách', async () => {
    const api = seed()
    mountWith(api, <HistoryPage />)
    await screen.findByText(en('history.today'))
    expect(myRunsCalls(api)).toEqual([{ limit: 30 }])
    const select = screen.getByRole('combobox', { name: en('history.filter') })
    const options = [...select.querySelectorAll('option')].map((o) => o.value)
    expect(options[0]).toBe('')
    expect(options).toContain('2048')
    expect(options).not.toContain('xiangqi')
    fireEvent.change(select, { target: { value: '2048' } })
    await waitFor(() => expect(myRunsCalls(api).at(-1)).toEqual({ gameId: '2048', limit: 30 }))
    await waitFor(() => expect(document.querySelectorAll('li.hist-row')).toHaveLength(1))
  })

  it('đủ một trang thì có nút Load more, gọi tiếp với before = endedAt của ván cuối', async () => {
    const many = Array.from({ length: 35 }, (_, i) => run('m' + i, { endedAt: new Date(NOW.getTime() - (i + 1) * 60000).toISOString() }))
    const api = seed({ history: many })
    const { container } = mountWith(api, <HistoryPage />)
    const more = await screen.findByRole('button', { name: en('history.more') })
    expect(container.querySelectorAll('li.hist-row')).toHaveLength(30)
    fireEvent.click(more)
    await waitFor(() => expect(container.querySelectorAll('li.hist-row')).toHaveLength(35))
    expect(myRunsCalls(api).at(-1)).toEqual({ before: many[29].endedAt, limit: 30 })
    expect(screen.queryByRole('button', { name: en('history.more') })).toBeNull()
  })

  it('chưa có ván: báo trống và có link về trang chủ', async () => {
    mountWith(seed({ history: [] }), <HistoryPage />)
    expect(await screen.findByText(en('history.empty'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: new RegExp(en('history.browse')) })).toHaveAttribute('href', '#/')
  })

  it('lỗi: báo lỗi, nút thử lại gọi lại myRuns', async () => {
    const api = seed()
    api.fail('myRuns')
    mountWith(api, <HistoryPage />)
    expect(await screen.findByText(en('history.error'))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: en('history.retry') }))
    await waitFor(() => expect(myRunsCalls(api)).toHaveLength(2))
  })

  it('chưa đăng nhập: mời đăng nhập Google hoặc chơi khách, không gọi myRuns; vào khách thì tải lịch sử', async () => {
    const api = seed({ user: null })
    mountWith(api, <HistoryPage />)
    expect(await screen.findByText(en('history.signIn'))).toBeInTheDocument()
    expect(myRunsCalls(api)).toHaveLength(0)
    const main = screen.getByRole('main')
    expect(within(main).getByRole('button', { name: en('auth.signIn') })).toBeInTheDocument()
    fireEvent.click(within(main).getByRole('button', { name: en('auth.guest') }))
    expect(await screen.findByText(en('history.today'))).toBeInTheDocument()
    expect(myRunsCalls(api)).toHaveLength(1)
  })

  it('không có server: báo chưa khả dụng', () => {
    mountWith(null, <HistoryPage />)
    expect(screen.getByText(en('history.unavailable'))).toBeInTheDocument()
  })
})

describe('liên kết tới lịch sử chơi', () => {
  it('menu tài khoản có mục Play history', async () => {
    mountWith(createFakeApi({ user: ME }), <AuthButton />)
    fireEvent.click(await screen.findByRole('button', { name: /Minh/ }))
    expect(screen.getByRole('menuitem', { name: en('history.title') })).toHaveAttribute('href', '#/history')
  })

  it('hồ sơ của chính mình có nút Play history, hồ sơ người khác thì không', async () => {
    const profiles = { me: ME, other: { id: 'other', displayName: 'Lan', avatarUrl: null } }
    mountWith(createFakeApi({ user: ME, profiles }), <ProfilePage userId="me" />)
    await screen.findByRole('heading', { name: 'Minh' })
    expect(screen.getByRole('link', { name: en('history.title') })).toHaveAttribute('href', '#/history')
    cleanup()
    mountWith(createFakeApi({ user: ME, profiles }), <ProfilePage userId="other" />)
    await screen.findByRole('heading', { name: 'Lan' })
    expect(screen.queryByRole('link', { name: en('history.title') })).toBeNull()
  })
})
