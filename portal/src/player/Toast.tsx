import { useEffect, useState } from 'react'

export type Notice = { id: number; text: string }

const HIDE_MS = 4000

/** Vùng thông báo; luôn có trong DOM để trình đọc màn hình đọc được nội dung mới, tự ẩn sau 4 giây. */
export function Toast({ notice }: { notice: Notice | null }) {
  const [shown, setShown] = useState<Notice | null>(null)
  useEffect(() => {
    setShown(notice)
    if (!notice) return
    const timer = setTimeout(() => setShown(null), HIDE_MS)
    return () => clearTimeout(timer)
  }, [notice])
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {shown && <div className="toast">{shown.text}</div>}
    </div>
  )
}