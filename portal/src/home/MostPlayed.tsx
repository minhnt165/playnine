import type { CSSProperties } from 'react'
import { isHidden } from '../events/model'
import { GAMES, type GameDef } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { formatCount } from '../lib/format'
import { detailHref } from '../player/route'
import { useServer } from '../server/ServerProvider'

const MAX = 5

/** Các game được chơi nhiều nhất, hạng lớn trước; hòa thì theo thứ tự danh mục. */
export function mostPlayed(list: GameDef[], totals: Record<string, number>, n = MAX): { game: GameDef; plays: number }[] {
  return list
    .map((game) => ({ game, plays: totals[game.id] ?? 0 }))
    .filter((x) => x.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, n)
}

/** Dải "Chơi nhiều nhất" ở trang chủ với số hạng 1, 2, 3… cỡ lớn; chưa có số liệu thì không hiện. */
export function MostPlayed({ totals, title, n = MAX }: { totals: Record<string, number>; title?: string; n?: number }) {
  const { t, loc, lang } = useI18n()
  const { games } = useServer()
  const top = mostPlayed(GAMES.filter((g) => !isHidden(games, g.id)), totals, n)
  const heading = title ?? t('most.title')
  if (top.length === 0) return null
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US'
  return (
    <section className="most-played" aria-label={heading}>
      <div className="section-head reveal" style={{ '--i': 3 } as CSSProperties}>
        <h2>{heading}</h2>
      </div>
      <ol className="most-list">
        {top.map(({ game, plays }, i) => (
          <li key={game.id} className="reveal" style={{ '--i': 3 + i * 0.3 } as CSSProperties}>
            <a href={detailHref(game)} className={'most-item rank-' + (i + 1)}>
              <span className="most-rank" aria-hidden="true">
                {i + 1}
              </span>
              {/* Bìa dùng nền màu riêng của game (lớp pv-<id>) và icon lớn, không chạy preview động */}
              <span className={'most-cover pv-' + game.id}>
                <span className="card-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} />
                <span className="most-plays">{t('card.plays', { n: formatCount(plays, locale) })}</span>
              </span>
              <span className="most-name">{loc(game.name)}</span>
              <span className="most-sub">{loc(game.sub)}</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}
