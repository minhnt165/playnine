import { useEffect, useState } from 'react'
import { useServer } from '../server/ServerProvider'

/** Tổng lượt chơi mỗi game, tải một lần khi có server; lỗi hoặc không có server thì rỗng. */
export function usePlayTotals(): Record<string, number> {
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
  }, [api])
  return totals
}
