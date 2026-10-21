// Giao thức postMessage giữa game (iframe) và cổng. Định nghĩa một lần ở đây.
export const PROTOCOL_VERSION = 1

export type GameResult = { score?: number; timeMs?: number; won: boolean; assisted?: boolean }

export type GameToPortal =
  | { type: 'pn:hello'; v: 1; gameId: string }
  | { type: 'pn:start'; v: 1; gameId: string; mode: string; resume: boolean }
  | ({ type: 'pn:end'; v: 1; gameId: string; mode: string } & GameResult)

export type PortalToGame = { type: 'pn:ready'; v: 1 }

const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0
const isOptNum = (x: unknown) => x === undefined || (typeof x === 'number' && Number.isFinite(x) && x >= 0)

/** Kiểm tra chặt tin nhắn từ game; dữ liệu lạ trả false. */
export function isGameToPortal(x: unknown): x is GameToPortal {
  if (typeof x !== 'object' || x === null) return false
  const m = x as Record<string, unknown>
  if (m.v !== PROTOCOL_VERSION || !isStr(m.gameId)) return false
  switch (m.type) {
    case 'pn:hello':
      return true
    case 'pn:start':
      return isStr(m.mode) && typeof m.resume === 'boolean'
    case 'pn:end':
      return (
        isStr(m.mode) &&
        typeof m.won === 'boolean' &&
        isOptNum(m.score) &&
        isOptNum(m.timeMs) &&
        (m.assisted === undefined || typeof m.assisted === 'boolean')
      )
    default:
      return false
  }
}