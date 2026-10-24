import { describe, expect, it } from 'vitest'
import { GAMES } from '../games/catalog'
import { buildTodayTiles } from './todayTiles'
import { emptySd, getI18n, sum } from './testUtil'

const now = new Date(2026, 9, 20, 10, 0) // 20/10/2026
const base = () => ({ sd: emptySd(), xq: { level: null }, rec: {}, sums: {}, now, i18n: getI18n() })
const ids = (tiles: { game: { id: string } }[]) => tiles.map((x) => x.game.id)
// Mọi game có đề hằng ngày (lấy từ danh mục, để game daily mới thêm không làm hỏng test).
const DAILY_IDS = GAMES.filter((g) => g.daily).map((g) => g.id)

describe('buildTodayTiles', () => {
  it('không dữ liệu: tối đa 3 thẻ, Sudoku hằng ngày đứng đầu rồi đến các game có đề hằng ngày chưa mở', () => {
    const tiles = buildTodayTiles(base())
    expect(tiles).toHaveLength(3)
    expect(tiles[0]).toMatchObject({ badge: 'daily', game: { id: 'sudoku' } })
    expect(tiles.map((x) => x.badge)).toEqual(['daily', 'daily', 'daily'])
  })

  it('ô "Thử game mới" chỉ có khi còn game thêm trong 14 ngày mà chưa chơi', () => {
    // Ẩn mọi game có đề hằng ngày để chỗ trống cho các ô phụ.
    const hiddenIds = new Set(['sudoku', ...DAILY_IDS])
    const fresh = buildTodayTiles({ ...base(), hiddenIds })
    expect(fresh.some((x) => x.badge === 'new')).toBe(true)
    const later = buildTodayTiles({ ...base(), now: new Date(2026, 11, 1, 10, 0), hiddenIds })
    expect(later.some((x) => x.badge === 'new')).toBe(false)
  })

  it('game có daily nhưng hôm nay chưa mở: thẻ daily với tiêu đề loc(g.daily)', () => {
    const tiles = buildTodayTiles(base())
    const mines = tiles.find((x) => x.game.id === 'minesweeper')!
    expect(mines.badge).toBe('daily')
    expect(mines.title).toEqual({ text: 'One shared board for everyone' })
  })

  it('có 2 ván dở: hai thẻ play đứng đầu, mới hơn trước', () => {
    const sums = {
      co9o: sum({ updatedAt: 100, resume: { title: 'A' } }),
      covua: sum({ updatedAt: 200, resume: { title: 'B' } }),
    }
    const tiles = buildTodayTiles({ ...base(), sums })
    expect(ids(tiles).slice(0, 2)).toEqual(['covua', 'co9o'])
    expect(tiles[0].badge).toBe('play')
    expect(tiles[1].badge).toBe('play')
  })

  it('đề đã xong (done) xếp sau các thẻ daily chưa làm', () => {
    const today = '2026-10-20'
    // Mọi game có đề hằng ngày đã làm, trừ Sudoku và Xếp Bài.
    const sums = Object.fromEntries(
      DAILY_IDS.filter((id) => id !== 'sudoku' && id !== 'xepbai').map((id) => [id, sum({ daily: { date: today, done: true } })]),
    )
    const tiles = buildTodayTiles({ ...base(), sums })
    expect(tiles.map((x) => [x.game.id, x.badge])).toEqual([
      ['sudoku', 'daily'], ['xepbai', 'daily'], ['minesweeper', 'done'],
    ])
  })

  it('Sudoku hôm nay đã làm: badge done, không đứng trước các thẻ daily chưa làm', () => {
    const sd = { ...emptySd(), today: { diff: 'easy', time: 300 } }
    const tiles = buildTodayTiles({ ...base(), sd })
    expect(ids(tiles)).not.toContain('sudoku')
  })

  it('hiddenIds bỏ ô của game ẩn, ô khác lấp chỗ', () => {
    const sums = { co9o: sum({ updatedAt: 1, resume: { title: 'A' } }) }
    const tiles = buildTodayTiles({ ...base(), sums, hiddenIds: new Set(['sudoku', 'co9o']) })
    expect(ids(tiles)).not.toContain('sudoku')
    expect(ids(tiles)).not.toContain('co9o')
    expect(tiles).toHaveLength(3)
  })

  it('resume.pct 1.7 → bar 1; resume.title là text, không phải html', () => {
    const sums = { co9o: sum({ updatedAt: 1, resume: { title: '<b>x</b>', detail: 'd', pct: 1.7 } }) }
    const [first] = buildTodayTiles({ ...base(), sums })
    expect(first.bar).toBe(1)
    expect(first.title).toEqual({ text: '<b>x</b>' })
    expect(first.meta).toEqual({ text: 'd' })
  })
})