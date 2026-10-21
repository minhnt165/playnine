import { defaultSession, safeStore } from '../lib/safeStorage'
import type { ServerApi } from './api'

const WINDOW_MS = 30 * 60 * 1000

/** Mỗi game tối đa một lần ghi lượt chơi mỗi 30 phút mỗi tab; lỗi nuốt im, không chặn game. */
export function recordPlayThrottled(
  api: ServerApi | null,
  gameId: string,
  deps: { storage?: Storage; now?: () => number } = {},
): void {
  if (!api) return
  const store = safeStore(deps.storage ?? defaultSession())
  const now = (deps.now ?? Date.now)()
  const key = `playnine-play-${gameId}`
  const last = Number(store.get(key))
  if (Number.isFinite(last) && last > 0 && now - last < WINDOW_MS && now >= last) return
  store.set(key, String(now))
  try {
    api.recordPlay(gameId).catch(() => {})
  } catch {
    /* bỏ qua */
  }
}