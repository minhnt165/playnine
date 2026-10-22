import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reloadFavorites, useFavoritesSync } from '../data/favorites'
import { mountWith } from '../events/testUtil'
import { gameById } from '../games/catalog'
import { DICT } from '../i18n/dict'
import { I18nProvider } from '../i18n/i18n'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import { FavButton } from './FavButton'
import { FavoriteRow } from './FavoriteRow'
import { ScrollTop } from './ScrollTop'

const en = (k: string) => DICT.en[k] as string
const USER = { id: 'u1', displayName: 'An', avatarUrl: null }
const sudoku = gameById('sudoku')!
const caro = gameById('caro')!

function Synced() {
  useFavoritesSync()
  return <FavoriteRow />
}

beforeEach(() => {
  localStorage.clear()
  reloadFavorites()
})
afterEach(cleanup)

describe('Game yêu thích', () => {
  it('chưa đăng nhập: bấm trái tim lưu trên máy, hàng yêu thích hiện game mới thêm trước; bấm lại thì bỏ', () => {
    mountWith(null, (
      <>
        <FavButton game={sudoku} />
        <FavButton game={caro} />
        <FavoriteRow />
      </>
    ))
    expect(screen.queryByRole('heading', { name: en('fav.title') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add Sudoku to favorites' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Gomoku to favorites' }))
    expect(JSON.parse(localStorage.getItem('playnine-favorites-v1')!)).toEqual(['caro', 'sudoku'])
    const row = screen.getByRole('heading', { name: en('fav.title') }).closest('section')!
    expect([...row.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['#/game/caro', '#/game/sudoku'])
    const btn = screen.getByRole('button', { name: 'Remove Sudoku from favorites' })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn)
    expect(JSON.parse(localStorage.getItem('playnine-favorites-v1')!)).toEqual(['caro'])
  })

  it('đã đăng nhập: bấm gọi setFavorite; lỗi server thì trả lại như cũ', async () => {
    const api = createFakeApi({ user: USER })
    mountWith(api, <FavButton game={sudoku} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Sudoku to favorites' }))
    await waitFor(() => expect(api.state.favorites).toEqual(['sudoku']))
    api.fail('setFavorite')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sudoku from favorites' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Sudoku from favorites' })).toHaveAttribute('aria-pressed', 'true'))
  })

  it('đăng nhập: gộp danh sách trên máy với server và đẩy phần thiếu lên', async () => {
    localStorage.setItem('playnine-favorites-v1', JSON.stringify(['caro']))
    reloadFavorites()
    const api = createFakeApi({ user: USER, favorites: ['sudoku'] })
    render(
      <I18nProvider>
        <ServerProvider api={api}>
          <Synced />
        </ServerProvider>
      </I18nProvider>,
    )
    await waitFor(() => expect(JSON.parse(localStorage.getItem('playnine-favorites-v1')!)).toEqual(['caro', 'sudoku']))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'setFavorite' && c.args[0] === 'caro' && c.args[1] === true)).toBe(true))
    const row = screen.getByRole('heading', { name: en('fav.title') }).closest('section')!
    expect(within(row).getAllByRole('link')).toHaveLength(2)
  })

  it('game bị ẩn không hiện trong hàng yêu thích', async () => {
    localStorage.setItem('playnine-favorites-v1', JSON.stringify(['sudoku', 'caro']))
    reloadFavorites()
    mountWith(createFakeApi({ games: [{ id: 'sudoku', metric: 'time_low', hidden: true, modes: [] }] }), <FavoriteRow />)
    await waitFor(() => expect(document.querySelector('a[href="#/game/sudoku"]')).toBeNull())
    expect(document.querySelector('a[href="#/game/caro"]')).not.toBeNull()
  })
})

describe('ScrollTop', () => {
  it('ẩn ở đầu trang, hiện khi cuộn sâu, bấm thì cuộn lên đầu', async () => {
    const calls: unknown[] = []
    window.scrollTo = ((o: unknown) => calls.push(o)) as typeof window.scrollTo
    const { container } = mountWith(null, <ScrollTop />)
    const btn = container.querySelector<HTMLButtonElement>('.scroll-top')!
    expect(btn).toHaveAttribute('aria-label', en('nav.top'))
    expect(btn.classList.contains('on')).toBe(false)
    expect(btn).toHaveAttribute('tabindex', '-1')
    await act(async () => {
      Object.defineProperty(window, 'scrollY', { value: window.innerHeight * 3, configurable: true })
      window.dispatchEvent(new Event('scroll'))
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })
    expect(btn.classList.contains('on')).toBe(true)
    fireEvent.click(btn)
    expect(calls[0]).toMatchObject({ top: 0 })
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })
})
