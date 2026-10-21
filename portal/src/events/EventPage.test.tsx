import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DICT } from '../i18n/dict'
import { I18nProvider } from '../i18n/i18n'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import { EventBoard } from './EventBoard'
import { EventPage } from './EventPage'
import { ev, GAMES, mountWith, NOW, row } from './testUtil'

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

const BOARD = [row(1, 'An', 12345), row(2, 'Binh', 900), row(3, 'Chi', 12)]

describe('EventBoard metric', () => {
  it('game time_low: giá trị hiện dạng mm:ss, không phải ms thô', async () => {
    const games = [{ id: 'minesweeper', metric: 'time_low' as const, hidden: false, modes: [{ key: 'beginner', label: { en: 'Beginner', vi: 'Dễ' } }] }]
    const e = ev({ gameId: 'minesweeper', mode: 'beginner' })
    const api = createFakeApi({ games, events: [e], eventBoards: { e1: [row(1, 'An', 65000)] } })
    const { container } = mountWith(api, <EventBoard event={e} />)
    expect(await screen.findByText('An')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.lb-value')!.textContent).toBe('01:05'))
  })

  it('chưa biết metric của game: hiện hàng nhưng để trống giá trị', async () => {
    const e = ev({ gameId: 'ghost' })
    const api = createFakeApi({ games: GAMES, events: [e], eventBoards: { e1: [row(1, 'An', 65000)] } })
    const { container } = mountWith(api, <EventBoard event={e} />)
    expect(await screen.findByText('An')).toBeInTheDocument()
    expect(container.querySelector('.lb-value')!.textContent).toBe('')
  })
})

describe('EventPage', () => {
  it('sự kiện live: đếm ngược, nút Chơi ngay, bảng 3 hàng đã định dạng', async () => {
    const api = createFakeApi({ games: GAMES, events: [ev()], eventBoards: { e1: BOARD } })
    const { container } = mountWith(api, <EventPage eventId="e1" />)
    expect(await screen.findByRole('heading', { name: 'Spring cup' })).toBeInTheDocument()
    expect(screen.getByText('Ends in 02:00:00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: en('ev.play') })).toHaveAttribute('href', '#/play/2048')
    expect(await screen.findByText('An')).toBeInTheDocument()
    const rows = container.querySelectorAll('.lb-list li')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('12,345')
    expect(container.querySelector('[data-page="event"]')).toHaveAttribute('data-event-id', 'e1')
    expect(screen.getByText(en('ev.agg.best'))).toBeInTheDocument()
    expect(screen.getByText('Top 2 earn a badge')).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Spring cup · PlayNine'))
  })

  it('mô tả giữ xuống dòng và hiện dạng text', async () => {
    const evil = '<b>x</b>\nline2'
    const api = createFakeApi({ games: GAMES, events: [ev({ description: { en: evil } })] })
    const { container } = mountWith(api, <EventPage eventId="e1" />)
    await screen.findByRole('heading', { name: 'Spring cup' })
    const p = container.querySelector('.ev-desc')!
    expect(p.textContent).toBe(evil)
    expect(p.querySelector('b')).toBeNull()
  })

  it('quá endsAt nhưng status vẫn live: ev.ended + ev.provisional, không có nút chơi', async () => {
    vi.setSystemTime(new Date('2026-10-21T13:00:00Z'))
    const api = createFakeApi({ games: GAMES, events: [ev()], eventBoards: { e1: BOARD } })
    mountWith(api, <EventPage eventId="e1" />)
    expect(await screen.findByText(en('ev.provisional'))).toBeInTheDocument()
    expect(screen.getByText(en('ev.ended'))).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: en('ev.play') })).toBeNull()
    expect(screen.queryByText(en('ev.winners'))).toBeNull()
  })

  it('closed với awardTop 2: mục ev.winners có đúng 2 người', async () => {
    vi.setSystemTime(new Date('2026-10-21T13:00:00Z'))
    const api = createFakeApi({ games: GAMES, events: [ev({ status: 'closed' })], eventBoards: { e1: BOARD } })
    mountWith(api, <EventPage eventId="e1" />)
    const head = await screen.findByRole('heading', { name: en('ev.winners') })
    const section = head.closest('section')!
    const names = within(section).getAllByRole('listitem').map((li) => li.textContent)
    expect(names).toHaveLength(2)
    expect(names[0]).toContain('An')
    expect(names[1]).toContain('Binh')
    expect(screen.queryByText(en('ev.provisional'))).toBeNull()
  })

  it('sự kiện sắp diễn ra: đếm ngược tới lúc bắt đầu, chưa có nút chơi', async () => {
    const api = createFakeApi({ games: GAMES, events: [ev({ status: 'scheduled', startsAt: '2026-10-21T11:00:00Z' })] })
    mountWith(api, <EventPage eventId="e1" />)
    expect(await screen.findByText('Starts in 01:00:00')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: en('ev.play') })).toBeNull()
  })

  it('sự kiện đã hủy → ev.cancelled', async () => {
    mountWith(createFakeApi({ games: GAMES, events: [ev({ status: 'cancelled' })] }), <EventPage eventId="e1" />)
    expect(await screen.findByText(en('ev.cancelled'))).toBeInTheDocument()
  })

  it('id lạ → ev.notFound', async () => {
    mountWith(createFakeApi({ games: GAMES, events: [ev()] }), <EventPage eventId="nope" />)
    expect(await screen.findByText(en('ev.notFound'))).toBeInTheDocument()
  })

  it('không server → ev.unavailable; events lỗi → ev.error', async () => {
    mountWith(null, <EventPage eventId="e1" />)
    expect(screen.getByText(en('ev.unavailable'))).toBeInTheDocument()
    cleanup()
    const api = createFakeApi({ games: GAMES })
    api.fail('events')
    mountWith(api, <EventPage eventId="e1" />)
    expect(await screen.findByText(en('ev.error'))).toBeInTheDocument()
  })

  it('awardTop lớn hơn 50: liệt kê đủ người nhận huy hiệu', async () => {
    vi.setSystemTime(new Date('2026-10-21T13:00:00Z'))
    const big = Array.from({ length: 60 }, (_, i) => row(i + 1, 'P' + (i + 1), 1000 - i))
    const api = createFakeApi({ games: GAMES, events: [ev({ status: 'closed', awardTop: 55 })], eventBoards: { e1: big } })
    mountWith(api, <EventPage eventId="e1" />)
    const head = await screen.findByRole('heading', { name: en('ev.winners') })
    expect(within(head.closest('section')!).getAllByRole('listitem')).toHaveLength(55)
  })

  it('đổi sự kiện thì không hiện người nhận huy hiệu của sự kiện cũ', async () => {
    vi.setSystemTime(new Date('2026-10-21T13:00:00Z'))
    const api = createFakeApi({
      games: GAMES,
      events: [ev({ status: 'closed' }), ev({ id: 'e2', status: 'closed' })],
      eventBoards: { e1: BOARD, e2: [row(1, 'Zed', 5)] },
    })
    const ui = (id: string) => (
      <I18nProvider>
        <ServerProvider api={api}>
          <EventPage eventId={id} />
        </ServerProvider>
      </I18nProvider>
    )
    const view = render(ui('e1'))
    const head = await screen.findByRole('heading', { name: en('ev.winners') })
    expect(within(head.closest('section')!).getByText('An')).toBeInTheDocument()
    view.rerender(ui('e2'))
    expect(screen.queryByText('An')).toBeNull()
    expect((await screen.findAllByText('Zed')).length).toBe(2)
  })
})
