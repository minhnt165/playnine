import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountWith } from '../events/testUtil'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import type { Post } from '../server/types'
import { NewsPage } from './NewsPage'
import { PostPage } from './PostPage'

const en = (k: string) => DICT.en[k] as string
const post = (over: Partial<Post> = {}): Post => ({
  id: 'p1', slug: 'meo-sudoku', title: { en: 'Sudoku tips', vi: 'Mẹo Sudoku' }, summary: { en: 'Five techniques' },
  body: { en: '## Singles\nLook for **one** spot.\n\n- Pairs\n- Pointing' }, gameId: 'sudoku', tags: ['tips'], pinned: false,
  publishedAt: '2026-10-16T00:00:00Z', updatedAt: '2026-10-16T00:00:00Z', ...over,
})

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('NewsPage', () => {
  it('bài ghim làm thẻ lớn đầu tiên, bài nháp và hẹn giờ không hiện', async () => {
    const api = createFakeApi({
      posts: [
        post(),
        post({ id: 'p2', slug: 'ghim', title: { en: 'Pinned news' }, pinned: true, publishedAt: '2026-10-10T00:00:00Z' }),
        post({ id: 'p3', slug: 'nhap', title: { en: 'Draft' }, publishedAt: null }),
        post({ id: 'p4', slug: 'sau', title: { en: 'Future' }, publishedAt: '2999-01-01T00:00:00Z' }),
      ],
    })
    const { container } = mountWith(api, <NewsPage />)
    expect(await screen.findByText('Pinned news')).toBeInTheDocument()
    const cards = [...container.querySelectorAll('a.post-card')]
    expect(cards.map((a) => a.getAttribute('href'))).toEqual(['#/news/ghim', '#/news/meo-sudoku'])
    expect(cards[0].classList.contains('featured')).toBe(true)
    expect(screen.queryByText('Draft')).toBeNull()
    expect(screen.queryByText('Future')).toBeNull()
  })

  it('chưa có bài: báo news.none; lỗi: news.error; không server: news.unavailable', async () => {
    mountWith(createFakeApi({}), <NewsPage />)
    expect(await screen.findByText(en('news.none'))).toBeInTheDocument()
    cleanup()
    const api = createFakeApi({})
    api.fail('posts')
    mountWith(api, <NewsPage />)
    expect(await screen.findByText(en('news.error'))).toBeInTheDocument()
    cleanup()
    mountWith(null, <NewsPage />)
    expect(screen.getByText(en('news.unavailable'))).toBeInTheDocument()
  })
})

describe('PostPage', () => {
  it('hiện tiêu đề, nội dung markdown, nút chơi game và bài khác; đặt tiêu đề tab', async () => {
    const api = createFakeApi({ posts: [post(), post({ id: 'p2', slug: 'khac', title: { en: 'Other post' } })] })
    const { container } = mountWith(api, <PostPage slug="meo-sudoku" />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Sudoku tips' })).toBeInTheDocument()
    expect(container.querySelector('.post-content h2')!.textContent).toBe('Singles')
    expect(container.querySelector('.post-content strong')!.textContent).toBe('one')
    expect(container.querySelectorAll('.post-content li')).toHaveLength(2)
    expect(screen.getByRole('link', { name: new RegExp(en('detail.play')) })).toHaveAttribute('href', '#/play/sudoku')
    expect(screen.getByText('Other post').closest('a')).toHaveAttribute('href', '#/news/khac')
    expect(document.title).toBe('Sudoku tips · PlayNine')
  })

  it('slug không có hoặc chưa đăng: news.notFound', async () => {
    mountWith(createFakeApi({ posts: [post({ publishedAt: null })] }), <PostPage slug="meo-sudoku" />)
    expect(await screen.findByText(en('news.notFound'))).toBeInTheDocument()
  })
})
