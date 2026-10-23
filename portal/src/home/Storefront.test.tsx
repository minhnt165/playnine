import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAMES } from '../games/catalog'
import { DICT } from '../i18n/dict'
import { I18nProvider } from '../i18n/i18n'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import { Home } from './Home'

const en = (k: string) => DICT.en[k] as string

const renderHome = (api: ReturnType<typeof createFakeApi> | null = null) =>
  render(
    <I18nProvider>
      <ServerProvider api={api}>
        <Home openIds={new Set()} refreshKey={0} />
      </ServerProvider>
    </I18nProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.classList.remove('revealed')
})

describe('Giao diện cửa hàng', () => {
  it('băng nổi bật có nút chơi và chọn được game nổi bật khác', () => {
    const { container } = renderHome()
    const spot = container.querySelector<HTMLElement>('.spotlight')!
    const playHref = () => within(spot).getByRole('link', { name: new RegExp(en('detail.play')) }).getAttribute('href')
    const first = playHref()
    const thumbs = within(spot).getAllByRole('button')
    expect(thumbs).toHaveLength(5)
    fireEvent.click(thumbs[1])
    expect(thumbs[1]).toHaveAttribute('aria-pressed', 'true')
    expect(playHref()).not.toBe(first)
  })

  it('gõ tìm kiếm: chỉ còn kết quả, ẩn thẻ không khớp; xóa thì hiện lại', () => {
    const { container } = renderHome()
    fireEvent.change(screen.getByRole('searchbox', { name: en('games.search') }), { target: { value: 'sudoku' } })
    expect(container.querySelector('.spotlight')).toBeNull()
    expect(container.querySelectorAll('#games > li:not([hidden])')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Results for “sudoku”' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    fireEvent.click(screen.getByRole('button', { name: en('games.clear') }))
    expect(container.querySelector('.spotlight')).not.toBeNull()
    expect(container.querySelectorAll('#games > li:not([hidden])')).toHaveLength(GAMES.length)
  })

  it('sidebar liệt kê game chơi gần đây, mới nhất trước', () => {
    localStorage.setItem('game-portal-recent-v1', JSON.stringify({ sudoku: 100, '2048': 200 }))
    const { container } = renderHome()
    const links = [...container.querySelectorAll('.sidenav-recent a')].map((a) => a.getAttribute('href'))
    expect(links).toEqual(['#/game/2048', '#/game/sudoku'])
  })

  it('có server: sidebar có mục Sự kiện; không server thì không', () => {
    renderHome(createFakeApi({}))
    expect(within(screen.getByRole('navigation', { name: en('nav.label') })).getByRole('link', { name: en('ev.title') })).toHaveAttribute('href', '#/events')
    cleanup()
    renderHome()
    expect(within(screen.getByRole('navigation', { name: en('nav.label') })).queryByRole('link', { name: en('ev.title') })).toBeNull()
  })
})
