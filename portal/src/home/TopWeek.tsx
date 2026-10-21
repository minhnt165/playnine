import { useEffect, useState, type CSSProperties } from 'react'
import { isHidden } from '../events/model'
import { GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { unitLabel } from '../player/leaderboardModel'
import { detailHref } from '../player/route'
import { useServer } from '../server/ServerProvider'
import type { TopRow } from '../server/types'

const PER_GAME = 3
const MAX_GAMES = 6

/** Dải "Top tuần này" ở trang chủ: top 3 điểm tuần của vài game; không có server, lỗi hoặc chưa ai chơi thì không hiện. */
export function TopWeek() {
  const { api } = useServer()
  if (!api) return null
  return <Strip />
}

function Strip() {
  const { t, loc, fmtNumber } = useI18n()
  const { api, games, user } = useServer()
  const [rows, setRows] = useState<TopRow[]>([])

  useEffect(() => {
    let alive = true
    api!.topBoards('week', PER_GAME).then(
      (v) => alive && setRows(v),
      () => alive && setRows([]),
    )
    return () => {
      alive = false
    }
  }, [api])

  // Theo thứ tự danh mục; bỏ game không có trong cổng hoặc bị ẩn.
  const groups = GAMES.filter((g) => !isHidden(games, g.id))
    .map((g) => ({ game: g, rows: rows.filter((r) => r.gameId === g.id).sort((a, b) => a.rank - b.rank) }))
    .filter((x) => x.rows.length > 0)
    .slice(0, MAX_GAMES)
  if (groups.length === 0) return null

  return (
    <section className="top-week" aria-label={t('top.title')}>
      <div className="section-head reveal" style={{ '--i': 3 } as CSSProperties}>
        <h2>{t('top.title')}</h2>
        <a className="section-link" href="#/leaderboards">
          {t('top.all')} <span aria-hidden="true">→</span>
        </a>
      </div>
      <ul className="top-cards">
        {groups.map(({ game, rows: list }) => (
          <li key={game.id} className="top-card">
            <a className="top-game" href={detailHref(game)}>
              <span className="card-icon" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} />
              <span>{loc(game.name)}</span>
            </a>
            <ol>
              {list.map((r) => (
                <li key={r.userId} className={'rank-' + r.rank + (r.userId === user?.id ? ' me' : '')}>
                  <span className="top-rank">{r.rank}</span>
                  <a href={`#/u/${encodeURIComponent(r.userId)}`}>{r.displayName}</a>
                  <span className="top-value">{unitLabel(t, 'lbs.unit.points', r.value, fmtNumber)}</span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  )
}
