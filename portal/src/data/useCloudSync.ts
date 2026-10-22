import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useServer } from '../server/ServerProvider'
import { gameOfKey, isSyncKey, syncOnce } from './cloudSave'

// Lượt định kỳ; ngoài ra còn đồng bộ khi game ghi tiến độ (sự kiện storage), khi đóng game và khi rời tab.
const INTERVAL_MS = 60_000
const DEBOUNCE_MS = 3_000

/** guest: tài khoản khách, tiến độ chỉ lưu trên máy (server chỉ lưu cho tài khoản Google). */
export type CloudStatus = { state: 'off' | 'guest' | 'syncing' | 'ok' | 'error'; at: number | null }

let status: CloudStatus = { state: 'off', at: null }
const subs = new Set<() => void>()
function setStatus(next: CloudStatus): void {
  status = next
  subs.forEach((f) => f())
}

/** Trạng thái đồng bộ tiến độ (cho menu tài khoản). */
export function useCloudStatus(): CloudStatus {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => status,
  )
}

/** Gắn một lần ở App: đồng bộ tiến độ game với tài khoản Google; không ghi đè dữ liệu của game đang mở (`openIds`). */
export function useCloudSync(openIds: ReadonlySet<string>): void {
  const { api, user } = useServer()
  // Khách không đồng bộ; liên kết Google xong (cùng id, isGuest đổi) thì bắt đầu đẩy tiến độ trên máy lên.
  const uid = user && !user.isGuest ? user.id : undefined
  const guest = Boolean(user?.isGuest)
  const open = useRef(openIds)
  open.current = openIds
  const kick = useRef<() => void>(() => {})

  useEffect(() => {
    if (!api || !uid) {
      setStatus({ state: api && guest ? 'guest' : 'off', at: null })
      return
    }
    let alive = true
    let busy = false
    let again = false
    let timer = 0

    const run = async () => {
      if (!alive) return
      if (busy) {
        again = true
        return
      }
      busy = true
      setStatus({ state: 'syncing', at: status.at })
      try {
        await syncOnce({
          api,
          userId: uid,
          storage: localStorage,
          skip: (key) => {
            const g = gameOfKey(key)
            return g !== null && open.current.has(g)
          },
        })
        if (alive) setStatus({ state: 'ok', at: Date.now() })
      } catch {
        if (alive) setStatus({ state: 'error', at: status.at })
      } finally {
        busy = false
        if (again && alive) {
          again = false
          void run()
        }
      }
    }
    const soon = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => void run(), DEBOUNCE_MS)
    }
    kick.current = soon

    void run()
    const iv = window.setInterval(() => void run(), INTERVAL_MS)
    const onStorage = (e: StorageEvent) => {
      if (e.key && isSyncKey(e.key)) soon()
    }
    const onVisibility = () => void run()
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      alive = false
      kick.current = () => {}
      clearTimeout(timer)
      clearInterval(iv)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [api, uid, guest])

  // Đóng / đổi game: đẩy tiến độ vừa chơi và kéo phần đã hoãn của game đó.
  const openKey = [...openIds].sort().join(',')
  useEffect(() => {
    kick.current()
  }, [openKey])
}
