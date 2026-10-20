import type { GameDef } from '../games/catalog'

/**
 * Danh sách game đang giữ iframe sau khi chuyển từ `prev` sang `next`:
 * bỏ `prev` nếu đổi game mà `prev` không keepAlive; thêm `next` nếu chưa có.
 */
export function nextFrameIds(held: string[], prev: GameDef | null, next: GameDef | null): string[] {
  let ids = held
  if (prev && prev !== next && !prev.keepAlive) ids = ids.filter((id) => id !== prev.id)
  if (next && !ids.includes(next.id)) ids = [...ids, next.id]
  return ids
}
