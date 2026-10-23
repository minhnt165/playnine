import { useEffect } from 'react'
import { gameById } from '../games/catalog'
import { PageLoading } from '../home/PageLoading'
import { Topbar } from '../home/Topbar'
import { useI18n } from '../i18n/i18n'
import { eventHref } from '../player/route'
import type { GameEvent } from '../server/types'
import { useEventText } from './eventText'
import { formatCountdown, groupEvents } from './model'
import { useEvents } from './useEvents'
import { useNow } from './useNow'

type CardProps = { e: GameEvent; now: number; phase: 'live' | 'upcoming' | 'ended' }

function EventCard({ e, now, phase }: CardProps) {
  const { t } = useI18n()
  const text = useEventText()
  const game = gameById(e.gameId)
  const count =
    phase === 'live'
      ? t('ev.endsIn', { time: formatCountdown(Date.parse(e.endsAt) - now, t) })
      : phase === 'upcoming'
        ? t('ev.startsIn', { time: formatCountdown(Date.parse(e.startsAt) - now, t) })
        : null
  return (
    <li className="ev-card">
      <a href={eventHref(e.id)}>
        {game && <span className="card-icon" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} />}
        <span className="ev-card-body">
          <span className="ev-card-title">{text.title(e)}</span>
          <span className="ev-card-meta">
            {text.gameName(e)} · {text.modeLabel(e)}
          </span>
          <span className="ev-card-time">
            {text.when(e.startsAt)} – {text.when(e.endsAt)}
          </span>
        </span>
        {count && <span className="ev-card-count">{count}</span>}
      </a>
    </li>
  )
}

/** Trang #/events: sự kiện đang diễn ra, sắp diễn ra và đã kết thúc. */
export function EventsPage({ onThemeApplied }: { onThemeApplied?: () => void }) {
  const { t } = useI18n()
  const state = useEvents()
  const now = useNow()

  useEffect(() => {
    const prev = document.title
    document.title = t('ev.title') + ' · PlayNine'
    return () => {
      document.title = prev
    }
  }, [t])

  let body
  if (state.status === 'unavailable') body = <p className="lb-note">{t('ev.unavailable')}</p>
  else if (state.status === 'error') body = <p className="lb-note">{t('ev.error')}</p>
  else if (state.status === 'loading') body = <PageLoading />
  else {
    const g = groupEvents(state.events, now)
    const sections = [
      { phase: 'live' as const, title: t('ev.live'), list: g.live },
      { phase: 'upcoming' as const, title: t('ev.upcoming'), list: g.upcoming },
      { phase: 'ended' as const, title: t('ev.ended'), list: g.ended },
    ].filter((s) => s.list.length > 0)
    body =
      sections.length === 0 ? (
        <p className="lb-note">{t('ev.none')}</p>
      ) : (
        sections.map((s) => (
          <section key={s.phase}>
            <div className="section-head">
              <h2>{s.title}</h2>
            </div>
            <ul className="ev-list">
              {s.list.map((e) => (
                <EventCard key={e.id} e={e} now={now} phase={s.phase} />
              ))}
            </ul>
          </section>
        ))
      )
  }

  return (
    <div className="wrap" data-page="events">
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="profile">
        <a className="profile-back" href="#/">
          {t('profile.back')}
        </a>
        <h1 className="ev-heading">{t('ev.title')}</h1>
        {body}
      </main>
    </div>
  )
}
