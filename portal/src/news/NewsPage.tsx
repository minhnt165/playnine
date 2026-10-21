import { useEffect, useState } from 'react'
import { Topbar } from '../home/Topbar'
import { MostPlayed } from '../home/MostPlayed'
import { usePlayTotals } from '../home/usePlayTotals'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'
import type { Post } from '../server/types'
import { GameNewsFeed } from './GameNewsFeed'
import { PostCard } from './PostCard'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; posts: Post[] }

/** Trang #/news: dải game đang hot (tự động theo lượt chơi), các bài admin đã đăng (bài ghim/mới nhất làm thẻ lớn)
 * và tin game lấy tự động từ RSS. */
export function NewsPage({ onThemeApplied }: { onThemeApplied?: () => void }) {
  const { t } = useI18n()
  const { api } = useServer()
  const totals = usePlayTotals()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const prev = document.title
    document.title = t('news.title') + ' · PlayNine'
    return () => {
      document.title = prev
    }
  }, [t])

  useEffect(() => {
    if (!api) return
    let alive = true
    api.posts().then(
      (posts) => alive && setState({ status: 'ready', posts }),
      () => alive && setState({ status: 'error' }),
    )
    return () => {
      alive = false
    }
  }, [api])

  let body
  if (!api) body = <p className="lb-note">{t('news.unavailable')}</p>
  else if (state.status === 'loading') body = null
  else if (state.status === 'error') body = <p className="lb-note">{t('news.error')}</p>
  else if (state.posts.length === 0) body = <p className="lb-note">{t('news.none')}</p>
  else {
    const [first, ...rest] = state.posts
    body = (
      <section aria-label={t('news.latest')}>
        <div className="section-head">
          <h2>{t('news.latest')}</h2>
        </div>
        <PostCard post={first} featured />
        {rest.length > 0 && (
          <ul className="post-grid">
            {rest.map((p) => (
              <li key={p.id}>
                <PostCard post={p} />
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <div className="wrap" data-page="news">
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="profile news">
        <header className="news-head">
          <h1 className="ev-heading">{t('news.title')}</h1>
          <p className="news-tagline">{t('news.tagline')}</p>
        </header>
        <MostPlayed totals={totals} title={t('news.hot')} n={4} />
        {body}
        {api && <GameNewsFeed />}
      </main>
    </div>
  )
}
