import { useEffect } from 'react'
import type { GameDef } from '../games/catalog'
import { Topbar } from '../home/Topbar'
import { useI18n } from '../i18n/i18n'
import { Leaderboard } from '../player/Leaderboard'
import { playHref } from '../player/route'
import { rememberReturnHash } from '../server/returnHash'
import { useServer } from '../server/ServerProvider'

type Props = {
  game: GameDef
  /** Đổi giá trị này thì tải lại bảng xếp hạng. */
  refreshKey: number
  onThemeApplied?: () => void
}

/** Trang giới thiệu #/game/<id>: thông tin game, nút chơi và bảng xếp hạng (màn chơi không hiện bảng). */
export function GamePage({ game, refreshKey, onThemeApplied }: Props) {
  const { t, loc } = useI18n()
  const { api, user, authReady } = useServer()
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

  return (
    <div className="wrap">
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="detail">
        <a className="profile-back" href="#/">
          {t('profile.back')}
        </a>
        <section className="detail-head">
          <span className="card-icon" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} />
          <div>
            <h1 className="detail-name">{name}</h1>
            <p className="detail-sub">{loc(game.sub)}</p>
          </div>
        </section>
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
            </span>
          )}
        </div>
        {game.sdk && <Leaderboard gameId={game.id} refreshKey={refreshKey} />}
      </main>
    </div>
  )
}
