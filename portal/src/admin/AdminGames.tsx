import { useState } from 'react'
import { GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'
import type { GameMeta, Rules } from '../server/types'
import { errorCode, RULE_FIELDS, rulesFromForm } from './forms'

type Values = Record<string, Record<keyof Rules, string>>
type Bad = { mode: string; field: keyof Rules } | null

const POINTS = /^\d{1,4}$/
const okPoints = (s: string) => POINTS.test(s.trim()) && Number(s) <= 1000

const toValues = (meta: GameMeta): Values =>
  Object.fromEntries(
    meta.modes.map((m) => [
      m.key,
      Object.fromEntries(RULE_FIELDS.map((f) => [f, m.rules?.[f] === undefined ? '' : String(m.rules[f])])) as Record<
        keyof Rules,
        string
      >,
    ]),
  )

function GameRow({ id, name, meta }: { id: string; name: string; meta: GameMeta }) {
  const { t, loc } = useI18n()
  const { api, refreshGames } = useServer()
  const [hidden, setHidden] = useState(meta.hidden)
  // Server chưa có cột points thì không hiện ô điểm.
  const [points, setPoints] = useState(meta.points === undefined ? null : String(meta.points))
  const [badPoints, setBadPoints] = useState(false)
  const [values, setValues] = useState<Values>(() => toValues(meta))
  // Điểm riêng từng mode: '' = dùng điểm mặc định của game.
  const [modePts, setModePts] = useState<Record<string, string>>(() =>
    Object.fromEntries(meta.modes.map((m) => [m.key, m.points === undefined ? '' : String(m.points)])),
  )
  const [badModePts, setBadModePts] = useState<string | null>(null)
  const [bad, setBad] = useState<Bad>(null)
  const [msg, setMsg] = useState<{ kind: 'saved' } | { kind: 'error'; code: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const setField = (mode: string, field: keyof Rules, v: string) => {
    setValues((cur) => ({ ...cur, [mode]: { ...cur[mode], [field]: v } }))
    setBad(null)
    setMsg(null)
  }

  const save = async () => {
    if (!api) return
    const r = rulesFromForm(values)
    if (!r.ok) {
      setBad({ mode: r.mode, field: r.field })
      return
    }
    const p = points === null ? undefined : Number(points)
    if (p !== undefined && !okPoints(points!)) {
      setBadPoints(true)
      return
    }
    const badMode = meta.modes.find((m) => modePts[m.key].trim() !== '' && !okPoints(modePts[m.key]))
    if (badMode) {
      setBadModePts(badMode.key)
      return
    }
    // Chỉ mode đổi điểm: '' (bỏ điểm riêng) gửi null.
    const modeChanges: Record<string, number | null> = {}
    for (const m of meta.modes) {
      const s = modePts[m.key].trim()
      const next = s === '' ? null : Number(s)
      if (next !== (m.points ?? null)) modeChanges[m.key] = next
    }
    const pChanged = p !== undefined && p !== meta.points
    setBusy(true)
    setMsg(null)
    try {
      // Chỉ gửi điểm khi đổi; không đổi thì gọi như cũ.
      if (Object.keys(modeChanges).length > 0) await api.adminUpdateGame(id, hidden, r.rules, pChanged ? p : null, modeChanges)
      else if (!pChanged) await api.adminUpdateGame(id, hidden, r.rules)
      else await api.adminUpdateGame(id, hidden, r.rules, p)
      setMsg({ kind: 'saved' })
      await refreshGames()
    } catch (e) {
      setMsg({ kind: 'error', code: errorCode(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-game" data-game={id}>
      <header className="admin-game-head">
        <h3>
          {name} <span className="admin-id">{id}</span>
        </h3>
        <label className="admin-check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          {t('admin.hidden')}
        </label>
        {points !== null && (
          <label className="admin-field admin-points">
            <span>{t('admin.pointsDefault')}</span>
            <input
              type="text"
              inputMode="numeric"
              value={points}
              aria-invalid={badPoints || undefined}
              onChange={(e) => {
                setPoints(e.target.value)
                setBadPoints(false)
                setMsg(null)
              }}
            />
            {badPoints && <span className="admin-field-error">{t('admin.invalid')}</span>}
          </label>
        )}
        <button type="button" className="admin-btn" disabled={busy} onClick={save}>
          {t('admin.save')}
        </button>
      </header>
      <div className="admin-modes">
        {meta.modes.map((m) => (
          <fieldset key={m.key} className="admin-mode">
            <legend>{loc(m.label)}</legend>
            {points !== null && (
              <label className="admin-field">
                <span>{t('admin.modePoints')}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  data-mode-points={m.key}
                  value={modePts[m.key] ?? ''}
                  placeholder={meta.points === undefined ? undefined : String(meta.points)}
                  aria-invalid={badModePts === m.key || undefined}
                  onChange={(e) => {
                    setModePts((cur) => ({ ...cur, [m.key]: e.target.value }))
                    setBadModePts(null)
                    setMsg(null)
                  }}
                />
                {badModePts === m.key ? (
                  <span className="admin-field-error">{t('admin.invalid')}</span>
                ) : (
                  <span className="admin-hint">{t('admin.modePointsHint', { n: meta.points ?? 0 })}</span>
                )}
              </label>
            )}
            {RULE_FIELDS.map((f) => {
              const invalid = bad?.mode === m.key && bad.field === f
              return (
                <label key={f} className="admin-field">
                  <span>{f}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={values[m.key]?.[f] ?? ''}
                    aria-invalid={invalid || undefined}
                    onChange={(e) => setField(m.key, f, e.target.value)}
                  />
                  {invalid && <span className="admin-field-error">{t(f === 'max_score_per_sec' ? 'admin.invalidDecimal' : 'admin.invalid')}</span>}
                </label>
              )
            })}
          </fieldset>
        ))}
      </div>
      {msg?.kind === 'saved' && (
        <p role="status" className="admin-ok">
          {t('admin.saved')}
        </p>
      )}
      {msg?.kind === 'error' && (
        <p role="alert" className="admin-err">
          {t('admin.error', { code: msg.code })}
        </p>
      )}
    </section>
  )
}

/** Tab Game: ẩn/hiện và luật chống gian lận theo từng mode, theo thứ tự catalog. */
export function AdminGames() {
  const { t, loc } = useI18n()
  const { games } = useServer()
  if (Object.keys(games).length === 0) return <p className="lb-note">{t('admin.noGames')}</p>
  return (
    <div className="admin-games">
      {GAMES.map((g) => (games[g.id] ? <GameRow key={g.id} id={g.id} name={loc(g.name)} meta={games[g.id]} /> : null))}
    </div>
  )
}
