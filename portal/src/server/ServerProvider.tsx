import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ServerApi } from './api'
import { restoreReturnHash } from './returnHash'
import { lazyApi } from './lazyApi'
import { loadOrReload } from '../lib/chunkReload'
import type { AuthUser, GameMeta } from './types'

export type ServerCtx = {
  api: ServerApi | null
  user: AuthUser | null
  authReady: boolean
  games: Record<string, GameMeta>
  refreshUser(): Promise<void>
  /** Tải lại metadata game (sau khi admin sửa luật hoặc ẩn/hiện game). */
  refreshGames(): Promise<void>
}

const NO_SERVER: ServerCtx = { api: null, user: null, authReady: true, games: {}, refreshUser: async () => {}, refreshGames: async () => {} }
const ServerContext = createContext<ServerCtx>(NO_SERVER)

/** Không có biến môi trường thì không có server: cổng chạy y như giai đoạn 1. */
function defaultApi(): ServerApi | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  // supabase-js chỉ được tải khi cổng gọi server lần đầu (ngay sau lần vẽ đầu), không nằm trong bundle chính.
  return url && key ? lazyApi(() => loadOrReload(() => import('./supabaseApi')).then((m) => m.createSupabaseApi(url, key))) : null
}

let sharedApi: ServerApi | null | undefined
const getDefaultApi = () => (sharedApi === undefined ? (sharedApi = defaultApi()) : sharedApi)

type Props = {
  api?: ServerApi | null
  /** Chưa đăng nhập thì tự tạo tài khoản khách (bản chạy thật bật; test mặc định tắt). */
  autoGuest?: boolean
  children: ReactNode
}

export function ServerProvider({ api: apiProp, autoGuest = false, children }: Props) {
  const api = apiProp === undefined ? getDefaultApi() : apiProp
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(!api)
  const [games, setGames] = useState<Record<string, GameMeta>>({})

  useEffect(() => {
    if (!api) return
    let alive = true
    api.currentUser().then(
      (u) => alive && setUser(u),
      () => alive && setUser(null),
    ).finally(() => alive && setAuthReady(true))
    const off = api.onAuthChange((u) => alive && setUser(u))
    api.gameMeta().then(
      (list) => alive && setGames(Object.fromEntries(list.map((g) => [g.id, g]))),
      () => alive && setGames({}),
    )
    return () => {
      alive = false
      off()
    }
  }, [api])

  // Không có phiên: vào thẳng với tư cách khách. Mỗi lần mất phiên chỉ thử một lần (lỗi thì còn nút đăng nhập);
  // bỏ qua khi đang quay về từ Google (?code=) để không tạo khách thừa.
  const guestTried = useRef(false)
  useEffect(() => {
    if (user) guestTried.current = false
    if (!autoGuest || !api || !authReady || user || guestTried.current || /[?&]code=/.test(location.search)) return
    guestTried.current = true
    api.signInAsGuest().catch(() => {})
  }, [autoGuest, api, authReady, user])

  // Đăng nhập xong (quay về từ Google): trở lại trang game đã nhớ.
  useEffect(() => {
    if (authReady && user) restoreReturnHash()
  }, [authReady, user])

  const refreshUser = useCallback(async () => {
    if (!api) return
    try {
      setUser(await api.currentUser())
    } catch {
      /* giữ nguyên user hiện tại */
    }
  }, [api])

  const refreshGames = useCallback(async () => {
    if (!api) return
    try {
      const list = await api.gameMeta()
      setGames(Object.fromEntries(list.map((g) => [g.id, g])))
    } catch {
      /* giữ nguyên danh sách hiện tại */
    }
  }, [api])

  const value = useMemo<ServerCtx>(
    () => (api ? { api, user, authReady, games, refreshUser, refreshGames } : NO_SERVER),
    [api, user, authReady, games, refreshUser, refreshGames],
  )
  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>
}

export function useServer(): ServerCtx {
  return useContext(ServerContext)
}
