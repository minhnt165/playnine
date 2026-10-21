import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Home } from './home/Home'
import { prefersReducedMotion } from './home/media'
import { markPlayed } from './data/recent'
import type { GameDef } from './games/catalog'
import { startGlyphs } from './legacy/glyphs'
import { nextFrameIds } from './player/frames'
import { Player } from './player/Player'
import { isPlaying } from './player/playing'
import { parseRoute } from './player/route'
import { useShortcuts } from './player/useShortcuts'

const currentGame = (): GameDef | null => {
  const r = parseRoute(location.hash)
  return r.name === 'play' ? r.game : null
}

export function App() {
  const glyphs = useRef<{ recolor(): void; stop(): void } | null>(null)
  const recolor = useCallback(() => glyphs.current?.recolor(), [])

  const [game, setGame] = useState<GameDef | null>(currentGame)
  const [heldIds, setHeldIds] = useState<string[]>(() => nextFrameIds([], null, game))
  // Chỉ true khi đã ở trang cổng trước khi vào game (để Back = history.back); vào thẳng link game thì false.
  const [portalSeen, setPortalSeen] = useState(() => currentGame() === null)
  const [refreshKey, setRefreshKey] = useState(0)
  const gameRef = useRef(game)

  useEffect(() => {
    const onHash = () => {
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
    if (game) markPlayed(game.id)
  }, [game])

  useShortcuts(game !== null)

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

  return (
    <>
      <Home openIds={openIds} refreshKey={refreshKey} onThemeApplied={recolor} />
      <Player game={game} heldIds={heldIds} portalSeen={portalSeen} />
    </>
  )
}
