import { useEffect, useState } from 'react'
import { useServer } from '../server/ServerProvider'
import type { RatingSummary } from '../server/types'

/** Đánh giá trung bình của mọi game, tải một lần khi có server; lỗi hoặc không có server thì rỗng. */
export function useRatingSummary(): Record<string, RatingSummary> {
  const { api } = useServer()
  const [summary, setSummary] = useState<Record<string, RatingSummary>>({})
  useEffect(() => {
    if (!api) return
    let alive = true
    api.ratingSummary().then(
      (v) => alive && setSummary(v),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [api])
  return summary
}
