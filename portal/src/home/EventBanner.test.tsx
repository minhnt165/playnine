import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ev, GAMES, mountWith, NOW } from '../events/testUtil'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { EventBanner } from './EventBanner'

const en = (k: string) => DICT.en[k] as string

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date(NOW))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('EventBanner', () => {
  it('hiện sự kiện live với đếm ngược và link; luôn có link tất cả sự kiện', async () => {
    const api = createFakeApi({ games: GAMES, events: [ev()] })
    mountWith(api, <EventBanner />)
    const link = await screen.findByRole('link', { name: /Spring cup/ })
    expect(link).toHaveAttribute('href', '#/events/e1')
    expect(link.textContent).toContain('2048')
    expect(link.textContent).toContain('Ends in 02:00:00')
    expect(screen.getByRole('link', { name: en('ev.all') })).toHaveAttribute('href', '#/events')
  })

  it('tối đa 3 sự kiện, sắp kết thúc lên trước', async () => {
    const mk = (id: string, end: string) => ev({ id, title: { en: 'T' + id }, endsAt: end })
    const api = createFakeApi({
      games: GAMES,
      events: [mk('a', '2026-10-21T15:00:00Z'), mk('b', '2026-10-21T11:00:00Z'), mk('c', '2026-10-21T13:00:00Z'), mk('d', '2026-10-21T12:00:00Z')],
    })
    mountWith(api, <EventBanner />)
    await screen.findByText(/Tb/)
    const names = screen.getAllByRole('link').map((a) => a.textContent ?? '')
    expect(names.filter((n) => /^T[a-d]/.test(n))).toHaveLength(3)
    expect(screen.queryByText(/Ta/)).toBeNull()
  })

  it('còn 5 giây: sau 6 giây sự kiện rời banner và không có chữ "-"', async () => {
    const api = createFakeApi({ games: GAMES, events: [ev({ endsAt: '2026-10-21T10:00:05Z' })] })
    const { container } = mountWith(api, <EventBanner />)
    expect(await screen.findByText(/Spring cup/)).toBeInTheDocument()
    expect(container.textContent).toContain('00:00:05')
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })
    expect(screen.queryByText(/Spring cup/)).toBeNull()
    expect(container.textContent).not.toContain('-')
    expect(screen.getByRole('link', { name: en('ev.all') })).toBeInTheDocument()
  })

  it('events lỗi: vẫn có link tất cả sự kiện', async () => {
    const api = createFakeApi({ games: GAMES })
    api.fail('events')
    mountWith(api, <EventBanner />)
    expect(await screen.findByRole('link', { name: en('ev.all') })).toBeInTheDocument()
  })

  it('không server → không render gì', () => {
    const { container } = mountWith(null, <EventBanner />)
    expect(container.innerHTML).toBe('')
  })
})
