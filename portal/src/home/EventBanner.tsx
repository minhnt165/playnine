import { useEventText } from '../events/eventText'
import { formatCountdown, liveEventsFor } from '../events/model'
import { useEvents } from '../events/useEvents'
import { useNow } from '../events/useNow'
import { useI18n } from '../i18n/i18n'
import { eventHref } from '../player/route'
import { useServer } from '../server/ServerProvider'

const MAX = 3

/** Dải sự kiện đang diễn ra ở trang chủ; không có server thì không hiện gì. */
export function EventBanner() {
  const { api } = useServer()
  if (!api) return null
  return <Banner />
}

function Banner() {
  const { t } = useI18n()
  const text = useEventText()
  const state = useEvents()
  const now = useNow()
  const live = state.status === 'ready' ? liveEventsFor(state.events, null, now).slice(0, MAX) : []
  return (
    // Không có sự kiện live thì chỉ còn link "tất cả sự kiện" dạng gọn, không để khung trống.
    <section className={'ev-banner' + (live.length === 0 ? ' ev-banner-empty' : '')} aria-label={t('ev.title')}>
      {live.length > 0 && (
        <ul className="ev-banner-list">
          {live.map((e) => (
            <li key={e.id}>
              <a className="ev-banner-item" href={eventHref(e.id)}>
                <span className="ev-live-dot" aria-hidden="true" />
                <span className="ev-banner-title">{text.title(e)}</span>
                <span className="ev-banner-game">{text.gameName(e)}</span>
                <span className="ev-banner-count">
                  {t('ev.endsIn', { time: formatCountdown(Date.parse(e.endsAt) - now, t) })}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <a className="ev-banner-all" href="#/events">
        {t('ev.all')} <span aria-hidden="true">→</span>
      </a>
    </section>
  )
}
