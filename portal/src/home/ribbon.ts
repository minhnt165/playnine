import type { TFn } from '../i18n/types'
import type { GameDef } from '../games/catalog'
import { isNewGame } from '../games/manifest'
import { fmtAgo } from '../lib/time'

/** Game chơi gần nhất theo bản ghi `recent` (id có mốc thời gian lớn nhất). */
export function lastPlayedId(rec: Record<string, number>): string | undefined {
  return Object.keys(rec).sort((a, b) => rec[b] - rec[a])[0]
}

/** Ruy băng góc thẻ: [bản đầy đủ, bản ngắn cho thẻ hẹp trên điện thoại] hoặc null. */
export function ribbonFor(
  g: GameDef,
  ctx: {
    openIds: Set<string>
    lastId?: string
    rec: Record<string, number>
    t: TFn
    now?: number
    /** Nhóm game mới nhất (newestIds); có thì chỉ game trong nhóm này mới mang nhãn "Mới". */
    newIds?: Set<string>
  },
): [string, string] | null {
  const { openIds, lastId, rec, t, now, newIds } = ctx
  if (openIds.has(g.id)) return [t('ribbon.open'), t('ribbon.openShort')]
  if (g.id === lastId) return [t('ribbon.last', { ago: fmtAgo(rec[g.id], t, now) }), t('ribbon.lastShort')]
  if (isNewGame(g, now ?? Date.now()) && (!newIds || newIds.has(g.id)) && !rec[g.id]) return [t('ribbon.new'), t('ribbon.new')]
  return null
}