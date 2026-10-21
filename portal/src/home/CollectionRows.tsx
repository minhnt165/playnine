import { useEffect, useState } from 'react'
import { activeCollections, isHidden, localized } from '../events/model'
import { GAMES, gameById } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { detailHref } from '../player/route'
import { useServer } from '../server/ServerProvider'
import type { Collection } from '../server/types'

/** Các hàng bộ sưu tập ở trang chủ; không có server hoặc tải lỗi thì không hiện gì. */
export function CollectionRows() {
  const { api } = useServer()
  if (!api) return null
  return <Rows />
}

function Rows() {
  const { api, games } = useServer()
  const { lang, loc } = useI18n()
  const [list, setList] = useState<Collection[]>([])

  useEffect(() => {
    let alive = true
    api!.collections().then(
      (v) => alive && setList(v),
      () => alive && setList([]),
    )
    return () => {
      alive = false
    }
  }, [api])

  // Chỉ giữ game có trong danh mục của cổng và không bị ẩn.
  const visible = new Set(GAMES.filter((g) => !isHidden(games, g.id)).map((g) => g.id))
  const shown = activeCollections(list, Date.now(), visible)
  return (
    <>
      {shown.map((c) => (
        <section className="col-row" key={c.id}>
          <div className="section-head">
            <h2>{localized(c.title, lang)}</h2>
          </div>
          <ul className="col-games">
            {c.gameIds.map((id) => {
              const game = gameById(id)!
              return (
                <li key={id}>
                  <a className="col-game" href={detailHref(game)}>
                    <span className="card-icon" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} />
                    <span className="col-game-name">{loc(game.name)}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
