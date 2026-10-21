import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountWith } from '../events/testUtil'
import { createFakeApi } from '../server/fakeApi'
import type { Collection, GameMeta } from '../server/types'
import { CollectionRows } from './CollectionRows'

const meta = (id: string, hidden = false): GameMeta => ({
  id,
  metric: 'score_high',
  hidden,
  modes: [{ key: 'classic', label: { en: 'Classic', vi: 'Cổ điển' } }],
})
const col = (over: Partial<Collection> = {}): Collection => ({
  id: 'c1',
  title: { en: 'Quick games', vi: 'Game nhanh' },
  gameIds: ['2048', 'sudoku'],
  startsAt: '2020-01-01T00:00:00Z',
  endsAt: null,
  sort: 1,
  ...over,
})
const GAMES = [meta('2048'), meta('sudoku'), meta('minesweeper')]

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('CollectionRows', () => {
  it('hai bộ đúng thứ tự sort, game đúng thứ tự gameIds, link tới trang giới thiệu', async () => {
    const api = createFakeApi({
      games: GAMES,
      collections: [
        col({ id: 'b', title: { en: 'Second' }, sort: 2, gameIds: ['sudoku', '2048'] }),
        col({ id: 'a', title: { en: 'First' }, sort: 1, gameIds: ['2048', 'minesweeper'] }),
      ],
    })
    const { container } = mountWith(api, <CollectionRows />)
    await screen.findByRole('heading', { name: 'First' })
    const sections = container.querySelectorAll('section')
    expect(sections).toHaveLength(2)
    expect([...sections].map((s) => s.querySelector('h2')!.textContent)).toEqual(['First', 'Second'])
    const hrefs = (s: Element) => [...s.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs(sections[0])).toEqual(['#/game/2048', '#/game/minesweeper'])
    expect(hrefs(sections[1])).toEqual(['#/game/sudoku', '#/game/2048'])
  })

  it('tên game theo ngôn ngữ', async () => {
    localStorage.setItem('playnine-lang', 'vi')
    const api = createFakeApi({ games: GAMES, collections: [col({ gameIds: ['minesweeper'] })] })
    mountWith(api, <CollectionRows />)
    expect(await screen.findByRole('link', { name: /Dò Mìn/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Game nhanh' })).toBeTruthy()
  })

  it('game ẩn và id lạ bị bỏ; bộ chỉ còn game ẩn thì không hiện', async () => {
    const api = createFakeApi({
      games: [meta('2048', true), meta('sudoku'), meta('minesweeper')],
      collections: [
        col({ id: 'a', title: { en: 'Mixed' }, gameIds: ['2048', 'nope', 'sudoku'] }),
        col({ id: 'b', title: { en: 'Only hidden' }, sort: 2, gameIds: ['2048', 'nope'] }),
      ],
    })
    const { container } = mountWith(api, <CollectionRows />)
    await screen.findByRole('heading', { name: 'Mixed' })
    expect(screen.queryByRole('heading', { name: 'Only hidden' })).toBeNull()
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['#/game/sudoku'])
  })

  it('tên bộ chứa HTML hiện dạng text', async () => {
    const evil = '<img src=x onerror=alert(1)>'
    const api = createFakeApi({ games: GAMES, collections: [col({ title: { en: evil } })] })
    const { container } = mountWith(api, <CollectionRows />)
    await screen.findByRole('heading', { name: evil })
    expect(container.querySelector('img[src="x"]')).toBeNull()
  })

  it('không server → không có section', () => {
    const { container } = mountWith(null, <CollectionRows />)
    expect(container.querySelector('section')).toBeNull()
  })

  it('collections lỗi → không có section', async () => {
    const api = createFakeApi({ games: GAMES, collections: [col()] })
    api.fail('collections')
    const { container } = mountWith(api, <CollectionRows />)
    await waitFor(() => expect(api.calls.some((c) => c.method === 'collections')).toBe(true))
    await new Promise((r) => setTimeout(r, 0))
    expect(container.querySelector('section')).toBeNull()
  })
})
