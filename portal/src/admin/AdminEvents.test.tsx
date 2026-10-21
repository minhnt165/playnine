import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ev, mountWith } from '../events/testUtil'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import type { EventInput, EventPatch, GameMeta } from '../server/types'
import { ADMIN } from './adminTestUtil'
import { AdminEvents } from './AdminEvents'

const en = (k: string) => DICT.en[k] as string
const HOUR = 3_600_000
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

const GAMES: GameMeta[] = [
  {
    id: '2048',
    metric: 'score_high',
    hidden: false,
    modes: [
      { key: '4x4', label: { en: '4x4', vi: '4x4' } },
      { key: '3x3', label: { en: '3x3', vi: '3x3' } },
    ],
  },
  { id: 'minesweeper', metric: 'time_low', hidden: false, modes: [{ key: 'beginner', label: { en: 'Beginner', vi: 'Dễ' } }] },
]

const setup = (events = [ev()]) => {
  const api = createFakeApi({ games: GAMES, user: ADMIN, events })
  const view = mountWith(api, <AdminEvents />)
  return { api, ...view }
}
const rowOf = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-event="${id}"]`)!
const saveCall = (api: ReturnType<typeof createFakeApi>) => api.calls.find((c) => c.method === 'adminSaveEvent')

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AdminEvents', () => {
  it('liệt kê mọi sự kiện (kể cả đã hủy), startsAt giảm dần, có nhãn giai đoạn', async () => {
    const { container } = setup([
      ev({ id: 'old', title: { en: 'Old' }, startsAt: iso(-48 * HOUR), endsAt: iso(-24 * HOUR), status: 'closed' }),
      ev({ id: 'soon', title: { en: 'Soon' }, startsAt: iso(24 * HOUR), endsAt: iso(48 * HOUR), status: 'scheduled' }),
      ev({ id: 'gone', title: { en: 'Gone' }, startsAt: iso(-HOUR), endsAt: iso(HOUR), status: 'cancelled' }),
    ])
    await waitFor(() => expect(container.querySelectorAll('[data-event]').length).toBe(3))
    expect([...container.querySelectorAll('[data-event]')].map((e) => e.getAttribute('data-event'))).toEqual([
      'soon',
      'gone',
      'old',
    ])
    expect(within(rowOf(container, 'soon')).getByText(en('admin.phase.upcoming'))).toBeInTheDocument()
    expect(within(rowOf(container, 'gone')).getByText(en('admin.phase.cancelled'))).toBeInTheDocument()
    expect(within(rowOf(container, 'old')).getByText(en('admin.phase.ended'))).toBeInTheDocument()
  })

  it('tạo sự kiện hợp lệ: startsAt/endsAt là ISO UTC đúng với giờ đã nhập, rồi tải lại danh sách', async () => {
    const { api } = setup([])
    fireEvent.click(await screen.findByRole('button', { name: en('admin.newEvent') }))
    fireEvent.change(screen.getByLabelText(en('admin.field.titleEn')), { target: { value: ' Spring cup ' } })
    fireEvent.change(screen.getByLabelText(en('admin.field.gameId')), { target: { value: '2048' } })
    fireEvent.change(screen.getByLabelText(en('admin.field.mode')), { target: { value: '3x3' } })
    fireEvent.change(screen.getByLabelText(en('admin.field.agg')), { target: { value: 'sum' } })
    fireEvent.change(screen.getByLabelText(en('admin.field.startsAt')), { target: { value: '2030-05-01T09:30' } })
    fireEvent.change(screen.getByLabelText(en('admin.field.endsAt')), { target: { value: '2030-05-02T18:00' } })
    fireEvent.change(screen.getByLabelText(en('admin.field.awardTop')), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: en('admin.save') }))
    expect(await screen.findByRole('status')).toHaveTextContent(en('admin.saved'))
    const input = saveCall(api)!.args[0] as EventInput
    expect(input).toEqual({
      title: { en: 'Spring cup' },
      description: {},
      gameId: '2048',
      mode: '3x3',
      agg: 'sum',
      startsAt: new Date('2030-05-01T09:30').toISOString(),
      endsAt: new Date('2030-05-02T18:00').toISOString(),
      awardTop: 5,
    })
    expect('id' in input).toBe(false)
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'events').length).toBe(2))
    expect(await screen.findByText('Spring cup')).toBeInTheDocument()
  })

  it('chọn game time_low (minesweeper) thì không còn lựa chọn sum và agg về best', async () => {
    setup([])
    fireEvent.click(await screen.findByRole('button', { name: en('admin.newEvent') }))
    const agg = screen.getByLabelText(en('admin.field.agg')) as HTMLSelectElement
    fireEvent.change(screen.getByLabelText(en('admin.field.gameId')), { target: { value: '2048' } })
    fireEvent.change(agg, { target: { value: 'sum' } })
    expect(screen.getByRole('option', { name: en('admin.field.aggSum') })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(en('admin.field.gameId')), { target: { value: 'minesweeper' } })
    expect(screen.queryByRole('option', { name: en('admin.field.aggSum') })).toBeNull()
    expect(agg.value).toBe('best')
    expect((screen.getByLabelText(en('admin.field.mode')) as HTMLSelectElement).value).toBe('beginner')
  })

  it('sự kiện đang diễn ra: startsAt, gameId, mode, agg bị disabled; tên và giờ kết thúc sửa được', async () => {
    const { container } = setup([ev({ startsAt: iso(-HOUR), endsAt: iso(HOUR), status: 'live' })])
    await waitFor(() => expect(rowOf(container, 'e1')).not.toBeNull())
    fireEvent.click(within(rowOf(container, 'e1')).getByRole('button', { name: en('admin.edit') }))
    for (const f of ['startsAt', 'gameId', 'mode', 'agg']) {
      expect(screen.getByLabelText(en('admin.field.' + f))).toBeDisabled()
    }
    for (const f of ['titleEn', 'titleVi', 'descEn', 'descVi', 'endsAt', 'awardTop']) {
      expect(screen.getByLabelText(en('admin.field.' + f))).toBeEnabled()
    }
  })

  it('sự kiện đã kết thúc: chỉ tên và mô tả sửa được', async () => {
    const { container } = setup([ev({ startsAt: iso(-3 * HOUR), endsAt: iso(-HOUR), status: 'closed' })])
    await waitFor(() => expect(rowOf(container, 'e1')).not.toBeNull())
    fireEvent.click(within(rowOf(container, 'e1')).getByRole('button', { name: en('admin.edit') }))
    for (const f of ['startsAt', 'endsAt', 'gameId', 'mode', 'agg', 'awardTop']) {
      expect(screen.getByLabelText(en('admin.field.' + f))).toBeDisabled()
    }
    expect(screen.getByLabelText(en('admin.field.titleEn'))).toBeEnabled()
  })

  it('sửa chỉ tên: chỉ gửi id và title; không gửi startsAt (dù có giây), gameId hay trường bị khóa', async () => {
    // startsAt có giây: datetime-local chỉ tới phút, gửi lại sẽ bị SQL báo event_started.
    const startsAt = new Date(Date.now() - HOUR).toISOString().replace(/:\d{2}\.\d{3}Z$/, ':30.000Z')
    const { api, container } = setup([ev({ startsAt, endsAt: iso(HOUR), status: 'live' })])
    await waitFor(() => expect(rowOf(container, 'e1')).not.toBeNull())
    fireEvent.click(within(rowOf(container, 'e1')).getByRole('button', { name: en('admin.edit') }))
    fireEvent.change(screen.getByLabelText(en('admin.field.titleEn')), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: en('admin.save') }))
    expect(await screen.findByRole('status')).toHaveTextContent(en('admin.saved'))
    const patch = saveCall(api)!.args[0] as EventPatch
    expect(patch).toEqual({ id: 'e1', title: { en: 'Renamed', vi: 'Cúp xuân' } })
    for (const k of ['startsAt', 'endsAt', 'gameId', 'mode', 'agg', 'awardTop', 'description']) {
      expect(k in patch).toBe(false)
    }
  })

  it('sửa giờ kết thúc của sự kiện live: gửi endsAt ISO UTC, vẫn không gửi startsAt', async () => {
    const { api, container } = setup([ev({ startsAt: iso(-HOUR), endsAt: iso(HOUR), status: 'live' })])
    await waitFor(() => expect(rowOf(container, 'e1')).not.toBeNull())
    fireEvent.click(within(rowOf(container, 'e1')).getByRole('button', { name: en('admin.edit') }))
    fireEvent.change(screen.getByLabelText(en('admin.field.endsAt')), { target: { value: '2031-01-01T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: en('admin.save') }))
    await screen.findByRole('status')
    expect(saveCall(api)!.args[0]).toEqual({ id: 'e1', endsAt: new Date('2031-01-01T10:00').toISOString() })
  })

  it('sự kiện live đã quá hạn (cron chưa đóng) không có nút hủy', async () => {
    const { container } = setup([ev({ startsAt: iso(-3 * HOUR), endsAt: iso(-HOUR), status: 'live' })])
    await waitFor(() => expect(rowOf(container, 'e1')).not.toBeNull())
    expect(within(rowOf(container, 'e1')).queryByRole('button', { name: en('admin.cancelEvent') })).toBeNull()
  })

  it('sự kiện closed có nút tính lại (có confirm), không có nút hủy', async () => {
    const ask = vi.fn(() => true)
    vi.stubGlobal('confirm', ask)
    const { api, container } = setup([ev({ startsAt: iso(-3 * HOUR), endsAt: iso(-HOUR), status: 'closed' })])
    await waitFor(() => expect(rowOf(container, 'e1')).not.toBeNull())
    const row = within(rowOf(container, 'e1'))
    expect(row.queryByRole('button', { name: en('admin.cancelEvent') })).toBeNull()
    fireEvent.click(row.getByRole('button', { name: en('admin.recompute') }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'adminRecomputeEvent')).toBe(true))
    expect(ask).toHaveBeenCalledTimes(1)
    expect(api.calls.find((c) => c.method === 'adminRecomputeEvent')!.args).toEqual(['e1'])
  })

  it('nút hủy chỉ có khi scheduled/live; confirm false thì không gọi; true thì hủy và tải lại', async () => {
    const ask = vi.fn(() => false)
    vi.stubGlobal('confirm', ask)
    const { api, container } = setup([
      ev({ id: 'a', startsAt: iso(-HOUR), endsAt: iso(HOUR), status: 'live' }),
      ev({ id: 'b', startsAt: iso(-5 * HOUR), endsAt: iso(-HOUR), status: 'cancelled' }),
    ])
    await waitFor(() => expect(rowOf(container, 'a')).not.toBeNull())
    expect(within(rowOf(container, 'b')).queryByRole('button', { name: en('admin.cancelEvent') })).toBeNull()
    expect(within(rowOf(container, 'a')).queryByRole('button', { name: en('admin.recompute') })).toBeNull()
    fireEvent.click(within(rowOf(container, 'a')).getByRole('button', { name: en('admin.cancelEvent') }))
    expect(api.calls.some((c) => c.method === 'adminCancelEvent')).toBe(false)
    ask.mockReturnValue(true)
    fireEvent.click(within(rowOf(container, 'a')).getByRole('button', { name: en('admin.cancelEvent') }))
    await waitFor(() => expect(within(rowOf(container, 'a')).getByText(en('admin.phase.cancelled'))).toBeInTheDocument())
  })

  it('adminSaveEvent lỗi event_started: hiện mã lỗi, giữ form', async () => {
    const { api, container } = setup([ev({ startsAt: iso(-HOUR), endsAt: iso(HOUR), status: 'live' })])
    api.fail('adminSaveEvent', new Error('admin_save_event: event_started'))
    await waitFor(() => expect(rowOf(container, 'e1')).not.toBeNull())
    fireEvent.click(within(rowOf(container, 'e1')).getByRole('button', { name: en('admin.edit') }))
    fireEvent.change(screen.getByLabelText(en('admin.field.titleEn')), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: en('admin.save') }))
    expect(await screen.findByRole('alert')).toHaveTextContent(en('admin.error').replace('{code}', 'event_started'))
    expect(screen.getByLabelText(en('admin.field.titleEn'))).toBeInTheDocument()
  })

  it('input sai: hiện admin.invalidForm, đánh dấu ô sai, không gọi API', async () => {
    const { api } = setup([])
    fireEvent.click(await screen.findByRole('button', { name: en('admin.newEvent') }))
    fireEvent.change(screen.getByLabelText(en('admin.field.startsAt')), { target: { value: '2030-05-02T10:00' } })
    fireEvent.change(screen.getByLabelText(en('admin.field.endsAt')), { target: { value: '2030-05-01T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: en('admin.save') }))
    expect(await screen.findByText(en('admin.invalidForm'))).toBeInTheDocument()
    expect(screen.getByLabelText(en('admin.field.titleEn'))).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(en('admin.field.endsAt'))).toHaveAttribute('aria-invalid', 'true')
    expect(saveCall(api)).toBeUndefined()
  })

  it('tên do người dùng nhập render dạng text, không phải HTML', async () => {
    const { container } = setup([ev({ title: { en: '<b>bold</b>' }, startsAt: iso(-HOUR), endsAt: iso(HOUR) })])
    await waitFor(() => expect(rowOf(container, 'e1')).not.toBeNull())
    expect(rowOf(container, 'e1').querySelector('b')).toBeNull()
    expect(rowOf(container, 'e1')).toHaveTextContent('<b>bold</b>')
  })
})
