import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminPage } from './admin/AdminPage'
import { GamePage } from './detail/GamePage'
import { EventPage } from './events/EventPage'
import { EventsPage } from './events/EventsPage'
import { GamesPage } from './home/GamesPage'
import { HistoryPage } from './history/HistoryPage'
import { LeaderboardsPage } from './leaderboards/LeaderboardsPage'
import { NewsPage } from './news/NewsPage'
import { PostPage } from './news/PostPage'
import { Home } from './home/Home'
import { prefersReducedMotion } from './home/media'
import { markPlayed } from './data/recent'
import { useFavoritesSync } from './data/favorites'
import { useCloudSync } from './data/useCloudSync'
import { ScrollTop } from './home/ScrollTop'
import { UpdateNotice } from './home/UpdateNotice'
import type { GameDef } from './games/catalog'
import { startGlyphs } from './legacy/glyphs'
import { nextFrameIds } from './player/frames'
import { Player } from './player/Player'
import { ProfilePage } from './profile/ProfilePage'
import { recordPlayThrottled } from './server/playCount'
import { useServer } from './server/ServerProvider'
import { isPlaying } from './player/playing'
import { parseRoute, type Route } from './player/route'
import { useShortcuts } from './player/useShortcuts'

const currentGame = (): GameDef | null => {
  const r = parseRoute(location.hash)
  return r.name === 'play' ? r.game : null
}
/** Route của trang không phải game (home, detail, profile, events, event, leaderboards, news, post, admin). */
const currentPage = (): Route => {
  const r = parseRoute(location.hash)
  return r.name === 'play' ? { name: 'home' } : r
}

export function App() {
  const glyphs = useRef<{ recolor(): void; stop(): void } | null>(null)
  const recolor = useCallback(() => glyphs.current?.recolor(), [])

  const [game, setGame] = useState<GameDef | null>(currentGame)
  const [heldIds, setHeldIds] = useState<string[]>(() => nextFrameIds([], null, game))
  // Chỉ true khi đã ở trang cổng trước khi vào game (để Back = history.back); vào thẳng link game thì false.
  const [portalSeen, setPortalSeen] = useState(() => currentGame() === null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState<Route>(currentPage)
  const gameRef = useRef(game)
  const { api } = useServer()

  useEffect(() => {
    const onHash = () => {
      setPage(currentPage())
      const prev = gameRef.current
      const next = currentGame()
      gameRef.current = next
      setGame(next)
      setHeldIds((h) => nextFrameIds(h, prev, next))
      if (!next) {
        setPortalSeen(true)
        // game có thể vừa ghi thống kê mới: đọc lại dữ liệu trang chủ
        if (prev) setRefreshKey((k) => k + 1)
      }
    }
    // Quay lại bằng nút Back (bfcache) thì đọc lại tiến độ mới nhất
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && !gameRef.current) setRefreshKey((k) => k + 1)
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  // Mỗi lần mở game ghi mốc "chơi gần nhất".
  useEffect(() => {
    if (game) {
      markPlayed(game.id)
      recordPlayThrottled(api, game.id)
    }
  }, [game, api])

  useShortcuts(game !== null)
  useFavoritesSync()

  useEffect(() => {
    const canvas = document.getElementById('bg') as HTMLCanvasElement | null
    if (!canvas) return
    const g = startGlyphs(canvas, { isPlaying, reduceMotion: prefersReducedMotion() })
    glyphs.current = g
    return () => {
      g.stop()
      glyphs.current = null
    }
  }, [])

  const openIds = useMemo(() => new Set(heldIds), [heldIds])
  useCloudSync(openIds)

  return (
    <>
      {page.name === 'profile' ? (
        <ProfilePage userId={page.userId} onThemeApplied={recolor} />
      ) : page.name === 'detail' ? (
        <GamePage game={page.game} refreshKey={refreshKey} onThemeApplied={recolor} />
      ) : page.name === 'events' ? (
        <EventsPage onThemeApplied={recolor} />
      ) : page.name === 'event' ? (
        <EventPage eventId={page.eventId} onThemeApplied={recolor} />
      ) : page.name === 'news' ? (
        <NewsPage onThemeApplied={recolor} />
      ) : page.name === 'post' ? (
        <PostPage slug={page.slug} onThemeApplied={recolor} />
      ) : page.name === 'leaderboards' ? (
        <LeaderboardsPage onThemeApplied={recolor} />
      ) : page.name === 'games' ? (
        <GamesPage onThemeApplied={recolor} />
      ) : page.name === 'history' ? (
        <HistoryPage onThemeApplied={recolor} />
      ) : page.name === 'admin' ? (
        <AdminPage onThemeApplied={recolor} />
      ) : (
        <Home openIds={openIds} refreshKey={refreshKey} onThemeApplied={recolor} />
      )}
      {!game && <ScrollTop />}
      {/* Chỉ mời tải lại ngoài game, để không mất ván đang chơi */}
      {!game && <UpdateNotice />}
      <Player game={game} heldIds={heldIds} portalSeen={portalSeen} />
    </>
  )
}
