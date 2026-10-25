import { defaultSession, safeStore, type SafeStore } from './safeStorage'

const KEY = 'playnine-chunk-reload'

/**
 * Import động một trang phụ. Sau một lần deploy, tab đang mở (hoặc index.html còn trong cache) vẫn trỏ tới file JS
 * của bản cũ đã bị xóa: lần lỗi đầu thì tải lại trang để lấy bản mới; đã tải lại mà vẫn lỗi thì ném lỗi như thường.
 */
export function loadOrReload<T>(
  load: () => Promise<T>,
  { store = safeStore(defaultSession()), reload = () => location.reload() }: { store?: SafeStore; reload?: () => void } = {},
): Promise<T> {
  return load().then(
    (v) => {
      store.remove(KEY)
      return v
    },
    (err: unknown) => {
      if (store.get(KEY)) throw err
      store.set(KEY, '1')
      reload()
      // Trang sắp tải lại: giữ trạng thái chờ thay vì hiện lỗi.
      return new Promise<T>(() => {})
    },
  )
}
