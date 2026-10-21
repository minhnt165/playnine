import type { Lang, TFn } from '../i18n/types'
import type { Collection, EventPhase, GameEvent, GameMeta, Text } from '../server/types'

/** Pha của sự kiện theo giờ `now` (ms); cùng quy tắc với `_event_phase` trong SQL. */
export function eventPhase(e: GameEvent, now: number): EventPhase {
  if (e.status === 'cancelled') return 'cancelled'
  if (e.status === 'closed' || now >= Date.parse(e.endsAt)) return 'ended'
  if (now >= Date.parse(e.startsAt)) return 'live'
  return 'upcoming'
}

const byEnd = (a: GameEvent, b: GameEvent) => Date.parse(a.endsAt) - Date.parse(b.endsAt)

/** Sự kiện đang diễn ra (của `gameId` nếu có), sắp xếp sự kiện sắp kết thúc lên trước. */
export function liveEventsFor(events: GameEvent[], gameId: string | null, now: number): GameEvent[] {
  return events
    .filter((e) => eventPhase(e, now) === 'live' && (gameId === null || e.gameId === gameId))
    .sort(byEnd)
}

/** Chia theo pha để hiện danh sách; sự kiện đã hủy bị bỏ. */
export function groupEvents(
  events: GameEvent[],
  now: number,
): { live: GameEvent[]; upcoming: GameEvent[]; ended: GameEvent[] } {
  const pick = (p: EventPhase) => events.filter((e) => eventPhase(e, now) === p)
  return {
    live: pick('live').sort(byEnd),
    upcoming: pick('upcoming').sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    ended: pick('ended').sort((a, b) => byEnd(b, a)),
  }
}

/** Game bị admin ẩn khỏi trang chủ; chưa có metadata thì coi như không ẩn. */
export function isHidden(games: Record<string, GameMeta>, id: string): boolean {
  return games[id]?.hidden === true
}

/** Bộ sưu tập đang hiệu lực, chỉ giữ game nhìn thấy được; bỏ bộ rỗng. */
export function activeCollections(list: Collection[], now: number, visibleIds: Set<string>): Collection[] {
  return list
    .filter((c) => Date.parse(c.startsAt) <= now && (c.endsAt === null || now < Date.parse(c.endsAt)))
    .map((c) => ({ ...c, gameIds: c.gameIds.filter((id) => visibleIds.has(id)) }))
    .filter((c) => c.gameIds.length > 0)
    .sort((a, b) => a.sort - b.sort || (a.title.en < b.title.en ? -1 : a.title.en > b.title.en ? 1 : 0))
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Đếm ngược: dưới 1 ngày là hh:mm:ss, từ 1 ngày là chuỗi `ev.daysLeft`. */
export function formatCountdown(ms: number, t: TFn): string {
  if (ms <= 0) return '00:00:00'
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const hms = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
  return d > 0 ? t('ev.daysLeft', { d, hms }) : hms
}

/** Chữ theo ngôn ngữ; rỗng (sau khi cắt khoảng trắng) thì lấy tiếng Anh. */
export function localized(x: Partial<Text>, lang: Lang): string {
  return x[lang]?.trim() || x.en?.trim() || ''
}
