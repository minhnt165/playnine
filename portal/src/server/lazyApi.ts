import type { ServerApi } from './api'

/**
 * ServerApi nạp lười: chỉ gọi `load` (import động supabase-js, khá nặng) ở lời gọi đầu tiên,
 * để bundle trang chủ không phải chở thư viện server. Mọi hàm đều async nên chỉ cần chờ nạp rồi gọi tiếp;
 * riêng onAuthChange trả hàm hủy ngay và đăng ký khi nạp xong.
 */
export function lazyApi(load: () => Promise<ServerApi>): ServerApi {
  let loading: Promise<ServerApi> | null = null
  const real = () => (loading ??= load())

  const onAuthChange: ServerApi['onAuthChange'] = (cb) => {
    let off: (() => void) | null = null
    let cancelled = false
    real().then(
      (api) => {
        if (!cancelled) off = api.onAuthChange(cb)
      },
      () => {},
    )
    return () => {
      cancelled = true
      off?.()
    }
  }

  return new Proxy({} as ServerApi, {
    get(_, name) {
      if (name === 'onAuthChange') return onAuthChange
      // Không phải thenable: `await api` hay Promise.resolve(api) trả lại chính nó.
      if (typeof name !== 'string' || name === 'then') return undefined
      return (...args: unknown[]) =>
        real().then((api) => (api[name as keyof ServerApi] as (...a: unknown[]) => Promise<unknown>)(...args))
    },
  })
}
