import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameRating } from '../detail/GameRating'
import { mountWith } from '../events/testUtil'
import { GAMES } from '../games/catalog'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import type { TopRow } from '../server/types'
import { MostPlayed, mostPlayed } from './MostPlayed'
import { TopWeek } from './TopWeek'

const en = (k: string) => DICT.en[k] as string
const top = (gameId: string, rank: number, name: string, value: number): TopRow => ({
  gameId, mode: 'points', rank, userId: gameId + rank, displayName: name, avatarUrl: null, value, achievedAt: '',
})

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('mostPlayed', () => {
  it('xếp theo lượt chơi giảm dần, bỏ game 0 lượt, tối đa n', () => {
    const list = mostPlayed(GAMES, { '2048': 30, sudoku: 50, caro: 0, covua: 10 }, 2)
    expect(list.map((x) => x.game.id)).toEqual(['sudoku', '2048'])
  })
})

describe('MostPlayed', () => {
  it('hiện số hạng 1, 2… và lượt chơi; chưa có số liệu thì không hiện', () => {
    const { container } = mountWith(null, <MostPlayed totals={{ sudoku: 1500, '2048': 20 }} />)
    expect([...container.querySelectorAll('.most-rank')].map((x) => x.textContent)).toEqual(['1', '2'])
    expect(container.querySelector('.most-item')!.getAttribute('href')).toBe('#/game/sudoku')
    expect(container.textContent).toContain('1.5K plays')
    cleanup()
    expect(mountWith(null, <MostPlayed totals={{}} />).container.innerHTML).toBe('')
  })
})

describe('TopWeek', () => {
  it('nhóm theo game, hiện điểm; không có dữ liệu thì không hiện', async () => {
    const api = createFakeApi({ topBoards: { week: [top('2048', 2, 'Bình', 40), top('2048', 1, 'An', 90), top('sudoku', 1, 'Chi', 1)] } })
    const { container } = mountWith(api, <TopWeek />)
    await screen.findByText('An')
    const cards = container.querySelectorAll('.top-card')
    // Theo thứ tự danh mục (Sudoku trước 2048); trong mỗi game theo hạng.
    expect([...cards].map((c) => c.querySelector('.top-game')!.textContent)).toEqual(['Sudoku', '2048'])
    expect([...cards[1].querySelectorAll('ol a')].map((a) => a.textContent)).toEqual(['An', 'Bình'])
    expect(cards[1].textContent).toContain('90 pts')
    expect(api.calls.find((c) => c.method === 'topBoards')!.args).toEqual(['week', 3])
    cleanup()
    const empty = mountWith(createFakeApi({}), <TopWeek />)
    await waitFor(() => expect(empty.container.querySelector('.top-week')).toBeNull())
  })
})

describe('GameRating', () => {
  it('hiện trung bình, chấm sao gọi rateGame và bỏ đánh giá', async () => {
    const api = createFakeApi({ user: { id: 'u1', displayName: 'An', avatarUrl: null }, ratings: { '2048': { average: 4.3, count: 12 } } })
    mountWith(api, <GameRating gameId="2048" />)
    expect(await screen.findByText('4.3')).toBeInTheDocument()
    expect(screen.getByText('12 ratings')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'rateGame' && c.args[1] === 4)).toBe(true))
    await waitFor(() => expect(screen.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(screen.getByRole('button', { name: en('rate.clear') }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'rateGame' && c.args[1] === null)).toBe(true))
  })

  it('chưa đăng nhập: không có sao để chấm; lỗi lưu thì trả lại và báo lỗi', async () => {
    mountWith(createFakeApi({}), <GameRating gameId="2048" />)
    expect(await screen.findByText(en('rate.signIn'))).toBeInTheDocument()
    expect(screen.queryByRole('radio')).toBeNull()
    cleanup()
    const api = createFakeApi({ user: { id: 'u1', displayName: 'An', avatarUrl: null } })
    api.fail('rateGame')
    mountWith(api, <GameRating gameId="2048" />)
    fireEvent.click(await screen.findByRole('radio', { name: '5 stars' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(en('rate.error'))
    expect(screen.getByRole('radio', { name: '5 stars' })).toHaveAttribute('aria-checked', 'false')
  })
})
