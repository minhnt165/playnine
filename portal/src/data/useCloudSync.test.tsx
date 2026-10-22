import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthButton } from '../home/AuthButton'
import { I18nProvider } from '../i18n/i18n'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import { useCloudSync } from './useCloudSync'

const USER = { id: 'u1', displayName: 'An', avatarUrl: null }
const NONE = new Set<string>()

function Sync({ open = NONE }: { open?: ReadonlySet<string> }) {
  useCloudSync(open)
  return <AuthButton />
}

const mount = (api: ReturnType<typeof createFakeApi>) =>
  render(
    <I18nProvider>
      <ServerProvider api={api}>
        <Sync />
      </ServerProvider>
    </I18nProvider>,
  )

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('useCloudSync', () => {
  it('đăng nhập: đẩy tiến độ trên máy lên, kéo bản trên server về, menu báo đã lưu', async () => {
    localStorage.setItem('playnine-2048-stats-v1', '{"games":2}')
    const api = createFakeApi({
      user: USER,
      saves: [{ key: 'playnine-sudoku-x', value: 'ignored', updatedAt: '2026-10-21T00:00:00Z', syncedAt: '2026-10-21T00:00:00Z' },
        { key: 'sudoku-vn-stats-v1', value: '{"won":9}', updatedAt: '2026-10-21T00:00:00Z', syncedAt: '2026-10-21T00:00:00Z' }],
    })
    mount(api)
    await waitFor(() => expect(localStorage.getItem('sudoku-vn-stats-v1')).toBe('{"won":9}'))
    await waitFor(() => expect(api.state.saves.some((s) => s.key === 'playnine-2048-stats-v1')).toBe(true))
    expect(localStorage.getItem('playnine-sudoku-x')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: /An/ }))
    expect(await screen.findByText(/Game progress saved to your account/)).toBeInTheDocument()
  })

  it('chưa đăng nhập: không gọi server, menu không có dòng trạng thái', async () => {
    const api = createFakeApi({})
    mount(api)
    await screen.findByRole('button', { name: /Google/ })
    expect(api.calls.some((c) => c.method === 'mySaves' || c.method === 'putSaves')).toBe(false)
  })

  it('lỗi server: menu báo chưa lưu được', async () => {
    const api = createFakeApi({ user: USER })
    api.fail('mySaves')
    mount(api)
    fireEvent.click(await screen.findByRole('button', { name: /An/ }))
    expect(await screen.findByText(/Couldn't save game progress/)).toBeInTheDocument()
  })
})
