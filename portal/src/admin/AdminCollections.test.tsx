import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountWith } from '../events/testUtil'
import { GAMES } from '../games/catalog'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import type { Collection, CollectionInput } from '../server/types'
import { ADMIN } from './adminTestUtil'
import { AdminCollections } from './AdminCollections'

const en = (k: string) => DICT.en[k] as string
const name = (id: string) => {
  const n = GAMES.find((g) => g.id === id)!.name
  return typeof n === 'string' ? n : n.en
}
const col = (over: Partial<Collection> = {}): Collection => ({
  id: 'c1',
  title: { en: 'Summer', vi: 'Hè' },
  gameIds: ['2048', 'caro'],
  startsAt: '2026-10-01T00:00:00Z',
  endsAt: null,
  sort: 2,
  ...over,
})
const setup = (collections: Collection[] = []) => {
  const api = createFakeApi({ user: ADMIN, collections })
  return { api, ...mountWith(api, <AdminCollections />) }
}
const saveCall = (api: ReturnType<typeof createFakeApi>) => api.calls.find((c) => c.method === 'adminSaveCollection')
const fillBasics = (title: string) => {
  fireEvent.change(screen.getByLabelText(en('admin.field.titleEn')), { target: { value: title } })
  fireEvent.change(screen.getByLabelText(en('admin.field.startsAt')), { target: { value: '2030-05-01T09:30' } })
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AdminCollections', () => {
  it('danh sách game có đủ mọi game trong catalog', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: en('admin.newCollection') }))
    expect(screen.getAllByRole('checkbox').length).toBe(GAMES.length)
  })

  it('chọn 3 game, đưa game thứ 3 lên đầu bằng ↑: gửi gameIds theo thứ tự mới', async () => {
    const { api } = setup()
    fireEvent.click(await screen.findByRole('button', { name: en('admin.newCollection') }))
    fillBasics('Mix')
    for (const id of ['2048', 'caro', 'ran']) fireEvent.click(screen.getByRole('checkbox', { name: name(id) }))
    fireEvent.click(screen.getByRole('button', { name: en('admin.up') + ' ' + name('ran') }))
    fireEvent.click(screen.getByRole('button', { name: en('admin.up') + ' ' + name('ran') }))
    fireEvent.click(screen.getByRole('button', { name: en('admin.save') }))
    expect(await screen.findByRole('status')).toHaveTextContent(en('admin.saved'))
    expect(saveCall(api)!.args[0]).toEqual({
      title: { en: 'Mix' },
      gameIds: ['ran', '2048', 'caro'],
      startsAt: new Date('2030-05-01T09:30').toISOString(),
      endsAt: null,
      sort: 0,
    })
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'collections').length).toBe(2))
  })

  it('↓ đổi chỗ xuống; bỏ chọn một game thì bỏ khỏi thứ tự', async () => {
    const { api } = setup()
    fireEvent.click(await screen.findByRole('button', { name: en('admin.newCollection') }))
    fillBasics('Mix')
    for (const id of ['2048', 'caro', 'ran']) fireEvent.click(screen.getByRole('checkbox', { name: name(id) }))
    fireEvent.click(screen.getByRole('button', { name: en('admin.down') + ' ' + name('2048') }))
    fireEvent.click(screen.getByRole('checkbox', { name: name('ran') }))
    fireEvent.click(screen.getByRole('button', { name: en('admin.save') }))
    await screen.findByRole('status')
    expect((saveCall(api)!.args[0] as CollectionInput).gameIds).toEqual(['caro', '2048'])
  })

  it('sửa: nạp giá trị cũ, kết thúc để trống gửi null, gửi id', async () => {
    const { api, container } = setup([col()])
    await waitFor(() => expect(container.querySelector('[data-collection="c1"]')).not.toBeNull())
    const row = container.querySelector<HTMLElement>('[data-collection="c1"]')!
    fireEvent.click(within(row).getByRole('button', { name: en('admin.edit') }))
    expect(screen.getByLabelText(en('admin.field.titleVi'))).toHaveValue('Hè')
    expect(screen.getByLabelText(en('admin.field.sort'))).toHaveValue(2)
    expect(screen.getByLabelText(en('admin.field.endsAt'))).toHaveValue('')
    fireEvent.change(screen.getByLabelText(en('admin.field.sort')), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: en('admin.save') }))
    await screen.findByRole('status')
    expect(saveCall(api)!.args[0]).toMatchObject({ id: 'c1', gameIds: ['2048', 'caro'], endsAt: null, sort: 7 })
  })

  it('không chọn game: admin.invalidForm, không gọi API', async () => {
    const { api } = setup()
    fireEvent.click(await screen.findByRole('button', { name: en('admin.newCollection') }))
    fillBasics('Empty')
    fireEvent.click(screen.getByRole('button', { name: en('admin.save') }))
    expect(await screen.findByText(en('admin.invalidForm'))).toBeInTheDocument()
    expect(saveCall(api)).toBeUndefined()
  })

  it('xóa có confirm: false thì không gọi, true thì gọi adminDeleteCollection và tải lại', async () => {
    const ask = vi.fn(() => false)
    vi.stubGlobal('confirm', ask)
    const { api, container } = setup([col()])
    await waitFor(() => expect(container.querySelector('[data-collection="c1"]')).not.toBeNull())
    const row = () => within(container.querySelector<HTMLElement>('[data-collection="c1"]')!)
    fireEvent.click(row().getByRole('button', { name: en('admin.delete') }))
    expect(api.calls.some((c) => c.method === 'adminDeleteCollection')).toBe(false)
    ask.mockReturnValue(true)
    fireEvent.click(row().getByRole('button', { name: en('admin.delete') }))
    await waitFor(() => expect(container.querySelector('[data-collection="c1"]')).toBeNull())
    expect(api.calls.find((c) => c.method === 'adminDeleteCollection')!.args).toEqual(['c1'])
  })

  it('lỗi từ server hiện mã lỗi', async () => {
    const { api } = setup()
    api.fail('adminSaveCollection', new Error('admin_save_collection: bad_time'))
    fireEvent.click(await screen.findByRole('button', { name: en('admin.newCollection') }))
    fillBasics('X')
    fireEvent.click(screen.getByRole('checkbox', { name: name('2048') }))
    fireEvent.click(screen.getByRole('button', { name: en('admin.save') }))
    expect(await screen.findByRole('alert')).toHaveTextContent(en('admin.error').replace('{code}', 'bad_time'))
  })
})
