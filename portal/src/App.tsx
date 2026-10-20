import { useCallback, useEffect, useRef } from 'react'
import { Home } from './home/Home'
import { prefersReducedMotion } from './home/media'
import { startGlyphs } from './legacy/glyphs'

// Khung tạm: Task 7 thay bằng router (#/play/<id>) và truyền openIds/refreshKey thật.
const NO_OPEN = new Set<string>()
// Task 7 sẽ gắn class 'playing' lên body khi mở game; nền chữ tạm dừng lúc đó.
const isPlaying = () => document.body.classList.contains('playing')

export function App() {
  const glyphs = useRef<{ recolor(): void; stop(): void } | null>(null)
  const recolor = useCallback(() => glyphs.current?.recolor(), [])

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

  return <Home openIds={NO_OPEN} refreshKey={0} onThemeApplied={recolor} />
}