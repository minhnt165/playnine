import { useEffect } from 'react'
import { GAMES } from '../games/catalog'
import { playHref } from './route'

/** Phím tắt ở trang chủ: 1-9 mở game, t đổi giao diện, l đổi ngôn ngữ (bấm nút của thanh trên như cổng cũ), / tới ô tìm game. */
export function useShortcuts(playing: boolean): void {
  useEffect(() => {
    if (playing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof Element && e.target.closest('input, textarea')) return
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= Math.min(9, GAMES.length)) {
        location.hash = playHref(GAMES[n - 1])
      } else if (e.key === 't' || e.key === 'T') {
        document.getElementById('theme-btn')?.click()
      } else if (e.key === 'l' || e.key === 'L') {
        document.getElementById('lang-btn')?.click()
      } else if (e.key === '/') {
        const search = document.getElementById('game-search')
        if (search) {
          e.preventDefault()
          search.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing])
}
