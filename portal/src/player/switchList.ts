/** Số icon tối đa trên thanh đổi game khi đang chơi; các game khác mở qua menu (có ô tìm, nhóm theo thể loại). */
export const SWITCH_MAX = 8

/**
 * Game hiện trên thanh đổi game: game đang chơi, game chơi gần đây (mới trước), game yêu thích,
 * rồi lấp cho đủ theo thứ tự danh mục. Chỉ giữ id có trong `all`, không trùng.
 */
export function switchList<G extends { id: string }>(
  all: G[],
  currentId: string | null,
  rec: Record<string, number>,
  favIds: string[],
  max = SWITCH_MAX,
): G[] {
  const byId = new Map(all.map((g) => [g.id, g]))
  const recentIds = Object.keys(rec).sort((a, b) => rec[b] - rec[a])
  const out = new Map<string, G>()
  for (const id of [...(currentId ? [currentId] : []), ...recentIds, ...favIds, ...byId.keys()]) {
    if (out.size >= max) break
    const g = byId.get(id)
    if (g && !out.has(id)) out.set(id, g)
  }
  return [...out.values()]
}
