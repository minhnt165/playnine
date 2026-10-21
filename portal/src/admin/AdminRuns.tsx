import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useEventText } from '../events/eventText'
import { GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { formatValue } from '../player/leaderboardModel'
import { useServer } from '../server/ServerProvider'
import type { AdminRun, RunFilter, RunStatusDb } from '../server/types'
import { errorCode } from './forms'

const PAGE = 50
const STATUSES: RunStatusDb[] = ['started', 'finished', 'rejected']

/** Tab Ván: lọc, xem và từ chối ván; "Xem thêm" phân trang theo startedAt. */
export function AdminRuns() {
  const { t, loc, fmtNumber } = useI18n()
  const { api, games } = useServer()
  const text = useEventText()
  const [gameId, setGameId] = useState('')
  const [mode, setMode] = useState('')
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('')
  const [applied, setApplied] = useState<RunFilter>({})
  const [rows, setRows] = useState<AdminRun[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (!api) return
    const mine = ++seq.current
    api.adminRuns({ ...applied, limit: PAGE }).then(
      (list) => {
        if (mine !== seq.current) return
        setRows(list)
        setMore(list.length >= PAGE)
        setError(null)
      },
      (e) => {
        if (mine === seq.current) setError(errorCode(e))
      },
    )
  }, [api, applied])

  const loadMore = async () => {
    if (!api || !rows || rows.length === 0) return
    // startedAt giữ nguyên chuỗi nhận được: SQL so sánh ở độ chính xác micro giây.
    const before = rows[rows.length - 1].startedAt
    try {
      const list = await api.adminRuns({ ...applied, before, limit: PAGE })
      setRows((cur) => (cur ? [...cur, ...list] : list))
      setMore(list.length >= PAGE)
      setError(null)
    } catch (e) {
      setError(errorCode(e))
    }
  }

  const apply = (e: FormEvent) => {
    e.preventDefault()
    const f: RunFilter = {}
    if (gameId) f.gameId = gameId
    if (gameId && mode) f.mode = mode
    if (userId.trim()) f.userId = userId.trim()
    if (status) f.status = status as RunStatusDb
    setApplied(f)
  }

  const reject = async (r: AdminRun) => {
    if (!api) return
    const reason = prompt(t('admin.rejectPrompt'))
    if (reason === null) return
    const clean = reason.trim() || undefined
    try {
      await api.adminRejectRun(r.id, clean)
      setRows(
        (cur) => cur && cur.map((x) => (x.id === r.id ? { ...x, status: 'rejected', rejectReason: clean ?? null } : x)),
      )
      setError(null)
    } catch (e) {
      setError(errorCode(e))
    }
  }

  const valueOf = (r: AdminRun): string => {
    const metric = games[r.gameId]?.metric
    const v =
      metric === 'time_low' ? r.timeMs : metric === 'wins' ? (r.won === null ? null : Number(r.won)) : (r.score ?? r.timeMs)
    return v === null ? '—' : formatValue(metric ?? 'score_high', v, fmtNumber)
  }
  const gameName = (id: string) => {
    const g = GAMES.find((x) => x.id === id)
    return g ? loc(g.name) : id
  }
  const modeLabel = (g: string, m: string) => {
    const found = games[g]?.modes.find((x) => x.key === m)
    return found ? loc(found.label) : m
  }
  const modes = games[gameId]?.modes ?? []

  return (
    <div className="admin-runs">
      <form className="admin-bar admin-filters" onSubmit={apply}>
        <label className="admin-field">
          <span>{t('admin.filter.game')}</span>
          <select
            value={gameId}
            onChange={(e) => {
              setGameId(e.target.value)
              setMode('')
            }}
          >
            <option value="">{t('admin.filter.any')}</option>
            {GAMES.map((g) => (
              <option key={g.id} value={g.id}>
                {loc(g.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>{t('admin.filter.mode')}</span>
          <select value={mode} disabled={modes.length === 0} onChange={(e) => setMode(e.target.value)}>
            <option value="">{t('admin.filter.any')}</option>
            {modes.map((m) => (
              <option key={m.key} value={m.key}>
                {loc(m.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>{t('admin.filter.user')}</span>
          <input type="text" value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>
        <label className="admin-field">
          <span>{t('admin.filter.status')}</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('admin.filter.any')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t('admin.status.' + s)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="admin-btn">
          {t('admin.filter.apply')}
        </button>
      </form>
      {error && (
        <p role="alert" className="admin-err">
          {t('admin.error', { code: error })}
        </p>
      )}
      {rows && rows.length === 0 && <p className="lb-note">{t('admin.empty')}</p>}
      {rows && rows.length > 0 && (
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.col.started')}</th>
                <th>{t('admin.col.ended')}</th>
                <th>{t('admin.col.player')}</th>
                <th>{t('admin.col.game')}</th>
                <th>{t('admin.col.value')}</th>
                <th>{t('admin.col.status')}</th>
                <th>{t('admin.col.reason')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-run={r.id}>
                  <td>{text.when(r.startedAt)}</td>
                  <td>{r.endedAt ? text.when(r.endedAt) : '—'}</td>
                  <td>
                    <a href={'#/u/' + r.userId}>{r.displayName}</a>
                  </td>
                  <td>
                    {gameName(r.gameId)} · {modeLabel(r.gameId, r.mode)}
                  </td>
                  <td>{valueOf(r)}</td>
                  <td>{t('admin.status.' + r.status)}</td>
                  <td>{r.rejectReason}</td>
                  <td>
                    {r.status !== 'rejected' && (
                      <button type="button" className="admin-btn" onClick={() => void reject(r)}>
                        {t('admin.reject')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && (
        <button type="button" className="admin-btn admin-more" onClick={() => void loadMore()}>
          {t('admin.more')}
        </button>
      )}
    </div>
  )
}
