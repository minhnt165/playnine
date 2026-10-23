import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAMES } from '../games/catalog'
import { DICT } from '../i18n/dict'
import { I18nProvider } from '../i18n/i18n'
import { ServerProvider } from '../server/ServerProvider'
import { GamesPage } from './GamesPage'

const en = (k: string) => DICT.en[k] as string

const renderPage = () =>
  render(
    <I18nProvider>
      <ServerProvider api={null}>
        <GamesPage />
      </ServerProvider>
    </I18nProvider>,
  )
const visibleNames = (c: HTMLElement) => [...c.querySelectorAll('#games > li:not([hidden]) h3')].map((h) => h.textContent)

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('GamesPage', () => {
  it('hiện đủ mọi game, không có nút "xem tất cả", đặt tiêu đề trang', async () => {
    const { container } = renderPage()
    expect(container.querySelectorAll('#games > li:not([hidden])')).toHaveLength(GAMES.length)
    expect(container.querySelector('a.games-more')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: en('games.all') })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe(en('games.all') + ' · PlayNine'))
  })

  it('sắp xếp theo tên: thẻ đầu là game có tên đứng đầu bảng chữ cái; lựa chọn được nhớ', () => {
    const { container } = renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: en('games.sort') }), { target: { value: 'name' } })
    const names = GAMES.map((g) => g.name.en).sort((a, b) => a.localeCompare(b, 'en-US', { sensitivity: 'base' }))
    expect(visibleNames(container)[0]).toBe(names[0])
    expect(localStorage.getItem('game-portal-sort-v1')).toBe('name')
  })

  it('lọc thể loại versus: chỉ còn game đối kháng', () => {
    const { container } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: new RegExp('^' + en('cat.versus')) }))
    expect(visibleNames(container)).toHaveLength(GAMES.filter((g) => g.cat === 'versus').length)
  })

  it('ô tìm kiếm lọc theo tên', () => {
    const { container } = renderPage()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sudoku' } })
    expect(visibleNames(container)).toEqual(['Sudoku'])
  })
})
