import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useEventText } from '../events/eventText'
import { localized } from '../events/model'
import { GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'
import type { Collection, CollectionInput, Text } from '../server/types'
import { AdminField } from './AdminField'
import { errorCode, fromLocalInput, toLocalInput, validateCollection } from './forms'

type Form = {
  titleEn: string
  titleVi: string
  startsAt: string
  endsAt: string
  sort: string
  gameIds: string[]
}

const INT = /^-?\d+$/

const fromCollection = (c: Collection): Form => ({
  titleEn: c.title.en,
  titleVi: c.title.vi ?? '',
  startsAt: toLocalInput(c.startsAt),
  endsAt: c.endsAt === null ? '' : toLocalInput(c.endsAt),
  sort: String(c.sort),
  gameIds: c.gameIds,
})

const BLANK: Form = { titleEn: '', titleVi: '', startsAt: '', endsAt: '', sort: '0', gameIds: [] }

/** Đổi chỗ phần tử `i` với `i + dir`; ngoài biên thì giữ nguyên. */
const move = (ids: string[], i: number, dir: -1 | 1): string[] => {
  const j = i + dir
  if (j < 0 || j >= ids.length) return ids
  const out = [...ids]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

type FormProps = { collection: Collection | null; onSaved: () => void; onClose: () => void }

function CollectionForm({ collection, onSaved, onClose }: FormProps) {
  const { t, loc } = useI18n()
  const { api } = useServer()
  const [v, setV] = useState<Form>(collection ? fromCollection(collection) : BLANK)
  const [bad, setBad] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (patch: Partial<Form>) => {
    setV((cur) => ({ ...cur, ...patch }))
    setBad(new Set())
    setError(null)
  }
  const toggle = (id: string) =>
    set({ gameIds: v.gameIds.includes(id) ? v.gameIds.filter((x) => x !== id) : [...v.gameIds, id] })
  const gameName = (id: string) => {
    const g = GAMES.find((x) => x.id === id)
    return g ? loc(g.name) : id
  }

  /** Giờ không đổi (ở độ chính xác phút) thì giữ nguyên giá trị gốc, khỏi làm tròn mất giây. */
  const timeOf = (field: 'startsAt' | 'endsAt', orig: string | null | undefined): string | null => {
    if (v[field] === '') return null
    if (orig && v[field] === toLocalInput(orig)) return orig
    return fromLocalInput(v[field]) ?? ''
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!api || busy) return
    const title: Text = { en: v.titleEn.trim(), ...(v.titleVi.trim() ? { vi: v.titleVi.trim() } : {}) }
    const input: CollectionInput = {
      ...(collection ? { id: collection.id } : {}),
      title,
      gameIds: v.gameIds,
      // Bắt đầu trống hoặc hỏng thì để rỗng cho validateCollection đánh dấu; kết thúc trống là không hạn.
      startsAt: timeOf('startsAt', collection?.startsAt) ?? '',
      endsAt: timeOf('endsAt', collection?.endsAt),
      sort: INT.test(v.sort.trim()) ? Number(v.sort.trim()) : NaN,
    }
    const wrong = validateCollection(input)
    if (wrong.length > 0) {
      setBad(new Set(wrong))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.adminSaveCollection(input)
      onSaved()
    } catch (e) {
      setError(errorCode(e))
      setBusy(false)
    }
  }

  const inv = (f: keyof CollectionInput) => (bad.has(f) ? true : undefined)

  return (
    <form className="admin-form" aria-label={t(collection ? 'admin.edit' : 'admin.newCollection')} onSubmit={submit} noValidate>
      <AdminField label={t('admin.field.titleEn')}>
        <input type="text" value={v.titleEn} aria-invalid={inv('title')} onChange={(e) => set({ titleEn: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.titleVi')}>
        <input type="text" value={v.titleVi} onChange={(e) => set({ titleVi: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.startsAt')}>
        <input
          type="datetime-local"
          value={v.startsAt}
          aria-invalid={inv('startsAt')}
          onChange={(e) => set({ startsAt: e.target.value })}
        />
      </AdminField>
      <AdminField label={t('admin.field.endsAt')} hint={t('admin.field.endsAtHint')}>
        <input
          type="datetime-local"
          value={v.endsAt}
          aria-invalid={inv('endsAt')}
          onChange={(e) => set({ endsAt: e.target.value })}
        />
      </AdminField>
      <AdminField label={t('admin.field.sort')}>
        <input type="number" step={1} value={v.sort} aria-invalid={inv('sort')} onChange={(e) => set({ sort: e.target.value })} />
      </AdminField>
      <fieldset className={'admin-games-pick' + (bad.has('gameIds') ? ' admin-invalid' : '')}>
        <legend>{t('admin.field.games')}</legend>
        <div className="admin-checks">
          {GAMES.map((g) => (
            <label key={g.id} className="admin-check">
              <input type="checkbox" checked={v.gameIds.includes(g.id)} onChange={() => toggle(g.id)} />
              {loc(g.name)}
            </label>
          ))}
        </div>
        {v.gameIds.length > 0 && (
          <ol className="admin-order">
            {v.gameIds.map((id, i) => (
              <li key={id}>
                <span>{gameName(id)}</span>
                <button
                  type="button"
                  className="admin-btn"
                  aria-label={t('admin.up') + ' ' + gameName(id)}
                  disabled={i === 0}
                  onClick={() => set({ gameIds: move(v.gameIds, i, -1) })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  aria-label={t('admin.down') + ' ' + gameName(id)}
                  disabled={i === v.gameIds.length - 1}
                  onClick={() => set({ gameIds: move(v.gameIds, i, 1) })}
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
        )}
      </fieldset>
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

/** Tab Bộ sưu tập: danh sách, tạo/sửa (chọn và sắp xếp game) và xóa. */
export function AdminCollections() {
  const { t, lang } = useI18n()
  const { api } = useServer()
  const text = useEventText()
  const [list, setList] = useState<Collection[] | null>(null)
  const [form, setForm] = useState<{ collection: Collection | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!api) return
    const mine = ++seq.current
    try {
      const rows = await api.collections()
      if (mine !== seq.current) return
      setList([...rows].sort((a, b) => a.sort - b.sort || Date.parse(b.startsAt) - Date.parse(a.startsAt)))
      setError(null)
    } catch (e) {
      if (mine === seq.current) setError(errorCode(e))
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  const open = (collection: Collection | null) => {
    setSaved(false)
    setForm({ collection })
  }
  const remove = async (c: Collection) => {
    if (!api || !confirm(t('admin.deleteConfirm', { name: localized(c.title, lang) }))) return
    setSaved(false)
    try {
      await api.adminDeleteCollection(c.id)
      await load()
    } catch (e) {
      setError(errorCode(e))
    }
  }

  return (
    <div className="admin-collections">
      <div className="admin-bar">
        <button type="button" className="admin-btn" onClick={() => open(null)}>
          {t('admin.newCollection')}
        </button>
      </div>
      {form && (
        <CollectionForm
          key={form.collection?.id ?? 'new'}
          collection={form.collection}
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
          {list.map((c) => (
            <li key={c.id} className="admin-item" data-collection={c.id}>
              <div className="admin-item-main">
                <strong>{localized(c.title, lang)}</strong>
                <div className="admin-item-meta">
                  {c.sort} · {c.gameIds.length} · {text.when(c.startsAt)} – {c.endsAt ? text.when(c.endsAt) : '∞'}
                </div>
              </div>
              <div className="admin-item-actions">
                <button type="button" className="admin-btn" onClick={() => open(c)}>
                  {t('admin.edit')}
                </button>
                <button type="button" className="admin-btn" onClick={() => void remove(c)}>
                  {t('admin.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
