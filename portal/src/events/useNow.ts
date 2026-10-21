import { useEffect, useState } from 'react'

/** Giá trị Date.now() cập nhật theo chu kỳ; dừng khi unmount. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
