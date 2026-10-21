import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountWith } from '../events/testUtil'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { ADMIN, player } from './adminTestUtil'
import { AdminPlayers } from './AdminPlayers'

const en = (k: string) => DICT.en[k] as string
const seed = () => [player('a1', 'Admin', { role: 'admin' }), player('p2', 'Anna'), player('p3', 'Bob')]
const rowOf = (c: HTMLElement, id: string) => within(c.querySelector<HTMLElement>(`[data-player="${id}"]`)!)
const lastQuery = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((c) => c.method === 'adminPlayers').at(-1)!.args

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AdminPlayers', () => {
  it('tải danh sách, tên là link hồ sơ, hàng của mình không có nút khóa', async () => {
    const api = createFakeApi({ user: ADMIN, adminPlayers: seed() })
    const { container } = mountWith(api, <AdminPlayers />)
    await screen.findByText('Anna')
    expect(lastQuery(api)).toEqual([''])
    expect(rowOf(container, 'p2').getByRole('link', { name: 'Anna' })).toHaveAttribute('href', '#/u/p2')
    expect(rowOf(container, 'a1').queryByRole('button')).toBeNull()
    expect(rowOf(container, 'p2').getByRole('button', { name: en('admin.ban') })).toBeInTheDocument()
  })

  it("tìm 'an' (nút Tìm và Enter) gọi adminPlayers('an')", async () => {
    const api = createFakeApi({ user: ADMIN, adminPlayers: seed() })
    mountWith(api, <AdminPlayers />)
    await screen.findByText('Bob')
    const box = screen.getByRole('searchbox')
    fireEvent.change(box, { target: { value: 'an' } })
    fireEvent.click(screen.getByRole('button', { name: en('admin.search') }))
    await waitFor(() => expect(screen.queryByText('Bob')).toBeNull())
    expect(lastQuery(api)).toEqual(['an'])
    fireEvent.change(box, { target: { value: 'bo' } })
    fireEvent.submit(box.closest('form')!)
    await screen.findByText('Bob')
    expect(lastQuery(api)).toEqual(['bo'])
  })

  it('khóa: confirm true gọi adminSetBanned rồi nút đổi thành mở khóa', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const api = createFakeApi({ user: ADMIN, adminPlayers: seed() })
    const { container } = mountWith(api, <AdminPlayers />)
    await screen.findByText('Anna')
    fireEvent.click(rowOf(container, 'p2').getByRole('button', { name: en('admin.ban') }))
    expect(await rowOf(container, 'p2').findByRole('button', { name: en('admin.unban') })).toBeInTheDocument()
    expect(api.calls.find((c) => c.method === 'adminSetBanned')!.args).toEqual(['p2', true])
  })

  it('câu hỏi xác nhận đúng chiều: khóa hỏi khóa, mở khóa hỏi mở khóa', async () => {
    const ask = vi.fn(() => true)
    vi.stubGlobal('confirm', ask)
    const api = createFakeApi({ user: ADMIN, adminPlayers: [...seed(), player('p4', 'Cara', { banned: true })] })
    const { container } = mountWith(api, <AdminPlayers />)
    await screen.findByText('Anna')
    fireEvent.click(rowOf(container, 'p4').getByRole('button', { name: en('admin.unban') }))
    expect(ask).toHaveBeenLastCalledWith('Unban Cara?')
    fireEvent.click(rowOf(container, 'p2').getByRole('button', { name: en('admin.ban') }))
    expect(ask).toHaveBeenLastCalledWith('Ban Anna?')
  })

  it('confirm false: không gọi', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const api = createFakeApi({ user: ADMIN, adminPlayers: seed() })
    const { container } = mountWith(api, <AdminPlayers />)
    await screen.findByText('Anna')
    fireEvent.click(rowOf(container, 'p2').getByRole('button', { name: en('admin.ban') }))
    expect(api.calls.some((c) => c.method === 'adminSetBanned')).toBe(false)
  })

  it('RPC lỗi: hiện mã lỗi, không ném', async () => {
    const api = createFakeApi({ user: ADMIN, adminPlayers: seed() })
    api.fail('adminPlayers', new Error('admin_players: forbidden'))
    mountWith(api, <AdminPlayers />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed: forbidden')
  })
})
