import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { EventsPage } from './EventsPage'
import { ev, GAMES, mountWith, NOW } from './testUtil'

const en = (k: string) => DICT.en[k] as string

beforeEach(() => {
  localStorage.clear()
  // Chỉ giả Date và setInterval để waitFor/findBy (dùng setTimeout thật) vẫn chạy.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date(NOW))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('EventsPage', () => {
  it('ba mục đúng thứ tự, sự kiện đã hủy không hiện', async () => {
    const api = createFakeApi({
      games: GAMES,
      events: [
        ev({ id: 'old', title: { en: 'Old one' }, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-02T00:00:00Z', status: 'closed' }),
        ev({ id: 'soon', title: { en: 'Soon one' }, startsAt: '2026-10-22T00:00:00Z', endsAt: '2026-10-23T00:00:00Z', status: 'scheduled' }),
        ev({ id: 'now', title: { en: 'Now one' } }),
        ev({ id: 'gone', title: { en: 'Gone one' }, status: 'cancelled' }),
      ],
    })
    mountWith(api, <EventsPage />)
    await screen.findByText('Now one')
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(heads).toEqual([en('ev.live'), en('ev.upcoming'), en('ev.ended')])
    expect(screen.queryByText('Gone one')).toBeNull()
    expect(screen.getByRole('link', { name: /Now one/ })).toHaveAttribute('href', '#/events/now')
    expect(document.title).toBe(en('ev.title') + ' · PlayNine')
  })

  it('thẻ có tên game, nhãn mode và đếm ngược cho sự kiện đang diễn ra', async () => {
    mountWith(createFakeApi({ games: GAMES, events: [ev()] }), <EventsPage />)
    const card = (await screen.findByRole('link', { name: /Spring cup/ })).closest('li')!
    expect(card.textContent).toContain('2048')
    expect(card.textContent).toContain('4x4')
    expect(card.textContent).toContain('02:00:00')
  })

  it('mục rỗng thì ẩn', async () => {
    mountWith(createFakeApi({ games: GAMES, events: [ev()] }), <EventsPage />)
    await screen.findByText('Spring cup')
    expect(screen.queryByText(en('ev.upcoming'))).toBeNull()
    expect(screen.queryByText(en('ev.ended'))).toBeNull()
  })

  it('không có sự kiện nào → ev.none', async () => {
    mountWith(createFakeApi({ games: GAMES, events: [] }), <EventsPage />)
    expect(await screen.findByText(en('ev.none'))).toBeInTheDocument()
  })

  it('tên sự kiện chứa HTML hiện dạng text', async () => {
    const evil = '<img src=x onerror=alert(1)>'
    const { container } = mountWith(createFakeApi({ games: GAMES, events: [ev({ title: { en: evil } })] }), <EventsPage />)
    expect(await screen.findByText(evil)).toBeInTheDocument()
    expect(container.querySelector('.ev-card-title img')).toBeNull()
  })

  it('lang vi dùng title.vi; vi rỗng thì dùng en', async () => {
    localStorage.setItem('playnine-lang', 'vi')
    mountWith(
      createFakeApi({
        games: GAMES,
        events: [ev(), ev({ id: 'e2', title: { en: 'Only English', vi: '  ' } })],
      }),
      <EventsPage />,
    )
    expect(await screen.findByText('Cúp xuân')).toBeInTheDocument()
    expect(screen.getByText('Only English')).toBeInTheDocument()
  })

  it('không server → ev.unavailable', () => {
    mountWith(null, <EventsPage />)
    expect(screen.getByText(en('ev.unavailable'))).toBeInTheDocument()
  })

  it('events lỗi → ev.error', async () => {
    const api = createFakeApi({ games: GAMES })
    api.fail('events')
    mountWith(api, <EventsPage />)
    expect(await screen.findByText(en('ev.error'))).toBeInTheDocument()
  })
})
