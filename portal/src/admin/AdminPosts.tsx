import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useEventText } from '../events/eventText'
import { localized } from '../events/model'
import { GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { postHref } from '../player/route'
import { useServer } from '../server/ServerProvider'
import type { Post, PostInput, Text } from '../server/types'
import { AdminFeed } from './AdminFeed'
import { AdminField } from './AdminField'
import { errorCode, fromLocalInput, toLocalInput } from './forms'

type Form = {
  slug: string
  titleEn: string
  titleVi: string
  summaryEn: string
  summaryVi: string
  bodyEn: string
  bodyVi: string
  gameId: string
  tags: string
  pinned: boolean
  publishedAt: string
}

const BLANK: Form = {
  slug: '', titleEn: '', titleVi: '', summaryEn: '', summaryVi: '', bodyEn: '', bodyVi: '', gameId: '', tags: '', pinned: false, publishedAt: '',
}

const fromPost = (p: Post): Form => ({
  slug: p.slug,
  titleEn: p.title.en,
  titleVi: p.title.vi ?? '',
  summaryEn: p.summary.en ?? '',
  summaryVi: p.summary.vi ?? '',
  bodyEn: p.body.en ?? '',
  bodyVi: p.body.vi ?? '',
  gameId: p.gameId ?? '',
  tags: p.tags.join(', '),
  pinned: p.pinned,
  publishedAt: p.publishedAt ? toLocalInput(p.publishedAt) : '',
})

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const TAGS_MAX = 6
const TAG_LEN = 24
// Cùng giới hạn với `admin_save_post`.
const LIMITS = { title: 120, summary: 300, body: 20000 }

/** Văn bản hai ngôn ngữ, bỏ khóa rỗng. */
const pair = (en: string, vi: string): Partial<Text> => ({ ...(en.trim() ? { en: en.trim() } : {}), ...(vi.trim() ? { vi: vi.trim() } : {}) })

/** Trường sai của một bài viết theo luật của `admin_save_post`; `publishedAt` '' nghĩa là giờ đăng hỏng. */
export function validatePost(p: PostInput): (keyof PostInput)[] {
  const bad: (keyof PostInput)[] = []
  if (!SLUG.test(p.slug) || p.slug.length < 3 || p.slug.length > 80) bad.push('slug')
  const over = (x: Partial<Text>, max: number) => Object.values(x).some((s) => (s ?? '').length > max)
  if (!p.title.en.trim() || over(p.title, LIMITS.title)) bad.push('title')
  if (over(p.summary, LIMITS.summary)) bad.push('summary')
  if (over(p.body, LIMITS.body)) bad.push('body')
  if (p.tags.length > TAGS_MAX || p.tags.some((tag) => tag.length < 1 || tag.length > TAG_LEN)) bad.push('tags')
  if (p.publishedAt === '') bad.push('publishedAt')
  return bad
}

type FormProps = { post: Post | null; onSaved: () => void; onClose: () => void }

function PostForm({ post, onSaved, onClose }: FormProps) {
  const { t, loc } = useI18n()
  const { api } = useServer()
  const [v, setV] = useState<Form>(post ? fromPost(post) : BLANK)
  const [bad, setBad] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (patch: Partial<Form>) => {
    setV((cur) => ({ ...cur, ...patch }))
    setBad(new Set())
    setError(null)
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!api || busy) return
    // Giờ đăng không đổi (ở độ chính xác phút) thì giữ giá trị gốc; trống là nháp.
    const publishedAt =
      v.publishedAt === '' ? null : post?.publishedAt && v.publishedAt === toLocalInput(post.publishedAt) ? post.publishedAt : (fromLocalInput(v.publishedAt) ?? '')
    const input: PostInput = {
      ...(post ? { id: post.id } : {}),
      slug: v.slug.trim(),
      title: { en: v.titleEn.trim(), ...(v.titleVi.trim() ? { vi: v.titleVi.trim() } : {}) },
      summary: pair(v.summaryEn, v.summaryVi),
      body: pair(v.bodyEn, v.bodyVi),
      gameId: v.gameId || null,
      tags: v.tags.split(',').map((s) => s.trim()).filter(Boolean),
      pinned: v.pinned,
      publishedAt,
    }
    const wrong = validatePost(input)
    if (wrong.length > 0) {
      setBad(new Set(wrong))
      return
    }
    setBusy(true)
    try {
      await api.adminSavePost(input)
      onSaved()
    } catch (e) {
      setError(errorCode(e))
      setBusy(false)
    }
  }

  const inv = (f: keyof PostInput) => (bad.has(f) ? true : undefined)

  return (
    <form className="admin-form admin-post-form" aria-label={t(post ? 'admin.edit' : 'admin.newPost')} onSubmit={submit} noValidate>
      <AdminField label={t('admin.field.slug')} hint={t('admin.field.slugHint')}>
        <input type="text" value={v.slug} aria-invalid={inv('slug')} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
      </AdminField>
      <AdminField label={t('admin.field.gameId')}>
        <select value={v.gameId} onChange={(e) => set({ gameId: e.target.value })}>
          <option value="">{t('admin.field.noGame')}</option>
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>
              {loc(g.name)}
            </option>
          ))}
        </select>
      </AdminField>
      <AdminField label={t('admin.field.titleEn')}>
        <input type="text" value={v.titleEn} aria-invalid={inv('title')} onChange={(e) => set({ titleEn: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.titleVi')}>
        <input type="text" value={v.titleVi} aria-invalid={inv('title')} onChange={(e) => set({ titleVi: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.summaryEn')}>
        <textarea rows={2} value={v.summaryEn} aria-invalid={inv('summary')} onChange={(e) => set({ summaryEn: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.summaryVi')}>
        <textarea rows={2} value={v.summaryVi} aria-invalid={inv('summary')} onChange={(e) => set({ summaryVi: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.bodyEn')} hint={t('admin.field.bodyHint')}>
        <textarea rows={12} value={v.bodyEn} aria-invalid={inv('body')} onChange={(e) => set({ bodyEn: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.bodyVi')} hint={t('admin.field.bodyHint')}>
        <textarea rows={12} value={v.bodyVi} aria-invalid={inv('body')} onChange={(e) => set({ bodyVi: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.tags')} hint={t('admin.field.tagsHint')}>
        <input type="text" value={v.tags} aria-invalid={inv('tags')} onChange={(e) => set({ tags: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.publishedAt')} hint={t('admin.field.publishedHint')}>
        <input type="datetime-local" value={v.publishedAt} aria-invalid={inv('publishedAt')} onChange={(e) => set({ publishedAt: e.target.value })} />
      </AdminField>
      <label className="admin-check">
        <input type="checkbox" checked={v.pinned} onChange={(e) => set({ pinned: e.target.checked })} />
        {t('admin.field.pinned')}
      </label>
      {bad.size > 0 && (
        <p role="alert" className="admin-err">
          {t('admin.invalidForm')}
        </p>
      )}
      {error && (
        <p role="alert" className="admin-err">
          {t('admin.error', { code: error })}
        </p>
      )}
      <div className="admin-bar">
        <button type="submit" className="admin-btn" disabled={busy}>
          {t('admin.save')}
        </button>
        <button type="button" className="admin-btn" onClick={onClose}>
          {t('admin.close')}
        </button>
      </div>
    </form>
  )
}

/** Trạng thái hiển thị của bài: nháp, hẹn giờ hoặc đã đăng. */
const statusOf = (p: Post, now: number): 'draft' | 'scheduled' | 'published' =>
  p.publishedAt === null ? 'draft' : Date.parse(p.publishedAt) > now ? 'scheduled' : 'published'

/** Tab Bài viết: danh sách mọi bài (kể cả nháp), tạo/sửa và xóa. */
export function AdminPosts() {
  const { t, lang } = useI18n()
  const { api } = useServer()
  const text = useEventText()
  const [list, setList] = useState<Post[] | null>(null)
  const [form, setForm] = useState<{ post: Post | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!api) return
    const mine = ++seq.current
    try {
      const rows = await api.adminPosts()
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

  const open = (post: Post | null) => {
    setSaved(false)
    setForm({ post })
  }
  const remove = async (p: Post) => {
    if (!api || !confirm(t('admin.deletePostConfirm', { name: localized(p.title, lang) }))) return
    setSaved(false)
    try {
      await api.adminDeletePost(p.id)
      await load()
    } catch (e) {
      setError(errorCode(e))
    }
  }

  const now = Date.now()
  return (
    <div className="admin-posts">
      <div className="admin-bar">
        <button type="button" className="admin-btn" onClick={() => open(null)}>
          {t('admin.newPost')}
        </button>
      </div>
      {form && (
        <PostForm
          key={form.post?.id ?? 'new'}
          post={form.post}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            setSaved(true)
            void load()
          }}
        />
      )}
      {saved && (
        <p role="status" className="admin-ok">
          {t('admin.saved')}
        </p>
      )}
      {error && (
        <p role="alert" className="admin-err">
          {t('admin.error', { code: error })}
        </p>
      )}
      {list && list.length === 0 && <p className="lb-note">{t('admin.empty')}</p>}
      {list && list.length > 0 && (
        <ul className="admin-list">
          {list.map((p) => {
            const status = statusOf(p, now)
            return (
              <li key={p.id} className="admin-item" data-post={p.id}>
                <div className="admin-item-main">
                  <strong>{localized(p.title, lang)}</strong> <span className={'admin-phase' + (status === 'published' ? ' admin-phase-live' : '')}>{t('admin.post.' + status)}</span>
                  <div className="admin-item-meta">
                    {p.slug}
                    {p.publishedAt && ' · ' + text.when(p.publishedAt)}
                    {p.pinned && ' · ' + t('news.pinned')}
                  </div>
                </div>
                <div className="admin-item-actions">
                  {status === 'published' && (
                    <a className="admin-btn" href={postHref(p.slug)}>
                      {t('admin.view')}
                    </a>
                  )}
                  <button type="button" className="admin-btn" onClick={() => open(p)}>
                    {t('admin.edit')}
                  </button>
                  <button type="button" className="admin-btn" onClick={() => void remove(p)}>
                    {t('admin.delete')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <AdminFeed />
    </div>
  )
}
