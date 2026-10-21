// Mọi thao tác localStorage đều bọc try/catch: lỗi = coi như không có dữ liệu.
export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function readJSON<T = unknown>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') as T | null
  } catch {
    return null
  }
}

export function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* bỏ qua: chế độ riêng tư hoặc hết dung lượng */
  }
}