import { useEffect, useState } from 'react'
import { useServer } from '../server/ServerProvider'

/**
 * Tổng lượt chơi mỗi game, tải khi có server và tải lại khi `refreshKey` đổi (chơi xong quay về trang
 * chủ: trang không bị gỡ nên phải đọc lại); lỗi hoặc không có server thì giữ số cũ (ban đầu rỗng).
 */
export function usePlayTotals(refreshKey = 0): Record<string, number> {
  const { api } = useServer()
  const [totals, setTotals] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!api) return
    let alive = true
    api.playTotals().then(
      (v) => alive && setTotals(v),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [api, refreshKey])
  return totals
}
