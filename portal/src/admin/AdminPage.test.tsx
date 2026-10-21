import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountWith } from '../events/testUtil'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { ADMIN, GAMES_META } from './adminTestUtil'
import { AdminPage } from './AdminPage'

const en = (k: string) => DICT.en[k] as string
const adminCalls = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((c) => c.method.startsWith('admin'))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(cleanup)

describe('AdminPage', () => {
  it('không có server: báo chưa khả dụng', () => {
    mountWith(null, <AdminPage />)
    expect(screen.getByText(en('admin.unavailable'))).toBeInTheDocument()
  })

  it('khách: forbidden và không gọi admin*', async () => {
    const api = createFakeApi({ games: GAMES_META })
    mountWith(api, <AdminPage />)
    expect(await screen.findByText(en('admin.forbidden'))).toBeInTheDocument()
    expect(adminCalls(api)).toEqual([])
  })

  it('người chơi thường: forbidden và không gọi admin*', async () => {
    const api = createFakeApi({ games: GAMES_META, user: { id: 'u9', displayName: 'Bob', avatarUrl: null } })
    mountWith(api, <AdminPage />)
    expect(await screen.findByText(en('admin.forbidden'))).toBeInTheDocument()
    expect(adminCalls(api)).toEqual([])
  })

  it('admin: 5 tab, đổi tab ghi sessionStorage, đặt tiêu đề trang', async () => {
    const api = createFakeApi({ games: GAMES_META, user: ADMIN })
    mountWith(api, <AdminPage />)
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((x) => x.textContent)).toEqual([
      en('admin.tab.games'),
      en('admin.tab.events'),
      en('admin.tab.collections'),
      en('admin.tab.runs'),
      en('admin.tab.players'),
    ])
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(document.title).toBe('Admin · PlayNine')
    fireEvent.click(screen.getByRole('tab', { name: en('admin.tab.players') }))
    expect(sessionStorage.getItem('playnine-admin-tab')).toBe('players')
    expect(screen.getByRole('tab', { name: en('admin.tab.players') })).toHaveAttribute('aria-selected', 'true')
  })

  it('nhớ tab đã chọn; tab sự kiện và bộ sưu tập có khung tạm', async () => {
    sessionStorage.setItem('playnine-admin-tab', 'events')
    mountWith(createFakeApi({ user: ADMIN }), <AdminPage />)
    expect(await screen.findByRole('heading', { name: en('admin.tab.events') })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: en('admin.tab.collections') }))
    expect(screen.getByRole('heading', { name: en('admin.tab.collections') })).toBeInTheDocument()
  })
})
