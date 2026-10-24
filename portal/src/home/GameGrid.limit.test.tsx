import { cleanup, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/i18n'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import { emptySd } from './testUtil'
import { GameGrid } from './GameGrid'

// Danh mục giả 30 game: 26 "Alpha", 4 "Beta" (đủ để vượt giới hạn 24 thẻ của trang chủ).
vi.mock('../games/catalog', async (importOriginal) => {
  const real = await importOriginal<typeof import('../games/catalog')>()
  const base = real.gameById('2048')!
  const GAMES = Array.from({ length: 30 }, (_, i) => {
    const word = i < 26 ? 'Alpha' : 'Beta'
    return { ...base, id: 'g' + i, dir: 'g' + i + '/', name: { en: word + ' ' + i, vi: word + ' ' + i }, sub: { en: 's', vi: 's' }, tags: { en: ['x'], vi: ['x'] } }
  })
  return { ...real, GAMES, gameById: (id: string) => GAMES.find((g) => g.id === id) }
})

afterEach(cleanup)

const grid = (props: { query?: string } = {}, api: ReturnType<typeof createFakeApi> | null = null): ReactNode => (
  <I18nProvider>
    <ServerProvider api={api}>
      <GameGrid sd={emptySd()} xq={{ level: null } as never} rec={{}} sums={{}} openIds={new Set()} now={new Date(2027, 0, 1)} limit={24} {...props} />
    </ServerProvider>
  </I18nProvider>
)
const visible = (c: HTMLElement) => c.querySelectorAll('#games > li:not([hidden])')

describe('GameGrid limit', () => {
  it('quá 24 game: chỉ hiện 24 thẻ đầu và nút xem tất cả ghi tổng số', () => {
    const { container } = render(grid())
    expect(visible(container)).toHaveLength(24)
    expect(container.querySelector('#games > li:not([hidden]) a.card')!.getAttribute('href')).toBe('#/game/g0')
    // Thẻ ngoài 24 suất không được dựng (trang chủ nhẹ hơn), không chỉ bị ẩn.
    expect(container.querySelectorAll('#games > li')).toHaveLength(24)
    const more = container.querySelector('a.games-more')!
    expect(more.getAttribute('href')).toBe('#/games')
    expect(more.textContent).toContain('30')
  })

  it('đang tìm kiếm: không giới hạn, không có nút xem tất cả', () => {
    const { container } = render(grid({ query: 'alpha' }))
    expect(visible(container)).toHaveLength(26)
    expect(container.querySelector('a.games-more')).toBeNull()
  })

  it('game bị admin ẩn không chiếm suất trong 24 thẻ', async () => {
    const api = createFakeApi({ games: [{ id: 'g0', metric: 'wins', hidden: true, modes: [] }] })
    const { container } = render(grid({}, api))
    await waitFor(() => expect(container.querySelector('a.card[href="#/game/g0"]')).toBeNull())
    expect(visible(container)).toHaveLength(24)
    expect(container.querySelector('a.games-more')!.textContent).toContain('29')
  })
})
