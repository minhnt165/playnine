/** Loại lỗi đăng nhập / liên kết Google để báo cho người chơi bằng câu dễ hiểu. */
export type AuthErrorKind = 'linkDisabled' | 'alreadyLinked' | 'failed'

/** Phân loại theo mã hoặc thông điệp lỗi của Supabase Auth. */
export function authErrorKind(text: string): AuthErrorKind {
  if (/manual[ _]linking[ _](is[ _])?disabled/i.test(text)) return 'linkDisabled'
  if (/identity_already_exists|identity is already linked|already linked to another user/i.test(text)) return 'alreadyLinked'
  return 'failed'
}

/**
 * Quay về từ Google mà Supabase báo lỗi (?error=…&error_code=…&error_description=…): trả loại lỗi và xóa các tham số đó
 * khỏi URL (giữ hash của trang). Không có lỗi thì trả null và không đụng URL (để supabase-js còn đọc ?code=).
 */
export function takeUrlAuthError(): AuthErrorKind | null {
  const params = new URLSearchParams(location.search)
  if (!params.has('error') && !params.has('error_code')) return null
  const kind = authErrorKind([params.get('error_code'), params.get('error_description'), params.get('error')].join(' '))
  for (const k of ['error', 'error_code', 'error_description']) params.delete(k)
  const rest = params.toString()
  history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash)
  return kind
}
