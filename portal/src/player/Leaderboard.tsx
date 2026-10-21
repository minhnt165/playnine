import { useEffect, useId, useState } from 'react'
import { EventPanel } from '../events/EventBoard'
import { liveEventsFor } from '../events/model'
import { useNow } from '../events/useNow'
import { useI18n } from '../i18n/i18n'
import { readRaw, write } from '../lib/storage'
import { useServer } from '../server/ServerProvider'
import type { GameEvent, GameMeta, LeaderRow, Period } from '../server/types'
import { formatValue, periodsFor } from './leaderboardModel'

const TOP = 50
const modeKeyOf = (gameId: string) => 'playnine-lb-mode-' + gameId
const PERIOD_LABEL: Record<Period, string> = { day: 'lb.day', week: 'lb.week', all: 'lb.all' }

type Loaded = { key: string; rows: LeaderRow[]; mine: LeaderRow | null; error: boolean }

type Props = { gameId: string; refreshKey: number }

/** Bảng xếp hạng trên trang giới thiệu game; chỉ render khi có server và game có trong metadata. */
export function Leaderboard({ gameId, refreshKey }: Props) {
  const { api, games } = useServer()
  const meta = games[gameId]
  if (!api || !meta || meta.modes.length === 0) return null
  return <Board key={gameId} meta={meta} refreshKey={refreshKey} />
}

function Row({ r, me, value, you }: { r: LeaderRow; me: boolean; value: string; you: string }) {
  return (
    <li className={me ? 'me' : undefined}>
      <span className="lb-rank">{r.rank}</span>
      <span className="lb-name">
        <a href={`#/u/${encodeURIComponent(r.userId)}`}>{r.displayName}</a>
        {me && <em className="lb-you">{you}</em>}
      </span>
      <span className="lb-value">{value}</span>
    </li>
  )
}
function Board({ meta, refreshKey }: { meta: GameMeta; refreshKey: number }) {
  const { api, user } = useServer()
  const { t, lang, fmtNumber } = useI18n()
  const gameId = meta.id
  const [savedMode, setSavedMode] = useState(() => readRaw(modeKeyOf(gameId)))
  const [savedPeriod, setSavedPeriod] = useState<Period | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const titleId = useId()
  const [events, setEvents] = useState<GameEvent[]>([])
  const [showEvent, setShowEvent] = useState(false)
  const now = useNow(10000)

  // Mode mặc định: mode đã lưu, nếu chưa có thì mode của sự kiện đang diễn ra, cuối cùng là mode đầu tiên.
  const liveEvents = liveEventsFor(events, gameId, now)
  const mode = meta.modes.some((m) => m.key === savedMode)
    ? (savedMode as string)
    : (liveEvents.find((e) => meta.modes.some((m) => m.key === e.mode))?.mode ?? meta.modes[0].key)
  const event = liveEvents.find((e) => e.mode === mode) ?? null
  const eventOn = showEvent && event !== null
  const periods = periodsFor(mode)
  const period = savedPeriod && periods.includes(savedPeriod) ? savedPeriod : periods[0]
  const viewKey = `${mode}|${period}`
  const userId = user?.id ?? null

  useEffect(() => {
    if (!api) return
    let alive = true
    const key = `${mode}|${period}`
    ;(async () => {
      try {
        const rows = await api.leaderboard(gameId, mode, period, TOP)
        let mine: LeaderRow | null = null
        if (user && !rows.some((r) => r.userId === user.id)) {
          const r = await api.myRank(gameId, mode, period)
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
  }, [api, gameId, mode, period, refreshKey, userId])

  // Tải sự kiện một lần; lỗi thì coi như không có sự kiện, bảng thường vẫn chạy.
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

  const pickMode = (key: string) => {
    write(modeKeyOf(gameId), key)
    setSavedMode(key)
    setSavedPeriod(null)
    setShowEvent(false)
  }

  const fmt = (v: number) => formatValue(meta.metric, v, fmtNumber)
  const data = loaded && loaded.key === viewKey ? loaded : null
  return (
    <section className="lb-panel" aria-labelledby={titleId}>
      <div className="section-head">
        <h2 id={titleId}>{t('lb.title')}</h2>
      </div>
      <div className="lb-tabs" role="tablist">
        {meta.modes.map((m) => (
          <button key={m.key} type="button" role="tab" aria-selected={m.key === mode} onClick={() => pickMode(m.key)}>
            {m.label[lang]}
          </button>
        ))}
      </div>
      <div className="lb-tabs lb-periods" role="tablist">
        {periods.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={!eventOn && p === period} onClick={() => { setSavedPeriod(p); setShowEvent(false) }}>
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
        <ol className="lb-list">
          {data.rows.map((r) => (
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
      ) : null}
    </section>
  )
}
