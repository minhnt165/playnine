import { localized } from '../events/model'
import { gameById } from '../games/catalog'
import { previewBg } from '../home/GamePreview'
import { useI18n } from '../i18n/i18n'
import { postHref } from '../player/route'
import type { Post } from '../server/types'

/** Bìa bài viết: nền màu và icon của game gắn với bài; bài không gắn game dùng nền chuyển màu của cổng. */
export function PostCover({ post, className }: { post: Post; className: string }) {
  const game = post.gameId ? gameById(post.gameId) : undefined
  return (
    <span className={className + (game ? ' pv-' + game.id : ' post-cover-brand')} style={game && previewBg(game)} aria-hidden="true">
      {game ? <span className="card-icon" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} /> : <span className="post-cover-mark">9</span>}
    </span>
  )
}

/** Ngày đăng theo ngôn ngữ đang chọn. */
export function usePostDate(): (p: Post) => string {
  const { fmtDate } = useI18n()
  return (p) => (p.publishedAt ? fmtDate(new Date(p.publishedAt), { day: 'numeric', month: 'short', year: 'numeric' }) : '')
}

/** Thẻ bài trong danh sách tin; `featured` là thẻ lớn đầu trang. */
export function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  const { t, lang } = useI18n()
  const date = usePostDate()
  const summary = localized(post.summary, lang)
  return (
    <a className={'post-card' + (featured ? ' featured' : '')} href={postHref(post.slug)}>
      <PostCover post={post} className="post-cover" />
      <span className="post-body">
        <span className="post-meta">
          {post.pinned && <span className="post-pin">{t('news.pinned')}</span>}
          {post.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="post-tag">
              {tag}
            </span>
          ))}
          <time dateTime={post.publishedAt ?? undefined}>{date(post)}</time>
        </span>
        <span className="post-title">{localized(post.title, lang)}</span>
        {summary && <span className="post-summary">{summary}</span>}
      </span>
    </a>
  )
}
