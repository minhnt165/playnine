import { useEffect, useState } from 'react'
import { useServer } from '../server/ServerProvider'
import type { PointsSummary } from '../server/types'

/** Điểm và hạng điểm của một người chơi; null khi đang tải, lỗi hoặc không có server (nơi hiển thị tự ẩn). */
export function usePoints(userId: string | null): PointsSummary | null {
  const { api } = useServer()
  const [loaded, setLoaded] = useState<{ id: string; points: PointsSummary } | null>(null)
  useEffect(() => {
    if (!api || !userId) return
    let alive = true
    api.playerPoints(userId).then(
      (points) => alive && setLoaded({ id: userId, points }),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [api, userId])
  return loaded && loaded.id === userId ? loaded.points : null
}
