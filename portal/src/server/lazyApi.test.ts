import { describe, expect, it, vi } from 'vitest'
import type { ServerApi } from './api'
import { lazyApi } from './lazyApi'

const fakeApi = (over: Partial<ServerApi> = {}) =>
  ({
    gameMeta: vi.fn(async () => [{ id: 'x' }]),
    favorites: vi.fn(async () => ['a', 'b']),
    onAuthChange: vi.fn(() => vi.fn()),
    ...over,
  }) as unknown as ServerApi

describe('lazyApi', () => {
  it('chưa gọi hàm nào thì chưa nạp', () => {
    const load = vi.fn(async () => fakeApi())
    lazyApi(load)
    expect(load).not.toHaveBeenCalled()
  })

  it('chuyển lời gọi sang api thật và chỉ nạp một lần', async () => {
    const real = fakeApi()
    const load = vi.fn(async () => real)
    const api = lazyApi(load)
    expect(await api.gameMeta()).toEqual([{ id: 'x' }])
    expect(await api.favorites()).toEqual(['a', 'b'])
    expect(load).toHaveBeenCalledTimes(1)
    expect(real.gameMeta).toHaveBeenCalledTimes(1)
  })

  it('giữ nguyên tham số', async () => {
    const setFavorite = vi.fn(async () => {})
    const api = lazyApi(async () => fakeApi({ setFavorite }))
    await api.setFavorite('caro', true)
    expect(setFavorite).toHaveBeenCalledWith('caro', true)
  })

  it('nạp lỗi thì lời gọi bị từ chối', async () => {
    const api = lazyApi(async () => {
      throw new Error('offline')
    })
    await expect(api.gameMeta()).rejects.toThrow('offline')
  })

  it('không phải thenable (await api không treo)', async () => {
    const api = lazyApi(async () => fakeApi())
    expect((api as unknown as { then?: unknown }).then).toBeUndefined()
    expect(await Promise.resolve(api)).toBe(api)
  })

  it('onAuthChange đăng ký sau khi nạp, hủy được', async () => {
    const off = vi.fn()
    const real = fakeApi({ onAuthChange: vi.fn(() => off) })
    const api = lazyApi(async () => real)
    const cb = vi.fn()
    const unsub = api.onAuthChange(cb)
    await api.gameMeta()
    expect(real.onAuthChange).toHaveBeenCalledWith(cb)
    unsub()
    expect(off).toHaveBeenCalled()
  })

  it('hủy onAuthChange trước khi nạp xong thì không đăng ký', async () => {
    const real = fakeApi()
    const api = lazyApi(async () => real)
    api.onAuthChange(vi.fn())()
    await api.gameMeta()
    expect(real.onAuthChange).not.toHaveBeenCalled()
  })
})
