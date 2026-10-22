import { useFavorites } from '../data/favorites'
import { isHidden } from '../events/model'
import { gameById, type GameDef } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { detailHref } from '../player/route'
import { useServer } from '../server/ServerProvider'

/** Game yêu thích còn hiển thị (bỏ id lạ và game bị ẩn), theo thứ tự mới thêm trước. */
export function useFavoriteGames(): GameDef[] {
  const { ids } = useFavorites()
  const { games } = useServer()
  return ids.map((id) => gameById(id)).filter((g): g is GameDef => g !== undefined && !isHidden(games, g.id))
}

/** Hàng "Game yêu thích" ở trang chủ: chưa có game nào thì không hiện. */
export function FavoriteRow() {
  const { t, loc } = useI18n()
  const list = useFavoriteGames()
  if (list.length === 0) return null
  return (
    <section className="col-row fav-row" aria-labelledby="fav-row-title">
      <div className="section-head">
        <h2 id="fav-row-title">
          <svg className="fav-row-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4 7.4 4c2 0 3.5 1.1 4.6 2.7C13.1 5.1 14.6 4 16.6 4c3.5 0 5.8 3.6 4.6 7.1-1.7 4.8-9.2 9.4-9.2 9.4z" />
          </svg>
          {t('fav.title')}
        </h2>
      </div>
      <ul className="col-games">
        {list.map((game) => (
          <li key={game.id}>
            <a className="col-game" href={detailHref(game)}>
              <span className="card-icon" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} />
              <span className="col-game-name">{loc(game.name)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
