import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DICT } from '../i18n/dict'
import { I18nProvider } from '../i18n/i18n'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import type { BestRow, GameMeta } from '../server/types'
import { ProfilePage } from './ProfilePage'

const en = (k: string) => DICT.en[k] as string
const GAMES: GameMeta[] = [
  { id: 'minesweeper', metric: 'time_low', hidden: false, modes: [{ key: 'beginner', label: { en: 'Beginner', vi: 'Dễ' } }] },
  { id: '2048', metric: 'score_high', hidden: false, modes: [{ key: 'classic', label: { en: 'Classic', vi: 'Cổ điển' } }] },
]
const BESTS: BestRow[] = [
  { gameId: 'minesweeper', mode: 'beginner', metric: 'time_low', value: 83400, achievedAt: '2026-10-21T00:00:00Z' },
  { gameId: '2048', mode: 'classic', metric: 'score_high', value: 12345, achievedAt: '2026-10-21T00:00:00Z' },
]
const ME = { id: 'me', displayName: 'Minh', avatarUrl: null }
const OTHER = { id: 'other', displayName: 'Lan', avatarUrl: null }

const mount = (api: ReturnType<typeof createFakeApi>, userId: string) =>
  render(
    <I18nProvider>
      <ServerProvider api={api}>
        <ProfilePage userId={userId} />
      </ServerProvider>
    </I18nProvider>,
  )
const seed = (extra = {}) =>
  createFakeApi({ games: GAMES, profiles: { me: ME, other: OTHER }, bests: { me: BESTS, other: BESTS }, ...extra })

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('ProfilePage', () => {
  it('hiện tên, tiêu đề tab và các kỷ lục đã định dạng với tên game theo ngôn ngữ', async () => {
    localStorage.setItem('playnine-lang', 'vi')
    mount(seed(), 'other')
    expect(await screen.findByRole('heading', { name: 'Lan' })).toBeTruthy()
    expect(screen.getByText('Dò Mìn')).toBeTruthy()
    expect(screen.getByText('01:23')).toBeTruthy()
    expect(screen.getByText('12.345')).toBeTruthy()
    expect(screen.getByText('Cổ điển')).toBeTruthy()
    expect(document.title).toBe('Lan · PlayNine')
  })

  it('huy hiệu: hạng, tên sự kiện theo ngôn ngữ, tên game, link tới sự kiện; nằm trước kỷ lục', async () => {
    localStorage.setItem('playnine-lang', 'vi')
    const badges = [
      { eventId: 'e1', rank: 1, awardedAt: '2026-10-21T00:00:00Z', title: { en: 'Spring cup', vi: 'Cúp xuân' }, gameId: '2048', mode: 'classic' },
      { eventId: 'e2', rank: 2, awardedAt: '2026-10-20T00:00:00Z', title: { en: 'Mines <b>' }, gameId: 'minesweeper', mode: 'beginner' },
    ]
    mount(seed({ badges: { other: badges } }), 'other')
    const link = await screen.findByRole('link', { name: /Cúp xuân/ })
    expect(link.getAttribute('href')).toBe('#/events/e1')
    expect(link.textContent).toContain('#1')
    expect(link.textContent).toContain('2048')
    const second = screen.getByRole('link', { name: /Mines <b>/ })
    expect(second.textContent).toContain('#2')
    expect(screen.getByRole('heading', { name: 'Huy hiệu' })).toBeTruthy()
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(heads).toEqual(['Huy hiệu', 'Kỷ lục cá nhân'])
  })

  it('không có huy hiệu: ẩn cả mục', async () => {
    mount(seed(), 'other')
    await screen.findByRole('heading', { name: 'Lan' })
    expect(screen.queryByRole('heading', { name: en('profile.badges') })).toBeNull()
  })

  it('profileBadges lỗi: không có mục huy hiệu nhưng kỷ lục vẫn hiện', async () => {
    const api = seed()
    api.fail('profileBadges')
    mount(api, 'other')
    expect(await screen.findByText('12,345')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: en('profile.badges') })).toBeNull()
  })

  it('người khác thì không có ô sửa tên', async () => {
    mount(seed({ user: ME }), 'other')
    await screen.findByRole('heading', { name: 'Lan' })
    expect(screen.queryByText(en('profile.edit'))).toBeNull()
  })

  it('chính mình: cắt khoảng trắng rồi gửi tên, gọi lại refreshUser', async () => {
    const api = seed({ user: ME })
    mount(api, 'me')
    fireEvent.click(await screen.findByText(en('profile.edit')))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  An  ' } })
    fireEvent.click(screen.getByText(en('profile.save')))
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'updateDisplayName').map((c) => c.args)).toEqual([['An']]))
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'currentUser').length).toBeGreaterThan(1))
  })

  it('tên quá ngắn hoặc quá dài không gửi và hiện quy tắc', async () => {
    const api = seed({ user: ME })
    mount(api, 'me')
    fireEvent.click(await screen.findByText(en('profile.edit')))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A' } })
    fireEvent.click(screen.getByText(en('profile.save')))
    expect(await screen.findByText(en('profile.nameRule'))).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x'.repeat(25) } })
    fireEvent.click(screen.getByText(en('profile.save')))
    expect(api.calls.some((c) => c.method === 'updateDisplayName')).toBe(false)
  })

  it('updateDisplayName lỗi thì hiện profile.nameError', async () => {
    const api = seed({ user: ME })
    api.fail('updateDisplayName')
    mount(api, 'me')
    fireEvent.click(await screen.findByText(en('profile.edit')))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Binh' } })
    fireEvent.click(screen.getByText(en('profile.save')))
    expect(await screen.findByText(en('profile.nameError'))).toBeTruthy()
  })

  it('không tìm thấy hồ sơ', async () => {
    mount(seed(), 'nobody')
    expect(await screen.findByText(en('profile.notFound'))).toBeTruthy()
  })

  it('không có server thì báo không khả dụng', () => {
    render(
      <I18nProvider>
        <ServerProvider api={null}>
          <ProfilePage userId="x" />
        </ServerProvider>
      </I18nProvider>,
    )
    expect(screen.getByText(en('profile.unavailable'))).toBeTruthy()
  })

  it('tên chứa HTML hiện dạng text', async () => {
    const name = '<img src=x onerror=alert(1)>'
    const api = seed({ profiles: { other: { ...OTHER, displayName: name } } })
    const { container } = mount(api, 'other')
    expect(await screen.findByRole('heading', { name })).toBeTruthy()
    expect(container.querySelector('h1 img')).toBeNull()
  })
})
