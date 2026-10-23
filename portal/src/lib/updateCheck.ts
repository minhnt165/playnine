// Phát hiện server đã deploy bản mới: so commit trong version.json (vite/version-file.ts) với commit gắn lúc build.
// App cài trên màn hình chính không tự tải lại khi mở, nên không có bước này nó cứ chạy bản cũ mãi.
import { useEffect, useState } from 'react'
import { BUILD_INFO } from './buildInfo'

const VERSION_URL = import.meta.env.BASE_URL + 'version.json'
/** Không hỏi server dày hơn mức này dù app bị ẩn/hiện liên tục. */
const MIN_GAP_MS = 60_000

/** Commit đang có trên server; null khi offline, lỗi HTTP hoặc JSON không đúng dạng. */
export async function fetchRemoteCommit(fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchFn(VERSION_URL, { cache: 'no-store' })
    if (!res.ok) return null
    const body: unknown = await res.json()
    const commit = (body as { commit?: unknown } | null)?.commit
    return typeof commit === 'string' ? commit : null
  } catch {
    return null
  }
}

/** Bản chạy local (commit "dev") không bao giờ báo, vì nó không ứng với commit nào trên server. */
export function hasNewBuild(remote: string | null, current: string): boolean {
  return current !== 'dev' && remote !== null && remote !== current
}

/** true khi server có bản mới hơn `current`; kiểm tra lúc mount và mỗi lần app hiện trở lại. */
export function useUpdateAvailable(current: string = BUILD_INFO.commit): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (current === 'dev') return
    let last = 0
    let alive = true
    const check = async () => {
      const now = Date.now()
      if (now - last < MIN_GAP_MS) return
      last = now
      const remote = await fetchRemoteCommit()
      if (alive && hasNewBuild(remote, current)) setAvailable(true)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    void check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [current])
  return available
}
