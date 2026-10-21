import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { GameDef } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { mountPreviews } from '../legacy/previews'
import { greetingKey } from '../lib/time'
import { isPlaying } from '../player/playing'
import { detailHref, playHref } from '../player/route'
import { featuredGames } from './featured'
import { prefersReducedMotion } from './media'

/** Băng lớn đầu trang chủ: lời chào, tiêu đề và một game nổi bật của hôm nay (chọn được trong 5 game). */
export function Spotlight({ now, games }: { now: Date; games: GameDef[] }) {
  const { t, lang, loc, fmtDate, weekdayOf } = useI18n()
  const picks = featuredGames(games, now)
  const [sel, setSel] = useState(0)
  const g = picks[Math.min(sel, picks.length - 1)]
  const media = useRef<HTMLDivElement>(null)

  // Ô xem trước động của game đang chọn; dọn khi đổi game.
  useEffect(() => (g ? mountPreviews(media.current!, { isPlaying, reduceMotion: prefersReducedMotion() }) : undefined), [g])

  const date =
    lang === 'vi'
      ? weekdayOf(now) + ', ' + String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear()
      : fmtDate(now, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <section className="spotlight reveal" style={{ '--i': 1 } as CSSProperties}>
      <div className="spot-media" ref={media}>
        {g && <div className={'preview pv-' + g.id} data-game={g.id} aria-hidden="true" />}
      </div>
      <div className="spot-body">
        <p className="greet" id="greet">
          {t(greetingKey(now)) + ' · ' + date}
        </p>
        <h1 dangerouslySetInnerHTML={{ __html: t('hero.title') }} />
        <p className="tagline">{t('hero.tagline')}</p>
        {g && (
          <>
            <div className="spot-game">
              <span className="card-icon" dangerouslySetInnerHTML={{ __html: g.icon(g.dir) }} />
              <div>
                <p className="spot-kicker">{t('spot.kicker')}</p>
                <h2 className="spot-name">{loc(g.name)}</h2>
              </div>
            </div>
            <p className="spot-desc">{loc(g.desc)}</p>
            <div className="spot-actions">
              <a className="btn btn-primary" href={playHref(g)}>
                {t('detail.play')} <span aria-hidden="true">→</span>
              </a>
              <a className="btn btn-ghost" href={detailHref(g)}>
                {t('spot.details')}
              </a>
            </div>
          </>
        )}
      </div>
      {picks.length > 1 && (
        <div className="spot-thumbs" role="group" aria-label={t('spot.choose')}>
          {picks.map((p, i) => (
            <button key={p.id} type="button" aria-pressed={p === g} aria-label={loc(p.name)} title={loc(p.name)} onClick={() => setSel(i)}>
              <span className="card-icon" dangerouslySetInnerHTML={{ __html: p.icon(p.dir) }} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
