import { useEffect, useState } from 'react'
import { gameById } from '../games/catalog'
import { Topbar } from '../home/Topbar'
import { useI18n } from '../i18n/i18n'
import { formatValue } from '../player/leaderboardModel'
import { Row } from '../player/LeaderRow'
import { useServer } from '../server/ServerProvider'
import type { LeaderRow } from '../server/types'
import { EventBoard } from './EventBoard'
import { useEventText } from './eventText'
import { eventPhase, formatCountdown } from './model'
import { useEvents } from './useEvents'
import { useNow } from './useNow'

type Props = { eventId: string; onThemeApplied?: () => void }

/** Trang #/events/<id>: luật, thời gian, đếm ngược, bảng xếp hạng và người nhận huy hiệu. */
export function EventPage({ eventId, onThemeApplied }: Props) {
  const { t, fmtNumber } = useI18n()
  const { user, games } = useServer()
  const text = useEventText()
  const state = useEvents()
  const now = useNow()
  // Hàng đã tải kèm id sự kiện, để đổi sự kiện thì không hiện nhầm người nhận huy hiệu của sự kiện cũ.
  const [loaded, setLoaded] = useState<{ id: string; rows: LeaderRow[] } | null>(null)

  const event = state.status === 'ready' ? (state.events.find((e) => e.id === eventId) ?? null) : null
  const title = event ? text.title(event) : ''
  useEffect(() => {
    if (!event) return
    const prev = document.title
    document.title = title + ' · PlayNine'
    return () => {
      document.title = prev
    }
  }, [event, title])

  let body
  if (state.status === 'unavailable') body = <p className="lb-note">{t('ev.unavailable')}</p>
  else if (state.status === 'error') body = <p className="lb-note">{t('ev.error')}</p>
  else if (state.status === 'loading') body = null
  else if (!event) body = <p className="lb-note">{t('ev.notFound')}</p>
  else if (eventPhase(event, now) === 'cancelled') body = <p className="lb-note">{t('ev.cancelled')}</p>
  else {
    const phase = eventPhase(event, now)
    const game = gameById(event.gameId)
    const desc = text.description(event)
    const rows = loaded && loaded.id === event.id ? loaded.rows : []
    const winners = rows.filter((r) => r.rank <= event.awardTop)
    const metric = games[event.gameId]?.metric ?? 'score_high'
    body = (
      <>
        <header className="ev-head">
          <h1 className="ev-heading">{title}</h1>
          {phase === 'ended' && <span className="ev-status">{t('ev.ended')}</span>}
        </header>
        {desc && <p className="ev-desc">{desc}</p>}
        <section>
          <div className="section-head">
            <h2>{t('ev.rules')}</h2>
          </div>
          <ul className="ev-rules">
            <li>
              {text.gameName(event)} · {text.modeLabel(event)}
            </li>
            <li>{t(event.agg === 'sum' ? 'ev.agg.sum' : 'ev.agg.best')}</li>
            <li>{t('ev.awardTop', { n: event.awardTop })}</li>
            <li>
              {t('ev.starts')}: {text.when(event.startsAt)}
            </li>
            <li>
              {t('ev.ends')}: {text.when(event.endsAt)}
            </li>
          </ul>
          {phase === 'live' && (
            <p className="ev-count">{t('ev.endsIn', { time: formatCountdown(Date.parse(event.endsAt) - now, t) })}</p>
          )}
          {phase === 'upcoming' && (
            <p className="ev-count">{t('ev.startsIn', { time: formatCountdown(Date.parse(event.startsAt) - now, t) })}</p>
          )}
          {phase === 'live' && game && (
            <a className="ev-play" href={'#/play/' + game.id}>
              {t('ev.play')}
            </a>
          )}
          {phase === 'ended' && event.status !== 'closed' && <p className="lb-note">{t('ev.provisional')}</p>}
        </section>
        <section>
          <div className="section-head">
            <h2>{t('lb.title')}</h2>
          </div>
          <EventBoard event={event} limit={Math.max(50, event.awardTop)} onRows={(r) => setLoaded({ id: event.id, rows: r })} />
        </section>
        {phase === 'ended' && event.status === 'closed' && winners.length > 0 && (
          <section>
            <div className="section-head">
              <h2>{t('ev.winners')}</h2>
            </div>
            <ol className="lb-list">
              {winners.map((r) => (
                <Row
                  key={r.userId}
                  r={r}
                  me={r.userId === user?.id}
                  value={formatValue(metric, r.value, fmtNumber)}
                  you={t('lb.you')}
                />
              ))}
            </ol>
          </section>
        )}
      </>
    )
  }

  return (
    <div className="wrap" data-page="event" data-event-id={eventId}>
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="profile">
        <a className="profile-back" href="#/events">
          {t('ev.back')}
        </a>
        {body}
      </main>
    </div>
  )
}
