import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'
import type { FeedItem } from '../server/types'

type Filter = 'all' | 'vi' | 'en'
const FILTERS: Filter[] = ['vi', 'en', 'all']
const PAGE = 12

/** "3 giờ trước" theo ngôn ngữ đang chọn; quá 7 ngày thì hiện ngày. */
export function timeAgo(iso: string, now: number, lang: string, fmtDate: (d: Date, o: Intl.DateTimeFormatOptions) => string): string {
  const diff = Math.max(0, now - Date.parse(iso)) / 1000
  const rtf = new Intl.RelativeTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', { numeric: 'auto' })
  if (diff < 3600) return rtf.format(-Math.max(1, Math.round(diff / 60)), 'minute')
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour')
  if (diff < 7 * 86400) return rtf.format(-Math.round(diff / 86400), 'day')
  return fmtDate(new Date(iso), { day: 'numeric', month: 'short' })
}

function FeedCard({ item, now }: { item: FeedItem; now: number }) {
  const { lang, fmtDate } = useI18n()
  const [broken, setBroken] = useState(false)
  return (
    <a className="feed-card" href={item.url} target="_blank" rel="noopener noreferrer nofollow">
      <span className="feed-thumb" aria-hidden="true">
        {item.imageUrl && !broken ? (
          <img src={item.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        ) : (
          <span className="feed-thumb-mark">{item.source.charAt(0)}</span>
        )}
      </span>
      <span className="feed-body">
        <span className="feed-meta">
          <span className="feed-source">{item.source}</span>
          <time dateTime={item.publishedAt}>{timeAgo(item.publishedAt, now, lang, fmtDate)}</time>
        </span>
        <span className="feed-title">{item.title}</span>
        {item.summary && <span className="feed-summary">{item.summary}</span>}
      </span>
    </a>
  )
}

/** Mục "Tin game" ở #/news: tin lấy tự động từ RSS các trang tin, bấm vào mở bài gốc ở tab mới. Không có tin thì ẩn. */
export function GameNewsFeed() {
  const { t, lang } = useI18n()
  const { api } = useServer()
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<Filter | null>(null)
  const [shown, setShown] = useState(PAGE)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (!api) return
    let alive = true
    api.newsFeed(60).then(
      (list) => alive && setItems(list),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [api])

  if (failed) return <p className="lb-note feed-note">{t('feed.error')}</p>
  if (!items || items.length === 0) return null

  const has = (f: Filter) => f === 'all' || items.some((i) => i.lang === f)
  // Mặc định: ngôn ngữ đang chọn nếu có tin, không thì tất cả.
  const active: Filter = filter ?? (has(lang as Filter) ? (lang as Filter) : 'all')
  const list = active === 'all' ? items : items.filter((i) => i.lang === active)

  return (
    <section className="feed" aria-labelledby="feed-title">
      <div className="section-head">
        <h2 id="feed-title">{t('feed.title')}</h2>
        <div className="feed-filters" role="group" aria-label={t('feed.filter')}>
          {FILTERS.filter(has).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={f === active}
              onClick={() => {
                setFilter(f)
                setShown(PAGE)
              }}
            >
              {t('feed.' + f)}
            </button>
          ))}
        </div>
      </div>
      <p className="feed-note-src">{t('feed.note')}</p>
      <ul className="feed-grid">
        {list.slice(0, shown).map((item) => (
          <li key={item.id}>
            <FeedCard item={item} now={now} />
          </li>
        ))}
      </ul>
      {list.length > shown && (
        <button type="button" className="btn btn-ghost feed-more" onClick={() => setShown((n) => n + PAGE)}>
          {t('feed.more')}
        </button>
      )}
    </section>
  )
}
