import { useEffect, useState } from 'react'
import { localized } from '../events/model'
import { gameById } from '../games/catalog'
import { Topbar } from '../home/Topbar'
import { useI18n } from '../i18n/i18n'
import { detailHref, playHref } from '../player/route'
import { useServer } from '../server/ServerProvider'
import type { Post } from '../server/types'
import { renderLite } from './markdown'
import { PostCard, PostCover, usePostDate } from './PostCard'

const MORE = 3

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; post: Post | null; more: Post[] }

/** Trang #/news/<slug>: bài viết, nút chơi game gắn với bài và vài bài khác. */
export function PostPage({ slug, onThemeApplied }: { slug: string; onThemeApplied?: () => void }) {
  const { t, lang, loc } = useI18n()
  const { api } = useServer()
  const date = usePostDate()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!api) return
    let alive = true
    setState({ status: 'loading' })
    // Danh sách bài khác lỗi thì chỉ ẩn mục đó.
    const others = api.posts().catch((): Post[] => [])
    Promise.all([api.post(slug), others]).then(
      ([post, list]) => alive && setState({ status: 'ready', post, more: list.filter((p) => p.slug !== slug).slice(0, MORE) }),
      () => alive && setState({ status: 'error' }),
    )
    // Mở bài từ giữa danh sách: về đầu trang.
    const el = document.scrollingElement ?? document.documentElement
    el.scrollTop = 0
    return () => {
      alive = false
    }
  }, [api, slug])

  const post = state.status === 'ready' ? state.post : null
  const title = post ? localized(post.title, lang) : ''
  useEffect(() => {
    if (!title) return
    const prev = document.title
    document.title = title + ' · PlayNine'
    return () => {
      document.title = prev
    }
  }, [title])

  let body
  if (!api) body = <p className="lb-note">{t('news.unavailable')}</p>
  else if (state.status === 'loading') body = null
  else if (state.status === 'error') body = <p className="lb-note">{t('news.error')}</p>
  else if (!post) body = <p className="lb-note">{t('news.notFound')}</p>
  else {
    const game = post.gameId ? gameById(post.gameId) : undefined
    const summary = localized(post.summary, lang)
    body = (
      <>
        <article className="post-article">
          <PostCover post={post} className="post-hero" />
          <div className="post-meta">
            {post.tags.map((tag) => (
              <span key={tag} className="post-tag">
                {tag}
              </span>
            ))}
            <time dateTime={post.publishedAt ?? undefined}>{date(post)}</time>
          </div>
          <h1 className="post-heading">{title}</h1>
          {summary && <p className="post-lead">{summary}</p>}
          <div className="post-content">{renderLite(localized(post.body, lang))}</div>
          {game && (
            <aside className="post-cta">
              <span className="card-icon" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} />
              <span className="post-cta-text">
                <b>{loc(game.name)}</b>
                <span>{loc(game.sub)}</span>
              </span>
              <a className="btn btn-primary" href={playHref(game)}>
                {t('detail.play')} <span aria-hidden="true">→</span>
              </a>
              <a className="btn btn-ghost" href={detailHref(game)}>
                {t('spot.details')}
              </a>
            </aside>
          )}
        </article>
        {state.more.length > 0 && (
          <section>
            <div className="section-head">
              <h2>{t('news.more')}</h2>
            </div>
            <ul className="post-grid">
              {state.more.map((p) => (
                <li key={p.id}>
                  <PostCard post={p} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    )
  }

  return (
    <div className="wrap" data-page="post">
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="profile news">
        <a className="profile-back" href="#/news">
          {t('news.back')}
        </a>
        {body}
      </main>
    </div>
  )
}
