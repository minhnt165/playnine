import { useEffect, useRef } from 'react'
import { isHidden } from '../events/model'
import { GAMES, type GameDef } from '../games/catalog'
import { prefersReducedMotion } from '../home/media'
import { Topbar } from '../home/Topbar'
import { useI18n } from '../i18n/i18n'
import { mountPreviews } from '../legacy/previews'
import { Leaderboard } from '../player/Leaderboard'
import { modePoints, perRunText } from '../player/leaderboardModel'
import { isPlaying } from '../player/playing'
import { detailHref, playHref } from '../player/route'
import { rememberReturnHash } from '../server/returnHash'
import { useServer } from '../server/ServerProvider'
import { FavButton } from '../home/FavButton'
import { GamePreview, previewBg } from '../home/GamePreview'
import { GameRating } from './GameRating'
import { similarGames } from './similar'

type Props = {
  game: GameDef
  /** Đổi giá trị này thì tải lại bảng xếp hạng. */
  refreshKey: number
  onThemeApplied?: () => void
}

/** Trang giới thiệu #/game/<id>: thông tin game, nút chơi và bảng xếp hạng (màn chơi không hiện bảng). */
export function GamePage({ game, refreshKey, onThemeApplied }: Props) {
  const { t, loc } = useI18n()
  const { api, user, authReady, games } = useServer()
  const perRun = perRunText(t, games[game.id])
  // Bảng điểm từng mức độ chỉ hiện khi các mức khác điểm nhau.
  const byMode = modePoints(games[game.id]) ?? []
  const showByMode = byMode.length > 1 && new Set(byMode.map((m) => m.points)).size > 1
  const similar = similarGames(game, GAMES.filter((g) => !isHidden(games, g.id)))
  const name = loc(game.name)

  useEffect(() => {
    document.title = name + ' · PlayNine'
    return () => {
      document.title = 'PlayNine'
    }
  }, [name])

  // Vào từ giữa danh sách thẻ: đưa trang mới về đầu.
  useEffect(() => {
    const el = document.scrollingElement ?? document.documentElement
    el.scrollTop = 0
  }, [game.id])

  // Ô xem trước động giống thẻ ở trang chủ; dọn khi đổi game hoặc rời trang.
  const hero = useRef<HTMLDivElement>(null)
  useEffect(() => mountPreviews(hero.current!, { isPlaying, reduceMotion: prefersReducedMotion() }), [game.id])

  return (
    <div className="wrap">
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="detail">
        <a className="profile-back" href="#/">
          {t('profile.back')}
        </a>
        <div className="detail-hero" ref={hero}>
          <GamePreview key={game.id} g={game} className="detail-preview" eager />
          <div className="detail-info">
            <section className="detail-head">
              <span className="card-icon" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} />
              <div>
                <h1 className="detail-name">{name}</h1>
                <p className="detail-sub">{loc(game.sub)}</p>
              </div>
            </section>
            <GameRating gameId={game.id} />
            <p className="detail-desc">{loc(game.desc)}</p>
            <ul className="tags">
              {loc(game.tags).map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
            <div className="detail-actions">
              <a className="detail-play" href={playHref(game)}>
                {t('detail.play')} <span aria-hidden="true">→</span>
              </a>
              <FavButton game={game} className="detail-fav" withLabel />
              {perRun && <span className="detail-points">{perRun}</span>}
              {api && authReady && !user && game.sdk && (
                <span className="detail-signin">
                  <span>{t('play.signInToScore')}</span>
                  <button
                    type="button"
                    className="profile-btn"
                    onClick={() => {
                      rememberReturnHash()
                      api.signInWithGoogle().catch(() => {})
                    }}
                  >
                    {t('auth.signIn')}
                  </button>
                  <button type="button" className="profile-btn" onClick={() => api.signInAsGuest().catch(() => {})}>
                    {t('auth.guest')}
                  </button>
                </span>
              )}
            </div>
            {showByMode && (
              <div className="detail-mode-points">
                <span>{t('points.byMode')}</span>
                <ul>
                  {byMode.map((m) => (
                    <li key={m.key}>
                      {loc(m.label)} <b>{m.points}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        {game.sdk && <Leaderboard gameId={game.id} refreshKey={refreshKey} />}
        {similar.length > 0 && (
          <section className="similar" aria-labelledby="similar-title">
            <div className="section-head">
              <h2 id="similar-title">{t('detail.similar')}</h2>
            </div>
            <ul className="similar-list">
              {similar.map((g) => (
                <li key={g.id}>
                  <a className="similar-item" href={detailHref(g)}>
                    <span className={'similar-cover pv-' + g.id} style={previewBg(g)}>
                      <span className="card-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: g.icon(g.dir) }} />
                    </span>
                    <span className="similar-name">{loc(g.name)}</span>
                    <span className="similar-sub">{loc(g.sub)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
