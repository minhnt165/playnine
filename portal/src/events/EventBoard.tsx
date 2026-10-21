import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { formatValue } from '../player/leaderboardModel'
import { eventHref } from '../player/route'
import { useServer } from '../server/ServerProvider'
import type { GameEvent, LeaderRow } from '../server/types'
import { formatCountdown } from './model'
import { useNow } from './useNow'

type Loaded = { id: string; rows: LeaderRow[]; error: boolean }

type Props = {
  event: GameEvent
  limit?: number
  /** Báo danh sách hàng đã tải cho trang cha (vd. mục nhận huy hiệu). */
  onRows?: (rows: LeaderRow[]) => void
}

/** Bảng xếp hạng của một sự kiện, cùng kiểu với bảng xếp hạng game. */
export function EventBoard({ event, limit = 50, onRows }: Props) {
  const { api, user, games } = useServer()
  const { t, fmtNumber } = useI18n()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const metric = games[event.gameId]?.metric ?? 'score_high'
  const userId = user?.id ?? null

  useEffect(() => {
    if (!api) return
    let alive = true
    api.eventLeaderboard(event.id, limit).then(
      (rows) => {
        if (!alive) return
        setLoaded({ id: event.id, rows, error: false })
        onRows?.(rows)
      },
      () => alive && setLoaded({ id: event.id, rows: [], error: true }),
    )
    return () => {
      alive = false
    }
    // onRows do trang cha truyền xuống có thể đổi mỗi lần vẽ; chỉ tải lại khi đổi sự kiện.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, event.id, limit])

  const data = loaded && loaded.id === event.id ? loaded : null
  if (!data) return null
  if (data.error) {
    return (
      <p className="lb-note lb-error" role="alert">
        {t('lb.error')}
      </p>
    )
  }
  if (data.rows.length === 0) return <p className="lb-note">{t('lb.empty')}</p>
  return (
    <ol className="lb-list">
      {data.rows.map((r) => {
        const me = r.userId === userId
        return (
          <li key={r.userId} className={me ? 'me' : undefined}>
            <span className="lb-rank">{r.rank}</span>
            <span className="lb-name">
              <a href={`#/u/${encodeURIComponent(r.userId)}`}>{r.displayName}</a>
              {me && <em className="lb-you">{t('lb.you')}</em>}
            </span>
            <span className="lb-value">{formatValue(metric, r.value, fmtNumber)}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Nội dung tab "Sự kiện" trên bảng xếp hạng: đếm ngược, bảng sự kiện và link chi tiết. */
export function EventPanel({ event, limit }: { event: GameEvent; limit?: number }) {
  const { t } = useI18n()
  const now = useNow()
  return (
    <div className="ev-panel">
      <p className="ev-count">{t('ev.endsIn', { time: formatCountdown(Date.parse(event.endsAt) - now, t) })}</p>
      <EventBoard event={event} limit={limit} />
      <a className="ev-details" href={eventHref(event.id)}>
        {t('ev.details')}
      </a>
    </div>
  )
}
