import { describe, expect, it, vi } from 'vitest'
import { loadOrReload } from './chunkReload'
import { safeStore } from './safeStorage'

const memory = () => {
  const m = new Map<string, string>()
  return safeStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) } as Storage)
}

describe('loadOrReload', () => {
  it('tải được: trả kết quả, không tải lại trang', async () => {
    const reload = vi.fn()
    await expect(loadOrReload(() => Promise.resolve(7), { store: memory(), reload })).resolves.toBe(7)
    expect(reload).not.toHaveBeenCalled()
  })

  it('lỗi tải lần đầu (file JS của bản cũ đã bị xóa): tải lại trang một lần, không ném lỗi', async () => {
    const reload = vi.fn()
    const store = memory()
    const p = loadOrReload(() => Promise.reject(new Error('Failed to fetch dynamically imported module')), { store, reload })
    let settled = false
    p.then(() => (settled = true), () => (settled = true))
    await new Promise((r) => setTimeout(r, 0))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)
  })

  it('đã tải lại mà vẫn lỗi: ném lỗi (không lặp tải lại mãi); tải được thì xóa dấu để lần sau còn tự sửa', async () => {
    const reload = vi.fn()
    const store = memory()
    loadOrReload(() => Promise.reject(new Error('x')), { store, reload })
    await new Promise((r) => setTimeout(r, 0))
    await expect(loadOrReload(() => Promise.reject(new Error('x')), { store, reload })).rejects.toThrow('x')
    expect(reload).toHaveBeenCalledTimes(1)
    await loadOrReload(() => Promise.resolve(1), { store, reload })
    loadOrReload(() => Promise.reject(new Error('x')), { store, reload })
    await new Promise((r) => setTimeout(r, 0))
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
