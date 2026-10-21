import { useCallback, useEffect, useRef, useState } from 'react'
import { useEventText } from '../events/eventText'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'
import type { FeedItem } from '../server/types'
import { errorCode } from './forms'

const PAGE = 30

/** Tin game tự động (RSS) trong tab Bài viết: xem mọi tin kể cả đã ẩn, ẩn tin không phù hợp hoặc hiện lại. */
export function AdminFeed() {
  const { t } = useI18n()
  const { api } = useServer()
  const text = useEventText()
  const [list, setList] = useState<FeedItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!api) return
    const mine = ++seq.current
    try {
      const rows = await api.adminNewsFeed()
      if (mine !== seq.current) return
      setList(rows)
      setError(null)
    } catch (e) {
      if (mine === seq.current) setError(errorCode(e))
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (item: FeedItem) => {
    if (!api) return
    setBusy(item.id)
    try {
      await api.adminHideNews(item.id, !item.hidden)
      setList((l) => l && l.map((x) => (x.id === item.id ? { ...x, hidden: !item.hidden } : x)))
      setError(null)
    } catch (e) {
      setError(errorCode(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="admin-feed" aria-labelledby="admin-feed-title">
      <h3 id="admin-feed-title">{t('admin.feed.title')}</h3>
      <p className="admin-hint">{t('admin.feed.hint')}</p>
      {error && (
        <p role="alert" className="admin-err">
          {t('admin.error', { code: error })}
        </p>
      )}
      {list && list.length === 0 && <p className="lb-note">{t('admin.feed.empty')}</p>}
      {list && list.length > 0 && (
        <ul className="admin-list">
          {list.slice(0, shown).map((f) => (
            <li key={f.id} className={'admin-item' + (f.hidden ? ' admin-item-off' : '')} data-feed={f.id}>
              <div className="admin-item-main">
                <strong>{f.title}</strong> {f.hidden && <span className="admin-phase">{t('admin.feed.hidden')}</span>}
                <div className="admin-item-meta">
                  {f.source} · {f.lang} · {text.when(f.publishedAt)}
                </div>
              </div>
              <div className="admin-item-actions">
                <a className="admin-btn" href={f.url} target="_blank" rel="noopener noreferrer nofollow">
                  {t('admin.view')}
                </a>
                <button type="button" className="admin-btn" disabled={busy === f.id} onClick={() => void toggle(f)}>
                  {t(f.hidden ? 'admin.feed.show' : 'admin.feed.hide')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list && list.length > shown && (
        <button type="button" className="admin-btn admin-more" onClick={() => setShown((n) => n + PAGE)}>
          {t('feed.more')}
        </button>
      )}
    </section>
  )
}
