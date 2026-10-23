import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountWith } from '../events/testUtil'
import { CATS, GAMES } from '../games/catalog'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { Sidebar } from './Sidebar'

const en = (k: string) => DICT.en[k] as string

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('GameMenu', () => {
  it('đang ở #/games: nút Games của sidebar được đánh dấu là trang hiện tại', () => {
    location.hash = '#/games'
    mountWith(createFakeApi({}), <Sidebar />)
    expect(screen.getByRole('button', { name: en('nav.games') })).toHaveAttribute('aria-current', 'page')
    location.hash = ''
  })

  it('nút Games mở menu đủ game theo thể loại; Esc đóng và trả focus về nút', () => {
    mountWith(createFakeApi({}), <Sidebar />)
    const btn = screen.getByRole('button', { name: en('nav.games') })
    btn.focus()
    fireEvent.click(btn)
    const dialog = screen.getByRole('dialog', { name: en('menu.title') })
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    // Thể loại chưa có game thì không có tiêu đề.
    const used = Object.keys(CATS).filter((c) => GAMES.some((g) => g.cat === c))
    expect(within(dialog).getAllByRole('heading', { level: 3 })).toHaveLength(used.length)
    expect(dialog.querySelectorAll('.gmenu-item')).toHaveLength(GAMES.length)
    expect(within(dialog).getByRole('searchbox')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(btn).toHaveFocus()
  })

  it('tìm theo tên (không dấu); chọn game thì đóng menu; nút chơi trỏ tới #/play', () => {
    mountWith(createFakeApi({}), <Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: en('nav.games') }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'sudoku' } })
    const items = dialog.querySelectorAll('.gmenu-item')
    expect(items).toHaveLength(1)
    expect(items[0].querySelector('.gmenu-link')).toHaveAttribute('href', '#/game/sudoku')
    expect(within(items[0] as HTMLElement).getByRole('link', { name: /Play Sudoku/ })).toHaveAttribute('href', '#/play/sudoku')
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'zzzz' } })
    expect(within(dialog).getByText(/No games match/)).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: '' } })
    fireEvent.click(dialog.querySelector('.gmenu-link')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('game bị ẩn không có trong menu', async () => {
    const api = createFakeApi({ games: [{ id: 'sudoku', metric: 'time_low', hidden: true, modes: [] }] })
    mountWith(api, <Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: en('nav.games') }))
    // Danh sách game ẩn tải bất đồng bộ từ server.
    await waitFor(() => expect(screen.getByRole('dialog').querySelector('a[href="#/game/sudoku"]')).toBeNull())
  })
})
