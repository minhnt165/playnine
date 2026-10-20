import { useEffect, useRef } from 'react'

// Đã có lần vẽ trước trong phiên này (kể cả khi Home bị gỡ rồi gắn lại sau khi chơi game).
let everRendered = false

/**
 * Lần vẽ đầu chạy hiệu ứng xuất hiện; từ lần vẽ thứ hai (đổi `key`, hoặc gắn lại) thêm body.revealed
 * để không chạy lại. So sánh theo `key` nên không bị StrictMode (chạy effect hai lần) đánh lừa.
 */
export function useReveal(key: string): void {
  const prev = useRef<string | null>(null)
  useEffect(() => {
    if ((prev.current !== null && prev.current !== key) || (prev.current === null && everRendered)) {
      document.body.classList.add('revealed')
    }
    prev.current = key
    everRendered = true
  }, [key])
}