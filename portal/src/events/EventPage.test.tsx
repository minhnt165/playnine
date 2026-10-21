import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
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
    expect(document.title).toBe('Spring cup · PlayNine')
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
})
