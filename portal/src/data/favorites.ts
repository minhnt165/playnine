import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { readJSON, write } from '../lib/storage'
import { useServer } from '../server/ServerProvider'

// Game yêu thích: luôn lưu trên máy (dùng được cả khi không có server); đã đăng nhập (kể cả khách) thì đồng bộ lên server.
const KEY = 'playnine-favorites-v1'

const load = (): string[] => {
  const v = readJSON<unknown>(KEY)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

let ids: string[] = load()
const subs = new Set<() => void>()

function set(next: string[]): void {
  ids = next
  write(KEY, JSON.stringify(next))
  subs.forEach((f) => f())
}

function subscribe(f: () => void): () => void {
  subs.add(f)
  // Tab khác đổi danh sách thì cập nhật theo.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      ids = load()
      f()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    subs.delete(f)
    window.removeEventListener('storage', onStorage)
  }
}

/** Đọc lại từ localStorage (test gọi sau khi xóa localStorage). */
export function reloadFavorites(): void {
  ids = load()
  subs.forEach((f) => f())
}

/** Danh sách yêu thích (mới thêm trước) và nút bật/tắt; lỗi server thì trả lại trạng thái cũ rồi ném lỗi. */
export function useFavorites() {
  const list = useSyncExternalStore(subscribe, () => ids)
  const { api, user } = useServer()
  const toggle = useCallback(
    async (id: string) => {
      const prev = ids
      const on = !prev.includes(id)
      set(on ? [id, ...prev] : prev.filter((x) => x !== id))
      if (!api || !user) return
      try {
        await api.setFavorite(id, on)
      } catch (e) {
        set(prev)
        throw e
      }
    },
    [api, user],
  )
  return { ids: list, has: (id: string) => list.includes(id), toggle }
}

/** Gắn một lần ở App: khi đăng nhập, gộp danh sách trên server với danh sách trên máy và đẩy phần còn thiếu lên. */
export function useFavoritesSync(): void {
  const { api, user } = useServer()
  const uid = user?.id
  useEffect(() => {
    if (!api || !uid) return
    let alive = true
    api.favorites().then(
      (server) => {
        if (!alive) return
        const extra = ids.filter((id) => !server.includes(id))
        set([...extra, ...server])
        for (const id of extra) api.setFavorite(id, true).catch(() => {})
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [api, uid])
}
