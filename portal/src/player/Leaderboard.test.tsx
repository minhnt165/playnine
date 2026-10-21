import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/i18n'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import type { GameMeta, LeaderRow } from '../server/types'
import { Leaderboard } from './Leaderboard'

const GAMES: GameMeta[] = [
  {
    id: '2048', metric: 'score_high', hidden: false,
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

const setWide = (wide: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: wide, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }))

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
  setWide(true)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Leaderboard', () => {
  it('tab mode theo metadata với nhãn đúng ngôn ngữ', async () => {
    localStorage.setItem('playnine-lang', 'vi')
    mount(createFakeApi({ games: GAMES }))
    expect(await screen.findByRole('tab', { name: 'Cổ điển' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Hằng ngày' })).toBeInTheDocument()
  })

  it('mode daily chỉ có tab "Hôm nay"; mode thường có tuần và mọi lúc', async () => {
    mount(createFakeApi({ games: GAMES }))
    await screen.findByRole('tab', { name: 'Classic' })
    expect(screen.getByRole('tab', { name: DICT.en['lb.week'] as string })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: DICT.en['lb.all'] as string })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Daily' }))
    expect(screen.getByRole('tab', { name: DICT.en['lb.day'] as string })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: DICT.en['lb.week'] as string })).toBeNull()
  })

  it('hiện các hàng đúng thứ tự với giá trị đã định dạng', async () => {
    const api = createFakeApi({
      games: GAMES,
      boards: { '2048|classic|week': [row(1, 'An', 12345), row(2, 'Binh', 900), row(3, 'Chi', 12)] },
    })
    mount(api)
    const items = await screen.findAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('An'), expect.stringContaining('Binh'), expect.stringContaining('Chi'),
    ])
    expect(items[0].textContent).toContain('12,345')
    expect(items[0].textContent).toContain('1')
    expect(api.calls.find((c) => c.method === 'leaderboard')!.args).toEqual(['2048', 'classic', 'week', 50])
  })

  it('tên người chơi là liên kết tới #/u/<userId>', async () => {
    mount(createFakeApi({ games: GAMES, boards: { '2048|classic|week': [row(1, 'An', 100, 'u-an')] } }))
    const link = await screen.findByRole('link', { name: 'An' })
    expect(link).toHaveAttribute('href', '#/u/u-an')
  })

  it('người dùng hạng 72 ngoài top: có dấu … và hàng của mình được đánh dấu', async () => {
    const api = createFakeApi({
      user: U, games: GAMES,
      boards: { '2048|classic|week': [row(1, 'An', 100)] },
      myRanks: { '2048|classic|week': { rank: 72, value: 5 } },
    })
    mount(api)
    const mine = await screen.findByText('72')
    const li = mine.closest('li')!
    expect(li).toHaveClass('me')
    expect(li.textContent).toContain('Minh')
    expect(li.textContent).toContain(DICT.en['lb.you'] as string)
    expect(screen.getByText('…')).toBeInTheDocument()
  })

  it('người dùng đã nằm trong danh sách: đánh dấu, không thêm dòng …', async () => {
    const api = createFakeApi({
      user: U, games: GAMES,
      boards: { '2048|classic|week': [row(1, 'An', 100), row(2, 'Minh', 50, 'me')] },
    })
    const { container } = mount(api)
    await screen.findByText('An')
    await waitFor(() => expect(container.querySelectorAll('li.me')).toHaveLength(1))
    expect(screen.queryByText('…')).toBeNull()
  })

  it('tên chứa HTML hiện dạng text', async () => {
    const evil = '<img src=x onerror=alert(1)>'
    const api = createFakeApi({ games: GAMES, boards: { '2048|classic|week': [row(1, evil, 5)] } })
    const { container } = mount(api)
    expect(await screen.findByText(evil)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('bảng rỗng hiện lb.empty', async () => {
    mount(createFakeApi({ games: GAMES }))
    expect(await screen.findByText(DICT.en['lb.empty'] as string)).toBeInTheDocument()
  })

  it('leaderboard lỗi: ẩn danh sách, hiện lb.error, không lỗi chưa bắt', async () => {
    const api = createFakeApi({ games: GAMES, boards: { '2048|classic|week': [row(1, 'An', 1)] } })
    api.fail('leaderboard')
    const { container } = mount(api)
    expect(await screen.findByText(DICT.en['lb.error'] as string)).toBeInTheDocument()
    expect(container.querySelector('li')).toBeNull()
  })

  it('myRank lỗi cũng chỉ hiện lb.error', async () => {
    const api = createFakeApi({ user: U, games: GAMES })
    api.fail('myRank')
    mount(api)
    expect(await screen.findByText(DICT.en['lb.error'] as string)).toBeInTheDocument()
  })

  it('không server → không render gì', () => {
    const { container } = mount(null)
    expect(container.innerHTML).toBe('')
  })

  it('game chưa có trong metadata → không render', async () => {
    const { container } = mount(createFakeApi({ games: [] }))
    await new Promise((r) => setTimeout(r, 10))
    expect(container.innerHTML).toBe('')
  })

  it('đổi tab mode lưu playnine-lb-mode-2048 và nhớ cho lần sau', async () => {
    const api = createFakeApi({ games: GAMES })
    mount(api)
    fireEvent.click(await screen.findByRole('tab', { name: 'Daily' }))
    expect(localStorage.getItem('playnine-lb-mode-2048')).toBe('daily')
    cleanup()
    mount(createFakeApi({ games: GAMES }))
    const tab = await screen.findByRole('tab', { name: 'Daily' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
  })

  it('refreshKey đổi thì tải lại bảng', async () => {
    const api = createFakeApi({ games: GAMES })
    const view = mount(api)
    await screen.findByText(DICT.en['lb.empty'] as string)
    const n = () => api.calls.filter((c) => c.method === 'leaderboard').length
    const before = n()
    view.rerender(
      <I18nProvider>
        <ServerProvider api={api}>
          <Leaderboard gameId="2048" refreshKey={1} />
        </ServerProvider>
      </I18nProvider>,
    )
    await waitFor(() => expect(n()).toBe(before + 1))
  })
})

describe('Leaderboard màn hẹp (bottom sheet)', () => {
  beforeEach(() => setWide(false))
  const api = () => createFakeApi({ games: GAMES, boards: { '2048|classic|week': [row(1, 'An', 5)] } })

  it('nút mở sheet: role dialog, aria-modal, có nhãn, focus vào trong', async () => {
    mount(api())
    const opener = await screen.findByRole('button', { name: DICT.en['lb.open'] as string })
    expect(screen.queryByRole('dialog')).toBeNull()
    opener.focus()
    fireEvent.click(opener)
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(dlg).toHaveAccessibleName(DICT.en['lb.title'] as string)
    expect(dlg.contains(document.activeElement)).toBe(true)
    expect(await within(dlg).findByText('An')).toBeInTheDocument()
  })

  it('Escape đóng và trả focus về nút mở', async () => {
    mount(api())
    const opener = await screen.findByRole('button', { name: DICT.en['lb.open'] as string })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('nút đóng và chạm nền đều đóng', async () => {
    mount(api())
    const opener = await screen.findByRole('button', { name: DICT.en['lb.open'] as string })
    fireEvent.click(opener)
    fireEvent.click(screen.getByRole('button', { name: DICT.en['lb.close'] as string }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(opener)
    const backdrop = document.querySelector('.lb-backdrop')!
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('chạm bên trong sheet không đóng', async () => {
    mount(api())
    fireEvent.click(await screen.findByRole('button', { name: DICT.en['lb.open'] as string }))
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})