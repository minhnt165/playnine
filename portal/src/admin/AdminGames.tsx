import { useState } from 'react'
import { GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'
import type { GameMeta, Rules } from '../server/types'
import { errorCode, RULE_FIELDS, rulesFromForm } from './forms'

type Values = Record<string, Record<keyof Rules, string>>
type Bad = { mode: string; field: keyof Rules } | null

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
  const [values, setValues] = useState<Values>(() => toValues(meta))
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
    setBusy(true)
    setMsg(null)
    try {
      await api.adminUpdateGame(id, hidden, r.rules)
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
        <button type="button" className="admin-btn" disabled={busy} onClick={save}>
          {t('admin.save')}
        </button>
      </header>
      <div className="admin-modes">
        {meta.modes.map((m) => (
          <fieldset key={m.key} className="admin-mode">
            <legend>{loc(m.label)}</legend>
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
