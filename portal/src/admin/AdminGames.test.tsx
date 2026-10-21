import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountWith } from '../events/testUtil'
import { GAMES } from '../games/catalog'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { GAMES_META } from './adminTestUtil'
import { AdminGames } from './AdminGames'

const en = (k: string) => DICT.en[k] as string
const rowOf = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-game="${id}"]`)!

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('AdminGames', () => {
  it('mỗi game trong catalog một hàng, đúng thứ tự', async () => {
    const api = createFakeApi({ games: GAMES.map((g) => ({ id: g.id, metric: 'score_high', hidden: false, modes: [] })) })
    const { container } = mountWith(api, <AdminGames />)
    await waitFor(() => expect(container.querySelectorAll('[data-game]').length).toBe(GAMES.length))
    expect([...container.querySelectorAll('[data-game]')].map((e) => e.getAttribute('data-game'))).toEqual(
      GAMES.map((g) => g.id),
    )
  })

  it('bỏ trống một ô rồi lưu: gửi luật của mọi mode, làm mới danh sách game', async () => {
    const api = createFakeApi({ games: GAMES_META })
    const { container } = mountWith(api, <AdminGames />)
    await waitFor(() => expect(rowOf(container, '2048')).not.toBeNull())
    const row = within(rowOf(container, '2048'))
    const g44 = within(row.getByRole('group', { name: '4x4' }))
    expect(g44.getByLabelText('min_duration_ms')).toHaveValue('1000')
    fireEvent.change(g44.getByLabelText('max_score'), { target: { value: '' } })
    fireEvent.click(row.getByRole('button', { name: en('admin.save') }))
    expect(await screen.findByRole('status')).toHaveTextContent(en('admin.saved'))
    const call = api.calls.find((c) => c.method === 'adminUpdateGame')!
    expect(call.args).toEqual([
      '2048',
      false,
      { '3x3': { max_score: 1000, max_score_per_sec: 2.5 }, '4x4': { min_duration_ms: 1000 } },
    ])
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'gameMeta').length).toBe(2))
  })

  it('tick ẩn game rồi lưu gửi hidden = true', async () => {
    const api = createFakeApi({ games: GAMES_META })
    const { container } = mountWith(api, <AdminGames />)
    await waitFor(() => expect(rowOf(container, '2048')).not.toBeNull())
    const row = within(rowOf(container, '2048'))
    fireEvent.click(row.getByRole('checkbox', { name: en('admin.hidden') }))
    fireEvent.click(row.getByRole('button', { name: en('admin.save') }))
    await screen.findByRole('status')
    expect(api.calls.find((c) => c.method === 'adminUpdateGame')!.args[1]).toBe(true)
  })

  it('ô sai: báo lỗi tại ô và không gọi API', async () => {
    const api = createFakeApi({ games: GAMES_META })
    const { container } = mountWith(api, <AdminGames />)
    await waitFor(() => expect(rowOf(container, '2048')).not.toBeNull())
    const row = within(rowOf(container, '2048'))
    const input = within(row.getByRole('group', { name: '4x4' })).getByLabelText('max_score')
    fireEvent.change(input, { target: { value: '-1' } })
    fireEvent.click(row.getByRole('button', { name: en('admin.save') }))
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(api.calls.some((c) => c.method === 'adminUpdateGame')).toBe(false)
  })

  it('nhập dở dang như 1e vẫn báo lỗi, ô thập phân có thông báo riêng', async () => {
    const api = createFakeApi({ games: GAMES_META })
    const { container } = mountWith(api, <AdminGames />)
    await waitFor(() => expect(rowOf(container, '2048')).not.toBeNull())
    const row = within(rowOf(container, '2048'))
    const g33 = within(row.getByRole('group', { name: '3x3' }))
    const maxScore = g33.getByLabelText('max_score')
    const perSec = g33.getByLabelText('max_score_per_sec')
    fireEvent.change(maxScore, { target: { value: '1e' } })
    fireEvent.click(row.getByRole('button', { name: en('admin.save') }))
    expect(maxScore).toHaveAttribute('aria-invalid', 'true')
    expect(g33.getByText(en('admin.invalid'))).toBeInTheDocument()
    fireEvent.change(maxScore, { target: { value: '5' } })
    fireEvent.change(perSec, { target: { value: 'x' } })
    fireEvent.click(row.getByRole('button', { name: en('admin.save') }))
    expect(g33.getByText(en('admin.invalidDecimal'))).toBeInTheDocument()
    expect(api.calls.some((c) => c.method === 'adminUpdateGame')).toBe(false)
  })

  it('không có metadata game: báo không tải được', () => {
    mountWith(createFakeApi({ games: [] }), <AdminGames />)
    expect(screen.getByText(en('admin.noGames'))).toBeInTheDocument()
  })

  it('adminUpdateGame lỗi forbidden: hiện mã lỗi', async () => {
    const api = createFakeApi({ games: GAMES_META })
    api.fail('adminUpdateGame', new Error('admin_update_game: forbidden'))
    const { container } = mountWith(api, <AdminGames />)
    await waitFor(() => expect(rowOf(container, '2048')).not.toBeNull())
    fireEvent.click(within(rowOf(container, '2048')).getByRole('button', { name: en('admin.save') }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed: forbidden')
  })
})
