// SDK cho game: báo ván bắt đầu/kết thúc cho cổng qua postMessage. Không bao giờ ném lỗi;
// không có cổng (mở trực tiếp, không iframe, hết thời gian chờ) thì chạy độc lập.
import { PROTOCOL_VERSION, type GameResult, type GameToPortal } from './protocol'
import { createFx, createSfx, type FxApi, type SfxApi } from './sfx'

export { SOUND_KEY, type SfxName, type SfxOptions } from './sfx'

export type PlayNineApi = {
  init(o: { gameId: string }): void
  gameStart(o: { mode: string; resume?: boolean }): void
  gameEnd(o: { mode: string } & GameResult): void
  isConnected(): boolean
  /** Âm thanh dùng chung (tự im khi người chơi tắt tiếng ở cổng). */
  sfx: SfxApi
  /** Hiệu ứng dùng chung (pháo giấy khi thắng). */
  fx: FxApi
}

const MAX_QUEUE = 20

export function createPlayNine(env: { win: Window; parent: Window | null; timeoutMs?: number }): PlayNineApi {
  const { win } = env
  const parent = env.parent && env.parent !== win ? env.parent : null
  const timeoutMs = env.timeoutMs ?? 1500

  type State = 'idle' | 'pending' | 'connected' | 'standalone'
  let state: State = parent ? 'idle' : 'standalone'
  let gameId = ''
  let queue: GameToPortal[] = []
  let open: string | null = null // mode của ván đang mở
  let timer: ReturnType<typeof setTimeout> | undefined

  function post(msg: GameToPortal) {
    try {
      parent?.postMessage(msg, win.location.origin)
    } catch {
      /* bỏ qua */
    }
  }

  function onMessage(e: MessageEvent) {
    try {
      if (state !== 'pending') return
      if (e.source !== parent || e.origin !== win.location.origin) return
      const d = e.data as { type?: unknown; v?: unknown } | null
      if (!d || d.type !== 'pn:ready' || d.v !== PROTOCOL_VERSION) return
      clearTimeout(timer)
      win.removeEventListener('message', onMessage)
      state = 'connected'
      const q = queue
      queue = []
      for (const m of q) post(m)
    } catch {
      /* bỏ qua */
    }
  }

  function send(msg: GameToPortal) {
    if (state === 'connected') post(msg)
    else if (state === 'pending' && queue.length < MAX_QUEUE) queue.push(msg)
  }

  return {
    init(o) {
      try {
        if (state !== 'idle' || !o || typeof o.gameId !== 'string' || !o.gameId) return
        gameId = o.gameId
        state = 'pending'
        win.addEventListener('message', onMessage)
        timer = setTimeout(() => {
          try {
            win.removeEventListener('message', onMessage)
            state = 'standalone'
            queue = []
          } catch {
            /* bỏ qua */
          }
        }, timeoutMs)
        post({ type: 'pn:hello', v: 1, gameId })
      } catch {
        /* bỏ qua */
      }
    },
    gameStart(o) {
      try {
        if ((state !== 'pending' && state !== 'connected') || !o || typeof o.mode !== 'string' || !o.mode) return
        open = o.mode
        send({ type: 'pn:start', v: 1, gameId, mode: o.mode, resume: o.resume === true })
      } catch {
        /* bỏ qua */
      }
    },
    gameEnd(o) {
      try {
        if ((state !== 'pending' && state !== 'connected') || !o || open === null || o.mode !== open) return
        open = null
        const { mode, won, score, timeMs, assisted } = o
        const msg: GameToPortal = { type: 'pn:end', v: 1, gameId, mode, won }
        if (score !== undefined) msg.score = score
        if (timeMs !== undefined) msg.timeMs = timeMs
        if (assisted !== undefined) msg.assisted = assisted
        send(msg)
      } catch {
        /* bỏ qua */
      }
    },
    isConnected: () => state === 'connected',
    sfx: createSfx({ win }),
    fx: createFx({ win }),
  }
}

export const PlayNine: PlayNineApi =
  typeof window !== 'undefined'
    ? createPlayNine({ win: window, parent: window.parent === window ? null : window.parent })
    : createPlayNine({ win: undefined as unknown as Window, parent: null })