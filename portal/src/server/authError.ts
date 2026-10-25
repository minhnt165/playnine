/** Loại lỗi đăng nhập / liên kết Google để báo cho người chơi bằng câu dễ hiểu. */
export type AuthErrorKind = 'linkDisabled' | 'alreadyLinked' | 'linkFailed' | 'failed'

/** Lỗi để hiện: câu dễ hiểu theo loại, kèm chi tiết gốc của server để biết chuyện gì đã xảy ra. */
export interface AuthError {
  kind: AuthErrorKind
  detail: string
}

const LINKING_KEY = 'playnine-linking'

/** Phân loại theo mã hoặc thông điệp lỗi của Supabase Auth. Đang liên kết thì lỗi lạ là "liên kết thất bại". */
export function authErrorKind(text: string, linking = false): AuthErrorKind {
  if (/manual[ _]linking[ _](is[ _])?disabled/i.test(text)) return 'linkDisabled'
  if (/identity_already_exists|identity is already linked|already linked to another user/i.test(text)) return 'alreadyLinked'
  return linking ? 'linkFailed' : 'failed'
}

/** Lỗi từ một lời gọi api ("linkGoogle: <thông điệp>"): bỏ tên hàm ở đầu, chỉ giữ thông điệp của server. */
export function authError(text: string, linking = false): AuthError {
  return { kind: authErrorKind(text, linking), detail: text.replace(/^\w+: /, '').trim() }
}

/** Trước khi chuyển sang Google để liên kết: nhớ lại để lỗi khi quay về được báo là liên kết thất bại. */
export function markLinking(): void {
  try {
    sessionStorage.setItem(LINKING_KEY, '1')
  } catch {
    /* sessionStorage bị chặn: lỗi sẽ được báo như lỗi đăng nhập */
  }
}

/** Đọc rồi xóa dấu đang liên kết: chỉ dùng cho một lần báo lỗi / quay về. */
export function takeLinking(): boolean {
  try {
    const on = sessionStorage.getItem(LINKING_KEY) !== null
    sessionStorage.removeItem(LINKING_KEY)
    return on
  } catch {
    return false
  }
}

/**
 * Quay về từ Google mà Supabase báo lỗi (?error=…&error_code=…&error_description=…): trả lỗi và xóa các tham số đó
 * khỏi URL (giữ hash của trang). Không có lỗi thì trả null và không đụng URL (để supabase-js còn đọc ?code=).
 */
export function takeUrlAuthError(): AuthError | null {
  const linking = takeLinking()
  const params = new URLSearchParams(location.search)
  if (!params.has('error') && !params.has('error_code')) return null
  const code = params.get('error_code') || params.get('error') || ''
  const description = params.get('error_description') || ''
  const kind = authErrorKind([code, description, params.get('error')].join(' '), linking)
  const detail = description && code ? `${description} (${code})` : description || code
  for (const k of ['error', 'error_code', 'error_description']) params.delete(k)
  const rest = params.toString()
  history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash)
  return { kind, detail }
}
