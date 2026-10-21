import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AdminFeed } from '../admin/AdminFeed'
import { mountWith } from '../events/testUtil'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import type { FeedItem } from '../server/types'
import { GameNewsFeed, timeAgo } from './GameNewsFeed'
import { NewsPage } from './NewsPage'

const en = (k: string) => DICT.en[k] as string
const HOUR = 3_600_000
const item = (id: string, over: Partial<FeedItem> = {}): FeedItem => ({
  id, url: 'https://news.com/' + id, source: 'IGN', lang: 'en', title: 'Title ' + id, summary: 'Sum ' + id,
  imageUrl: 'https://img.com/' + id + '.jpg', publishedAt: new Date(Date.now() - HOUR).toISOString(), hidden: false, ...over,
})

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('timeAgo', () => {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const now = Date.parse('2026-10-21T12:00:00Z')
  it('phút, giờ, ngày; quá 7 ngày thì hiện ngày', () => {
    expect(timeAgo('2026-10-21T11:55:00Z', now, 'en', fmt)).toBe('5 minutes ago')
    expect(timeAgo('2026-10-21T09:00:00Z', now, 'en', fmt)).toBe('3 hours ago')
    expect(timeAgo('2026-10-19T12:00:00Z', now, 'en', fmt)).toBe('2 days ago')
    expect(timeAgo('2026-10-01T12:00:00Z', now, 'en', fmt)).toBe('2026-10-01')
  })
})

describe('GameNewsFeed', () => {
  it('thẻ mở bài gốc ở tab mới, có nguồn, ảnh; tin đã ẩn không hiện', async () => {
    const api = createFakeApi({ feed: [item('a'), item('b', { hidden: true })] })
    const { container } = mountWith(api, <GameNewsFeed />)
    const link = (await screen.findByText('Title a')).closest('a')!
    expect(link).toHaveAttribute('href', 'https://news.com/a')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(within(link).getByText('IGN')).toBeInTheDocument()
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://img.com/a.jpg')
    expect(screen.queryByText('Title b')).toBeNull()
    expect(api.calls.find((c) => c.method === 'newsFeed')!.args).toEqual([60])
    // Ảnh lỗi: thay bằng chữ cái đầu của nguồn.
    fireEvent.error(link.querySelector('img')!)
    expect(link.querySelector('img')).toBeNull()
    expect(container.querySelector('.feed-thumb-mark')!.textContent).toBe('I')
  })

  it('lọc theo ngôn ngữ: mặc định theo ngôn ngữ cổng nếu có tin; chỉ hiện nút của ngôn ngữ có tin', async () => {
    const api = createFakeApi({ feed: [item('a'), item('v', { lang: 'vi', source: 'GameK', title: 'Tin Việt' })] })
    mountWith(api, <GameNewsFeed />)
    await screen.findByText('Title a')
    expect(screen.queryByText('Tin Việt')).toBeNull()
    expect(screen.getByRole('button', { name: en('feed.en') })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: en('feed.vi') }))
    expect(screen.getByText('Tin Việt')).toBeInTheDocument()
    expect(screen.queryByText('Title a')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en('feed.all') }))
    expect(screen.getByText('Title a')).toBeInTheDocument()
    expect(screen.getByText('Tin Việt')).toBeInTheDocument()
    cleanup()
    mountWith(createFakeApi({ feed: [item('v', { lang: 'vi', title: 'Chỉ tiếng Việt' })] }), <GameNewsFeed />)
    expect(await screen.findByText('Chỉ tiếng Việt')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: en('feed.en') })).toBeNull()
  })

  it('12 tin một lượt, "Xem thêm" hiện tiếp', async () => {
    const api = createFakeApi({ feed: Array.from({ length: 15 }, (_, i) => item('n' + i, { publishedAt: new Date(Date.now() - i * HOUR).toISOString() })) })
    const { container } = mountWith(api, <GameNewsFeed />)
    await screen.findByText('Title n0')
    expect(container.querySelectorAll('.feed-card')).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: en('feed.more') }))
    expect(container.querySelectorAll('.feed-card')).toHaveLength(15)
    expect(screen.queryByRole('button', { name: en('feed.more') })).toBeNull()
  })

  it('không có tin thì ẩn cả mục; lỗi thì báo feed.error; trang tin tức có mục này', async () => {
    const empty = mountWith(createFakeApi({}), <GameNewsFeed />)
    await waitFor(() => expect(empty.container.innerHTML).toBe(''))
    cleanup()
    const api = createFakeApi({})
    api.fail('newsFeed')
    mountWith(api, <GameNewsFeed />)
    expect(await screen.findByText(en('feed.error'))).toBeInTheDocument()
    cleanup()
    mountWith(createFakeApi({ feed: [item('a')] }), <NewsPage />)
    expect(await screen.findByRole('heading', { name: en('feed.title') })).toBeInTheDocument()
  })
})

describe('AdminFeed', () => {
  it('liệt kê cả tin đã ẩn, ẩn/hiện gọi adminHideNews', async () => {
    const api = createFakeApi({ feed: [item('a'), item('b', { hidden: true })] })
    const { container } = mountWith(api, <AdminFeed />)
    await screen.findByText('Title a')
    expect(container.querySelector('[data-feed="b"]')!.textContent).toContain(en('admin.feed.hidden'))
    fireEvent.click(within(container.querySelector<HTMLElement>('[data-feed="a"]')!).getByRole('button', { name: en('admin.feed.hide') }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'adminHideNews' && c.args[0] === 'a' && c.args[1] === true)).toBe(true))
    await waitFor(() => expect(container.querySelector('[data-feed="a"]')!.classList.contains('admin-item-off')).toBe(true))
    fireEvent.click(within(container.querySelector<HTMLElement>('[data-feed="b"]')!).getByRole('button', { name: en('admin.feed.show') }))
    await waitFor(() => expect(api.state.feed.find((f) => f.id === 'b')!.hidden).toBe(false))
  })

  it('chưa có tin: admin.feed.empty; lỗi ẩn: báo lỗi', async () => {
    mountWith(createFakeApi({}), <AdminFeed />)
    expect(await screen.findByText(en('admin.feed.empty'))).toBeInTheDocument()
    cleanup()
    const api = createFakeApi({ feed: [item('a')] })
    api.fail('adminHideNews', new Error('forbidden'))
    mountWith(api, <AdminFeed />)
    fireEvent.click(await screen.findByRole('button', { name: en('admin.feed.hide') }))
    expect(await screen.findByRole('alert')).toHaveTextContent('forbidden')
  })
})
