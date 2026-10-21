const KEY = 'playnine-return-hash'

/** Trước khi chuyển sang Google: nhớ trang hiện tại (đăng nhập xong cổng quay về #/play/...). */
export function rememberReturnHash(): void {
  try {
    if (location.hash) sessionStorage.setItem(KEY, location.hash)
  } catch {
    /* sessionStorage bị chặn: bỏ qua */
  }
}

/** Sau khi đăng nhập xong: nếu đang ở trang chủ (hash rỗng) và có hash đã nhớ thì quay lại đó. */
export function restoreReturnHash(): void {
  try {
    const h = sessionStorage.getItem(KEY)
    if (h === null) return
    sessionStorage.removeItem(KEY)
    if (!location.hash) location.replace(h)
  } catch {
    /* bỏ qua */
  }
}