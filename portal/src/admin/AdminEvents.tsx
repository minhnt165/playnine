import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useEventText } from '../events/eventText'
import { eventPhase } from '../events/model'
import { useNow } from '../events/useNow'
import { GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'
import type { EventAgg, EventInput, EventPatch, GameEvent, Text } from '../server/types'
import { AdminField } from './AdminField'
import { editableFields, errorCode, fromLocalInput, toLocalInput, validateEvent } from './forms'

type Form = {
  titleEn: string
  titleVi: string
  descEn: string
  descVi: string
  gameId: string
  mode: string
  agg: EventAgg
  startsAt: string
  endsAt: string
  awardTop: string
}

const AWARD_DEFAULT = 3
const INT = /^\d+$/

const fromEvent = (e: GameEvent): Form => ({
  titleEn: e.title.en,
  titleVi: e.title.vi ?? '',
  descEn: e.description.en ?? '',
  descVi: e.description.vi ?? '',
  gameId: e.gameId,
  mode: e.mode,
  agg: e.agg,
  startsAt: toLocalInput(e.startsAt),
  endsAt: toLocalInput(e.endsAt),
  awardTop: String(e.awardTop),
})

/** Chữ en bắt buộc; vi trống thì bỏ khỏi object. */
const textOf = (en: string, vi: string): Text => ({ en: en.trim(), ...(vi.trim() ? { vi: vi.trim() } : {}) })

/** Mô tả: ngôn ngữ nào trống thì bỏ khỏi object (cả hai trống là {}). */
const descOf = (en: string, vi: string): Partial<Text> => ({
  ...(en.trim() ? { en: en.trim() } : {}),
  ...(vi.trim() ? { vi: vi.trim() } : {}),
})

type FormProps = { event: GameEvent | null; now: number; onSaved: () => void; onClose: () => void }

function EventForm({ event, now, onSaved, onClose }: FormProps) {
  const { t, loc } = useI18n()
  const { api, games } = useServer()
  const [v, setV] = useState<Form>(() => {
    if (event) return fromEvent(event)
    // Sự kiện mới: game đầu tiên đã có metadata và mode đầu tiên của nó.
    const first = GAMES.find((g) => games[g.id])?.id ?? ''
    return {
      titleEn: '',
      titleVi: '',
      descEn: '',
      descVi: '',
      gameId: first,
      mode: games[first]?.modes[0]?.key ?? '',
      agg: 'best',
      startsAt: '',
      endsAt: '',
      awardTop: String(AWARD_DEFAULT),
    }
  })
  const [bad, setBad] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const editable = editableFields(event ? eventPhase(event, now) : 'upcoming')
  const locked = (f: keyof EventInput) => !editable.has(f)

  const set = (patch: Partial<Form>) => {
    setV((cur) => ({ ...cur, ...patch }))
    setBad(new Set())
    setError(null)
  }
  const chooseGame = (gameId: string) => {
    const meta = games[gameId]
    // time_low chỉ cho `best`: đổi sang game như vậy thì đưa cách tính về best.
    set({ gameId, mode: meta?.modes[0]?.key ?? '', agg: meta?.metric === 'time_low' ? 'best' : v.agg })
  }

  // Khi sửa chỉ gửi trường admin thật sự đổi: SQL coi khóa vắng là "giữ nguyên", còn gửi lại trường
  // bị khóa (kể cả giờ có giây mà ô nhập làm tròn phút) sẽ bị từ chối.
  const buildPatch = (e: GameEvent, full: EventInput): EventPatch => {
    const orig = fromEvent(e)
    const patch: EventPatch = { id: e.id }
    const can = (f: keyof EventInput) => editable.has(f)
    if (can('title') && (v.titleEn.trim() !== orig.titleEn || v.titleVi.trim() !== orig.titleVi)) patch.title = full.title
    if (can('description') && (v.descEn.trim() !== orig.descEn || v.descVi.trim() !== orig.descVi)) {
      patch.description = full.description
    }
    if (can('gameId') && v.gameId !== orig.gameId) patch.gameId = v.gameId
    if (can('mode') && v.mode !== orig.mode) patch.mode = v.mode
    if (can('agg') && v.agg !== orig.agg) patch.agg = v.agg
    // Giờ so ở độ chính xác phút, cùng độ chính xác với ô nhập.
    if (can('startsAt') && v.startsAt !== orig.startsAt) patch.startsAt = full.startsAt
    if (can('endsAt') && v.endsAt !== orig.endsAt) patch.endsAt = full.endsAt
    if (can('awardTop') && full.awardTop !== e.awardTop) patch.awardTop = full.awardTop
    return patch
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!api || busy) return
    const awardTop = INT.test(v.awardTop.trim()) ? Number(v.awardTop.trim()) : NaN
    const full: EventInput = {
      title: textOf(v.titleEn, v.titleVi),
      description: descOf(v.descEn, v.descVi),
      gameId: v.gameId,
      mode: v.mode,
      agg: v.agg,
      // Giờ nhập hỏng hoặc trống thì để rỗng để validateEvent đánh dấu trường đó.
      startsAt: fromLocalInput(v.startsAt) ?? '',
      endsAt: fromLocalInput(v.endsAt) ?? '',
      awardTop,
    }
    const patch = event ? buildPatch(event, full) : null
    // Khi sửa, kiểm tra giá trị sau khi gộp thay đổi vào sự kiện gốc; trường bị khóa không sửa được nên bỏ khỏi lỗi.
    const merged: EventInput = event ? { ...event, ...patch } : full
    const wrong = validateEvent(merged, games).filter((f) => !event || editable.has(f))
    if (wrong.length > 0) {
      setBad(new Set(wrong))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.adminSaveEvent(patch ?? full)
      onSaved()
    } catch (e) {
      setError(errorCode(e))
      setBusy(false)
    }
  }

  const modes = games[v.gameId]?.modes ?? []
  const noSum = games[v.gameId]?.metric === 'time_low'
  const inv = (f: keyof EventInput) => (bad.has(f) ? true : undefined)

  return (
    <form className="admin-form" aria-label={t(event ? 'admin.edit' : 'admin.newEvent')} onSubmit={submit} noValidate>
      <AdminField label={t('admin.field.titleEn')}>
        <input
          type="text"
          value={v.titleEn}
          disabled={locked('title')}
          aria-invalid={inv('title')}
          onChange={(e) => set({ titleEn: e.target.value })}
        />
      </AdminField>
      <AdminField label={t('admin.field.titleVi')}>
        <input type="text" value={v.titleVi} disabled={locked('title')} onChange={(e) => set({ titleVi: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.descEn')}>
        <textarea rows={3} value={v.descEn} disabled={locked('description')} onChange={(e) => set({ descEn: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.descVi')}>
        <textarea rows={3} value={v.descVi} disabled={locked('description')} onChange={(e) => set({ descVi: e.target.value })} />
      </AdminField>
      <AdminField label={t('admin.field.gameId')}>
        <select
          value={v.gameId}
          disabled={locked('gameId')}
          aria-invalid={inv('gameId')}
          onChange={(e) => chooseGame(e.target.value)}
        >
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>
              {loc(g.name)}
            </option>
          ))}
        </select>
      </AdminField>
      <AdminField label={t('admin.field.mode')}>
        <select value={v.mode} disabled={locked('mode')} aria-invalid={inv('mode')} onChange={(e) => set({ mode: e.target.value })}>
          {modes.map((m) => (
            <option key={m.key} value={m.key}>
              {loc(m.label)}
            </option>
          ))}
        </select>
      </AdminField>
      <AdminField label={t('admin.field.agg')}>
        <select
          value={v.agg}
          disabled={locked('agg')}
          aria-invalid={inv('agg')}
          onChange={(e) => set({ agg: e.target.value as EventAgg })}
        >
          <option value="best">{t('admin.field.aggBest')}</option>
          {!noSum && <option value="sum">{t('admin.field.aggSum')}</option>}
        </select>
      </AdminField>
      <AdminField label={t('admin.field.startsAt')}>
        <input
          type="datetime-local"
          value={v.startsAt}
          disabled={locked('startsAt')}
          aria-invalid={inv('startsAt')}
          onChange={(e) => set({ startsAt: e.target.value })}
        />
      </AdminField>
      <AdminField label={t('admin.field.endsAt')}>
        <input
          type="datetime-local"
          value={v.endsAt}
          disabled={locked('endsAt')}
          aria-invalid={inv('endsAt')}
          onChange={(e) => set({ endsAt: e.target.value })}
        />
      </AdminField>
      <AdminField label={t('admin.field.awardTop')}>
        <input
          type="text"
          inputMode="numeric"
          value={v.awardTop}
          disabled={locked('awardTop')}
          aria-invalid={inv('awardTop')}
          onChange={(e) => set({ awardTop: e.target.value })}
        />
      </AdminField>
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

/** Tab Sự kiện: danh sách mọi sự kiện, tạo/sửa, hủy và tính lại kết quả. */
export function AdminEvents() {
  const { t } = useI18n()
  const { api } = useServer()
  const text = useEventText()
  const now = useNow(30_000)
  const [events, setEvents] = useState<GameEvent[] | null>(null)
  const [form, setForm] = useState<{ event: GameEvent | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!api) return
    const mine = ++seq.current
    try {
      const list = await api.events()
      if (mine !== seq.current) return
      setEvents([...list].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)))
      setError(null)
    } catch (e) {
      if (mine === seq.current) setError(errorCode(e))
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  const open = (event: GameEvent | null) => {
    setSaved(false)
    setForm({ event })
  }
  const act = async (run: () => Promise<void>) => {
    setSaved(false)
    try {
      await run()
      await load()
    } catch (e) {
      setError(errorCode(e))
    }
  }
  const cancel = (e: GameEvent) => {
    if (!api || !confirm(t('admin.cancelConfirm', { name: text.title(e) }))) return
    void act(() => api.adminCancelEvent(e.id))
  }
  const recompute = (e: GameEvent) => {
    if (!api || !confirm(t('admin.recomputeConfirm', { name: text.title(e) }))) return
    void act(() => api.adminRecomputeEvent(e.id))
  }

  return (
    <div className="admin-events">
      <div className="admin-bar">
        <button type="button" className="admin-btn" onClick={() => open(null)}>
          {t('admin.newEvent')}
        </button>
      </div>
      {form && (
        <EventForm
          key={form.event?.id ?? 'new'}
          event={form.event}
          now={now}
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
      {events && events.length === 0 && <p className="lb-note">{t('admin.empty')}</p>}
      {events && events.length > 0 && (
        <ul className="admin-list">
          {events.map((e) => {
            const phase = eventPhase(e, now)
            return (
              <li key={e.id} className="admin-item" data-event={e.id}>
                <div className="admin-item-main">
                  <strong>{text.title(e)}</strong>{' '}
                  <span className={'admin-phase admin-phase-' + phase}>{t('admin.phase.' + phase)}</span>
                  <div className="admin-item-meta">
                    {text.gameName(e)} · {text.modeLabel(e)}
                  </div>
                  <div className="admin-item-meta">
                    {text.when(e.startsAt)} – {text.when(e.endsAt)}
                  </div>
                </div>
                <div className="admin-item-actions">
                  <button type="button" className="admin-btn" onClick={() => open(e)}>
                    {t('admin.edit')}
                  </button>
                  {(e.status === 'scheduled' || e.status === 'live') && phase !== 'ended' && (
                    <button type="button" className="admin-btn" onClick={() => cancel(e)}>
                      {t('admin.cancelEvent')}
                    </button>
                  )}
                  {e.status === 'closed' && (
                    <button type="button" className="admin-btn" onClick={() => recompute(e)}>
                      {t('admin.recompute')}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
