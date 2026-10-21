import { defaultLocal, safeStore } from '../lib/safeStorage'
import type { ServerApi } from './api'
import type { AuthUser, FinishResult, RunResult } from './types'

export type RunStatus =
  | { kind: 'idle' }
  | { kind: 'scored' }
  | { kind: 'unscored'; why: 'guest' | 'no_resume' | 'error' | 'no_server' }

export type EndOutcome =
  | { kind: 'saved'; result: FinishResult }
  | { kind: 'rejected'; result: FinishResult }
  | { kind: 'skipped' }
  | { kind: 'error' }

export type RunManager = {
  start(gameId: string, mode: string, resume: boolean): Promise<RunStatus>
  end(gameId: string, mode: string, r: RunResult): Promise<EndOutcome>
}

type StoredRun = { runId: string; mode: string; userId: string; startedAt: number }

const MAX_AGE_MS = 24 * 60 * 60 * 1000
const keyOf = (gameId: string) => `playnine-run-${gameId}`

export function createRunManager(deps: {
  api: ServerApi | null
  getUser(): AuthUser | null
  storage?: Storage
  now?: () => number
}): RunManager {
  const store = safeStore(deps.storage ?? defaultLocal())
  const now = deps.now ?? Date.now

  // Đọc ván đã lưu; dữ liệu hỏng hoặc quá 24h coi như không có.
  const read = (gameId: string): StoredRun | null => {
    const raw = store.get(keyOf(gameId))
    if (!raw) return null
    try {
      const v = JSON.parse(raw) as Partial<StoredRun> | null
      if (
        v && typeof v.runId === 'string' && typeof v.mode === 'string' &&
        typeof v.userId === 'string' && typeof v.startedAt === 'number' &&
        now() - v.startedAt < MAX_AGE_MS
      ) {
        return v as StoredRun
      }
    } catch {
      /* rơi xuống null */
    }
    return null
  }

  return {
    async start(gameId, mode, resume) {
      const { api } = deps
      if (!api) return { kind: 'unscored', why: 'no_server' }
      const user = deps.getUser()
      if (!user) {
        store.remove(keyOf(gameId))
        return { kind: 'unscored', why: 'guest' }
      }
      if (resume) {
        const s = read(gameId)
        return s && s.mode === mode && s.userId === user.id
          ? { kind: 'scored' }
          : { kind: 'unscored', why: 'no_resume' }
      }
      store.remove(keyOf(gameId)) // ván mới ghi đè ván cũ
      try {
        const runId = await api.startRun(gameId, mode)
        const stored: StoredRun = { runId, mode, userId: user.id, startedAt: now() }
        store.set(keyOf(gameId), JSON.stringify(stored))
        return { kind: 'scored' }
      } catch {
        return { kind: 'unscored', why: 'error' }
      }
    },

    async end(gameId, mode, r) {
      const { api } = deps
      const user = deps.getUser()
      const s = read(gameId)
      if (!api || !user || !s || s.mode !== mode || s.userId !== user.id) return { kind: 'skipped' }
      // Xóa khóa trước khi gọi mạng để kết thúc hai lần không gửi hai lần.
      store.remove(keyOf(gameId))
      try {
        const result = await api.finishRun(s.runId, r)
        return result.status === 'rejected' ? { kind: 'rejected', result } : { kind: 'saved', result }
      } catch {
        store.set(keyOf(gameId), JSON.stringify(s)) // giữ lại để tải lại trang vẫn kết thúc được
        return { kind: 'error' }
      }
    },
  }
}