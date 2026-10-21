import type { CSSProperties, PointerEvent } from 'react'
import type { GameDef } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { detailHref } from '../player/route'
import { formatCount } from '../lib/format'
import { canHover, prefersReducedMotion } from './media'

type Props = {
  game: GameDef
  index: number
  ribbon: [string, string] | null
  note: string | undefined
  hidden: boolean
  /** Tổng số lượt chơi từ server; undefined thì không hiện. */
  plays?: number
}

export function GameCard({ game: g, index: i, ribbon, note, hidden, plays }: Props) {
  const { t, loc, lang } = useI18n()
  const tilt = !prefersReducedMotion() && canHover()

  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const card = e.currentTarget
    const r = card.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    card.style.setProperty('--mx', x * 100 + '%')
    card.style.setProperty('--my', y * 100 + '%')
    card.style.setProperty('--ry', (x - 0.5) * 7 + 'deg')
    card.style.setProperty('--rx', (0.5 - y) * 7 + 'deg')
  }
  const onLeave = (e: PointerEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.setProperty('--rx', '0deg')
    e.currentTarget.style.setProperty('--ry', '0deg')
  }

  return (
    <li className="reveal" hidden={hidden} data-cat={g.cat} style={{ '--i': 5 + i * 0.5 } as CSSProperties}>
      <a
        className="card"
        href={detailHref(g)}
        aria-label={t('card.playGame', { game: loc(g.name) })}
        onPointerMove={tilt ? onMove : undefined}
        onPointerLeave={tilt ? onLeave : undefined}
      >
        <div className={'preview pv-' + g.id} data-game={g.id} aria-hidden="true">
          {ribbon && (
            <span className="ribbon">
              <span className="r-long">{ribbon[0]}</span>
              <span className="r-short">{ribbon[1]}</span>
            </span>
          )}
          {i < 9 && <span className="kbd">{i + 1}</span>}
        </div>
        <div className="card-body">
          <div className="card-head">
            <div className="card-icon" dangerouslySetInnerHTML={{ __html: g.icon(g.dir) }} />
            <div>
              <h3>{loc(g.name)}</h3>
              <p className="en">{loc(g.sub)}</p>
            </div>
          </div>
          <p className="desc">{loc(g.desc)}</p>
          <ul className="tags">
            {loc(g.tags).map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
          <div className="card-foot">
            <div className="card-meta">
              <span className="card-note">{note}</span>
              {plays !== undefined && <span className="plays">{t('card.plays', { n: formatCount(plays, lang === 'vi' ? 'vi-VN' : 'en-US') })}</span>}
            </div>
            <span className="play">
              {t('card.play')} <span aria-hidden="true">→</span>
            </span>
          </div>
        </div>
      </a>
    </li>
  )
}