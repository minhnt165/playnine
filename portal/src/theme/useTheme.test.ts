import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_KEY, useTheme } from './useTheme'

beforeEach(() => {
  localStorage.clear()
  document.head.innerHTML = '<meta name="theme-color" id="theme-color" content="#000">'
  document.documentElement.style.setProperty('--bg', ' #abcdef ')
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0)
    return 0
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.removeProperty('--bg')
})

describe('useTheme', () => {
  it('falls back to auto for an unknown stored value', () => {
    localStorage.setItem(THEME_KEY, 'neon')
    expect(renderHook(() => useTheme()).result.current.theme).toBe('auto')
  })

  it('cycles auto -> light -> dark -> auto, persisting and toggling data-theme', () => {
    const { result } = renderHook(() => useTheme())
    const root = document.documentElement
    act(() => result.current.cycle())
    expect(result.current.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(root.getAttribute('data-theme')).toBe('light')
    act(() => result.current.cycle())
    expect(result.current.theme).toBe('dark')
    expect(root.getAttribute('data-theme')).toBe('dark')
    act(() => result.current.cycle())
    expect(result.current.theme).toBe('auto')
    expect(localStorage.getItem(THEME_KEY)).toBe('auto')
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it('updates meta#theme-color from computed --bg and calls onApplied', () => {
    const onApplied = vi.fn()
    const { result } = renderHook(() => useTheme(onApplied))
    act(() => result.current.cycle())
    expect(document.getElementById('theme-color')?.getAttribute('content')).toBe('#abcdef')
    expect(onApplied).toHaveBeenCalled()
  })
})