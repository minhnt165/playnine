import { useCallback, useEffect, useState } from 'react'
import { readRaw, write } from '../lib/storage'

export const THEME_KEY = 'game-portal-theme-v1'
export type Theme = 'auto' | 'light' | 'dark'
const ORDER: Theme[] = ['auto', 'light', 'dark']

const normTheme = (v: string | null): Theme => (v === 'light' || v === 'dark' ? v : 'auto')

/**
 * Giao diện sáng/tối/tự động. `onApplied` chạy sau mỗi lần áp giao diện (sau khi --bg đã tính xong);
 * Task 6 truyền glyph `recolor()` vào đây.
 */
export function useTheme(onApplied?: () => void): { theme: Theme; cycle(): void } {
  const [theme, setTheme] = useState<Theme>(() => normTheme(readRaw(THEME_KEY)))

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    const raf = requestAnimationFrame(() => {
      const meta = document.getElementById('theme-color')
      if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim())
      onApplied?.()
    })
    return () => cancelAnimationFrame(raf)
  }, [theme, onApplied])

  // Chế độ auto: theo đổi giao diện hệ điều hành thì tính lại màu.
  useEffect(() => {
    if (theme !== 'auto' || typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const meta = document.getElementById('theme-color')
      if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())
      onApplied?.()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme, onApplied])

  const cycle = useCallback(() => {
    setTheme((cur) => {
      const next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]
      write(THEME_KEY, next)
      return next
    })
  }, [])

  return { theme, cycle }
}