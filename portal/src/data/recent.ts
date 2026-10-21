import { readJSON, write } from '../lib/storage'

const RECENT_KEY = 'game-portal-recent-v1'

export function recent(): Record<string, number> {
  const r = readJSON<unknown>(RECENT_KEY)
  return r && typeof r === 'object' ? (r as Record<string, number>) : {}
}

export function markPlayed(id: string, now: number = Date.now()): void {
  const r = recent()
  r[id] = now
  write(RECENT_KEY, JSON.stringify(r))
}