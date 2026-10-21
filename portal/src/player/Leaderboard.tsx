import { useEffect, useId, useState } from 'react'
import { EventPanel } from '../events/EventBoard'
import { liveEventsFor } from '../events/model'
import { useNow } from '../events/useNow'
import { useI18n } from '../i18n/i18n'
import { Podium, PODIUM } from '../leaderboards/Podium'
import { useServer } from '../server/ServerProvider'
import type { GameEvent, GameMeta, LeaderRow, Period } from '../server/types'
import { perRunText, unitLabel } from './leaderboardModel'
import { Row } from './LeaderRow'

const TOP = 50
const PERIODS: Period[] = ['week', 'day', 'all']
const PERIOD_LABEL: Record<Period, string> = { day: 'lb.day', week: 'lb.week', all: 'lb.all' }

type Loaded = { key: string; rows: LeaderRow[]; mine: LeaderRow | null; error: boolean }

/** `podium`: top 3 lên bục như trang bảng xếp hạng (trang giới thiệu game giữ dạng danh sách). */
type Props = { gameId: string; refreshKey: number; podium?: boolean }

/** Bảng xếp hạng điểm của một game (không chia độ khó); chỉ render khi có server và game có trong metadata. */
export function Leaderboard({ gameId, refreshKey, podium = false }: Props) {
  const { api, games } = useServer()
  const meta = games[gameId]
  if (!api || !meta) return null
  return <Board key={gameId} meta={meta} refreshKey={refreshKey} podium={podium} />
}

function Board({ meta, refreshKey, podium }: { meta: GameMeta; refreshKey: number; podium: boolean }) {
  const { api, user } = useServer()
  const { t, fmtNumber } = useI18n()
  const gameId = meta.id
  const [period, setPeriod] = useState<Period>('week')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const titleId = useId()
  const [events, setEvents] = useState<GameEvent[]>([])
  const [showEvent, setShowEvent] = useState(false)
  const now = useNow(10000)

  // Sự kiện đang diễn ra của game (mode nào cũng được) hiện thành một tab riêng.
  const event = liveEventsFor(events, gameId, now)[0] ?? null
  const eventOn = showEvent && event !== null
  const userId = user?.id ?? null

  useEffect(() => {
    if (!api) return
    let alive = true
    const key = period
    ;(async () => {
      try {
        const rows = await api.gamePointsBoard(gameId, period, TOP)
        let mine: LeaderRow | null = null
        if (user && !rows.some((r) => r.userId === user.id)) {
          const r = await api.myGamePoints(gameId, period)
          if (r) mine = { rank: r.rank, userId: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, value: r.value, achievedAt: '' }
        }
        if (alive) setLoaded({ key, rows, mine, error: false })
      } catch {
        if (alive) setLoaded({ key, rows: [], mine: null, error: true })
      }
    })()
    return () => {
      alive = false
    }
    // user đổi theo userId; displayName đổi không cần tải lại bảng.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, gameId, period, refreshKey, userId])

  // Tải sự kiện một lần; lỗi thì coi như không có sự kiện, bảng điểm vẫn chạy.
  useEffect(() => {
    if (!api) return
    let alive = true
    api.events().then(
      (list) => alive && setEvents(list),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [api])

  const fmt = (v: number) => unitLabel(t, 'lbs.unit.points', v, fmtNumber)
  const data = loaded && loaded.key === period ? loaded : null
  return (
    <section className="lb-panel" aria-labelledby={titleId}>
      <div className="section-head">
        <h2 id={titleId}>{t('lb.title')}</h2>
        {perRunText(t, meta) && <span>{perRunText(t, meta)}</span>}
      </div>
      <div className="lb-tabs lb-periods" role="tablist">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={!eventOn && p === period}
            onClick={() => {
              setPeriod(p)
              setShowEvent(false)
            }}
          >
            {t(PERIOD_LABEL[p])}
          </button>
        ))}
        {event && (
          <button type="button" role="tab" aria-selected={eventOn} onClick={() => setShowEvent(true)}>
            {t('ev.tab')}
          </button>
        )}
      </div>
      {eventOn && event ? (
        <EventPanel event={event} limit={TOP} />
      ) : data?.error ? (
        <p className="lb-note lb-error" role="alert">
          {t('lb.error')}
        </p>
      ) : data && data.rows.length === 0 && !data.mine ? (
        <p className="lb-note">{t('lb.empty')}</p>
      ) : data ? (
        <>
          {podium && <Podium rows={data.rows} meId={userId} value={fmt} />}
          <ol className="lb-list" start={podium ? PODIUM + 1 : undefined}>
            {(podium ? data.rows.slice(PODIUM) : data.rows).map((r) => (
              <Row key={r.userId} r={r} me={r.userId === userId} value={fmt(r.value)} you={t('lb.you')} />
            ))}
            {data.mine && (
              <>
                <li className="lb-gap" aria-hidden="true">
                  …
                </li>
                <Row r={data.mine} me value={fmt(data.mine.value)} you={t('lb.you')} />
              </>
            )}
          </ol>
        </>
      ) : null}
    </section>
  )
}
