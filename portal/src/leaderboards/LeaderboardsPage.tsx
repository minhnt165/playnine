import { useEffect, useState } from 'react'
import { GAMES } from '../games/catalog'
import { previewBg } from '../home/GamePreview'
import { Topbar } from '../home/Topbar'
import { useI18n } from '../i18n/i18n'
import { readRaw, write } from '../lib/storage'
import { Leaderboard } from '../player/Leaderboard'
import { perRunText } from '../player/leaderboardModel'
import { detailHref, playHref } from '../player/route'
import { useServer } from '../server/ServerProvider'
import { PlayerBoard } from './PlayerBoard'

const TAB_KEY = 'playnine-lbs-tab'
const GAME_KEY = 'playnine-lbs-game'
type Tab = 'players' | 'games'

/** Trang #/leaderboards: xếp hạng người chơi toàn cổng và bảng xếp hạng từng game ở cùng một chỗ. */
export function LeaderboardsPage({ onThemeApplied }: { onThemeApplied?: () => void }) {
  const { t, loc } = useI18n()
  const { api, games } = useServer()
  const [tab, setTab] = useState<Tab>(() => (readRaw(TAB_KEY) === 'games' ? 'games' : 'players'))
  const [savedGame, setSavedGame] = useState(() => readRaw(GAME_KEY))

  useEffect(() => {
    const prev = document.title
    document.title = t('lbs.title') + ' · PlayNine'
    return () => {
      document.title = prev
    }
  }, [t])

  // Chỉ game đã nối SDK (có ghi ván), có metadata trên server và không bị ẩn mới có bảng điểm.
  const boardGames = GAMES.filter((g) => g.sdk && games[g.id] && !games[g.id].hidden)
  const gameId = boardGames.some((g) => g.id === savedGame) ? (savedGame as string) : boardGames[0]?.id
  const selected = boardGames.find((g) => g.id === gameId)
  const pickTab = (v: Tab) => {
    setTab(v)
    write(TAB_KEY, v)
  }

  return (
    <div className="wrap" data-page="leaderboards">
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="profile lbs">
        <h1 className="ev-heading">{t('lbs.title')}</h1>
        {!api ? (
          <p className="lb-note">{t('lbs.unavailable')}</p>
        ) : (
          <>
            <div className="lbs-tabs" role="tablist" aria-label={t('lbs.title')}>
              {(['players', 'games'] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => pickTab(v)}>
                  {t('lbs.' + v)}
                </button>
              ))}
            </div>
            {tab === 'players' ? (
              <PlayerBoard />
            ) : (
              <div className="lbs-by-game">
                <div className="lbs-games" role="group" aria-label={t('lbs.pick')}>
                  {boardGames.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={g.id === gameId}
                      onClick={() => {
                        setSavedGame(g.id)
                        write(GAME_KEY, g.id)
                      }}
                    >
                      <span className="card-icon" dangerouslySetInnerHTML={{ __html: g.icon(g.dir) }} />
                      <span className="lbs-game-name">{loc(g.name)}</span>
                      {perRunText(t, games[g.id]) && <span className="lbs-game-pts">{perRunText(t, games[g.id])}</span>}
                    </button>
                  ))}
                </div>
                {selected && (
                  <div className="lbs-game-panel">
                    <div className={'lbs-game-hero pv-' + selected.id} style={previewBg(selected)}>
                      <span className="card-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: selected.icon(selected.dir) }} />
                      <span className="lbs-game-hero-text">
                        <b>{loc(selected.name)}</b>
                        <span>{loc(selected.sub)}</span>
                      </span>
                      <span className="lbs-game-hero-actions">
                        <a className="btn btn-primary" href={playHref(selected)}>
                          {t('detail.play')} <span aria-hidden="true">→</span>
                        </a>
                        <a className="btn btn-ghost" href={detailHref(selected)}>
                          {t('spot.details')}
                        </a>
                      </span>
                    </div>
                    <Leaderboard gameId={selected.id} refreshKey={0} podium />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
