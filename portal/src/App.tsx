import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Home } from './home/Home'
import { PageLoading } from './home/PageLoading'
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
import { recordPlayThrottled } from './server/playCount'
import { useServer } from './server/ServerProvider'
import { isPlaying } from './player/playing'
import { parseRoute, type Route } from './player/route'
import { useShortcuts } from './player/useShortcuts'

// Trang phụ tải lười để bundle trang chủ nhẹ (Lighthouse điện thoại); trang chủ và Player vẫn nạp sẵn.
const AdminPage = lazy(() => import('./admin/AdminPage').then((m) => ({ default: m.AdminPage })))
const GamePage = lazy(() => import('./detail/GamePage').then((m) => ({ default: m.GamePage })))
const EventPage = lazy(() => import('./events/EventPage').then((m) => ({ default: m.EventPage })))
const EventsPage = lazy(() => import('./events/EventsPage').then((m) => ({ default: m.EventsPage })))
const GamesPage = lazy(() => import('./home/GamesPage').then((m) => ({ default: m.GamesPage })))
const HistoryPage = lazy(() => import('./history/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const LeaderboardsPage = lazy(() => import('./leaderboards/LeaderboardsPage').then((m) => ({ default: m.LeaderboardsPage })))
const NewsPage = lazy(() => import('./news/NewsPage').then((m) => ({ default: m.NewsPage })))
const PostPage = lazy(() => import('./news/PostPage').then((m) => ({ default: m.PostPage })))
const ProfilePage = lazy(() => import('./profile/ProfilePage').then((m) => ({ default: m.ProfilePage })))

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
    // Bật nền chữ sau lần vẽ đầu: nó đọc kích thước cửa sổ, làm ngay lúc mount sẽ ép tính layout cả trang
    // trong cùng tác vụ dựng trang (tác vụ dài trên điện thoại).
    let g: ReturnType<typeof startGlyphs> | null = null
    let timer = 0
    const raf = requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        g = startGlyphs(canvas, { isPlaying, reduceMotion: prefersReducedMotion() })
        glyphs.current = g
        g.recolor()
      })
    })
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      g?.stop()
      glyphs.current = null
    }
  }, [])

  const openIds = useMemo(() => new Set(heldIds), [heldIds])
  useCloudSync(openIds)

  return (
    <>
      <Suspense fallback={<PageLoading />}>
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
      </Suspense>
      {!game && <ScrollTop />}
      {/* Chỉ mời tải lại ngoài game, để không mất ván đang chơi */}
      {!game && <UpdateNotice />}
      <Player game={game} heldIds={heldIds} portalSeen={portalSeen} />
    </>
  )
}
