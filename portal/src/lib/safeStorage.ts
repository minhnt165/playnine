// Truy cập Storage được truyền vào (sessionStorage/localStorage) mà không bao giờ ném lỗi.
export type SafeStore = {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export function safeStore(storage?: Storage): SafeStore {
  const s = (): Storage | null => {
    try {
      return storage ?? null
    } catch {
      return null
    }
  }
  return {
    get(key) {
      try {
        return s()?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    set(key, value) {
      try {
        s()?.setItem(key, value)
      } catch {
        /* bỏ qua: chế độ riêng tư hoặc hết dung lượng */
      }
    },
    remove(key) {
      try {
        s()?.removeItem(key)
      } catch {
        /* bỏ qua */
      }
    },
  }
}

export function defaultLocal(): Storage | undefined {
  try {
    return localStorage
  } catch {
    return undefined
  }
}

export function defaultSession(): Storage | undefined {
  try {
    return sessionStorage
  } catch {
    return undefined
  }
}