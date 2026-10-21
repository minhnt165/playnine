import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountWith } from '../events/testUtil'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { ADMIN, GAMES_META, run } from './adminTestUtil'
import { AdminRuns } from './AdminRuns'

const en = (k: string) => DICT.en[k] as string
const rowOf = (c: HTMLElement, id: string) => within(c.querySelector<HTMLElement>(`[data-run="${id}"]`)!)
const calls = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((c) => c.method === 'adminRuns')

/** 60 ván, mới nhất trước; startedAt giữ nguyên độ chính xác micro giây. */
const many = () =>
  Array.from({ length: 60 }, (_, i) => {
    const s = 3599 - i
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    return run(`r${i}`, { startedAt: `2026-10-21T10:${mm}:${ss}.123456+00:00` })
  })

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AdminRuns', () => {
  it('tải 50 ván đầu, hiện người chơi, giá trị, trạng thái và lý do', async () => {
    const api = createFakeApi({
      user: ADMIN,
      games: GAMES_META,
      adminRuns: [
        run('r1'),
        run('r2', { gameId: 'sugoku', mode: 'easy', score: null, timeMs: 65000, status: 'rejected', rejectReason: 'cheat' }),
      ],
    })
    const { container } = mountWith(api, <AdminRuns />)
    await screen.findAllByText('Anna')
    expect(calls(api)[0].args).toEqual([{ limit: 50 }])
    expect(rowOf(container, 'r1').getByText('1,234')).toBeInTheDocument()
    expect(rowOf(container, 'r2').getByText('01:05')).toBeInTheDocument()
    expect(rowOf(container, 'r2').getByText('cheat')).toBeInTheDocument()
    expect(rowOf(container, 'r2').queryByRole('button')).toBeNull()
  })

  it('lọc gửi đúng RunFilter', async () => {
    const api = createFakeApi({ user: ADMIN, games: GAMES_META, adminRuns: [run('r1')] })
    mountWith(api, <AdminRuns />)
    await screen.findByText('Anna')
    fireEvent.change(screen.getByLabelText(en('admin.filter.game')), { target: { value: '2048' } })
    fireEvent.change(screen.getByLabelText(en('admin.filter.mode')), { target: { value: '4x4' } })
    fireEvent.change(screen.getByLabelText(en('admin.filter.user')), { target: { value: ' u1 ' } })
    fireEvent.change(screen.getByLabelText(en('admin.filter.status')), { target: { value: 'finished' } })
    fireEvent.click(screen.getByRole('button', { name: en('admin.filter.apply') }))
    await waitFor(() => expect(calls(api).length).toBe(2))
    expect(calls(api)[1].args).toEqual([{ gameId: '2048', mode: '4x4', userId: 'u1', status: 'finished', limit: 50 }])
  })

  it('từ chối: prompt trả cheat gọi adminRejectRun, hàng đổi thành rejected', async () => {
    vi.stubGlobal('prompt', vi.fn(() => 'cheat'))
    const api = createFakeApi({ user: ADMIN, games: GAMES_META, adminRuns: [run('r1')] })
    const { container } = mountWith(api, <AdminRuns />)
    await screen.findByText('Anna')
    fireEvent.click(rowOf(container, 'r1').getByRole('button', { name: en('admin.reject') }))
    await rowOf(container, 'r1').findByText(en('admin.status.rejected'))
    expect(api.calls.find((c) => c.method === 'adminRejectRun')!.args).toEqual(['r1', 'cheat'])
    expect(rowOf(container, 'r1').getByText('cheat')).toBeInTheDocument()
    expect(rowOf(container, 'r1').queryByRole('button')).toBeNull()
  })

  it('từ chối: prompt trả null thì không gọi', async () => {
    vi.stubGlobal('prompt', vi.fn(() => null))
    const api = createFakeApi({ user: ADMIN, games: GAMES_META, adminRuns: [run('r1')] })
    const { container } = mountWith(api, <AdminRuns />)
    await screen.findByText('Anna')
    fireEvent.click(rowOf(container, 'r1').getByRole('button', { name: en('admin.reject') }))
    expect(api.calls.some((c) => c.method === 'adminRejectRun')).toBe(false)
  })

  it('"Xem thêm" gửi before = startedAt của hàng cuối và nối thêm hàng, rồi ẩn', async () => {
    const rows = many()
    const api = createFakeApi({ user: ADMIN, games: GAMES_META, adminRuns: rows })
    const { container } = mountWith(api, <AdminRuns />)
    await screen.findByRole('button', { name: en('admin.more') })
    expect(container.querySelectorAll('[data-run]').length).toBe(50)
    fireEvent.click(screen.getByRole('button', { name: en('admin.more') }))
    await waitFor(() => expect(container.querySelectorAll('[data-run]').length).toBe(60))
    expect(calls(api)[1].args).toEqual([{ before: rows[49].startedAt, limit: 50 }])
    expect(screen.queryByRole('button', { name: en('admin.more') })).toBeNull()
  })

  it('bấm "Xem thêm" hai lần khi đang chờ chỉ gửi một yêu cầu, nút bị khóa', async () => {
    const rows = many()
    const api = createFakeApi({ user: ADMIN, games: GAMES_META, adminRuns: rows })
    const orig = api.adminRuns
    let release: () => void = () => {}
    api.adminRuns = (f) =>
      f.before === undefined
        ? orig(f)
        : new Promise((res) => {
            release = () => res(orig(f))
          })
    const { container } = mountWith(api, <AdminRuns />)
    const btn = await screen.findByRole('button', { name: en('admin.more') })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(btn).toBeDisabled()
    expect(calls(api).length).toBe(1)
    release()
    await waitFor(() => expect(container.querySelectorAll('[data-run]').length).toBe(60))
    expect(new Set([...container.querySelectorAll('[data-run]')].map((e) => e.getAttribute('data-run'))).size).toBe(60)
  })

  it('"Xem thêm" trả về sau khi đã lọc lại thì không thêm hàng của bộ lọc cũ', async () => {
    const rows = many()
    const api = createFakeApi({ user: ADMIN, games: GAMES_META, adminRuns: rows })
    const orig = api.adminRuns
    let release: () => void = () => {}
    api.adminRuns = (f) =>
      f.before === undefined
        ? orig(f)
        : new Promise((res) => {
            release = () => res(orig(f))
          })
    const { container } = mountWith(api, <AdminRuns />)
    fireEvent.click(await screen.findByRole('button', { name: en('admin.more') }))
    fireEvent.change(screen.getByLabelText(en('admin.filter.status')), { target: { value: 'finished' } })
    fireEvent.click(screen.getByRole('button', { name: en('admin.filter.apply') }))
    await waitFor(() => expect(container.querySelectorAll('[data-run]').length).toBe(50))
    release()
    await new Promise((r) => setTimeout(r, 20))
    expect(container.querySelectorAll('[data-run]').length).toBe(50)
  })

  it('RPC lỗi: hiện mã lỗi', async () => {
    const api = createFakeApi({ user: ADMIN, games: GAMES_META })
    api.fail('adminRuns', new Error('admin_runs: forbidden'))
    mountWith(api, <AdminRuns />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed: forbidden')
  })
})
