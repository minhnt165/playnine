import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useEventText } from '../events/eventText'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'
import type { AdminPlayer } from '../server/types'
import { errorCode } from './forms'

/** Tab Người chơi: tìm theo tên hoặc id, khóa/mở khóa. */
export function AdminPlayers() {
  const { t, fmtNumber } = useI18n()
  const { api, user } = useServer()
  const text = useEventText()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminPlayer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const load = useCallback(
    async (query: string) => {
      if (!api) return
      const mine = ++seq.current
      try {
        const list = await api.adminPlayers(query)
        if (mine !== seq.current) return
        setRows(list)
        setError(null)
      } catch (e) {
        if (mine === seq.current) setError(errorCode(e))
      }
    },
    [api],
  )

  useEffect(() => {
    void load('')
  }, [load])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void load(q.trim())
  }

  const toggleBan = async (p: AdminPlayer) => {
    if (!api || !confirm(t('admin.banConfirm', { name: p.displayName }))) return
    try {
      await api.adminSetBanned(p.id, !p.banned)
      setRows((cur) => cur && cur.map((x) => (x.id === p.id ? { ...x, banned: !p.banned } : x)))
      setError(null)
    } catch (e) {
      setError(errorCode(e))
    }
  }

  return (
    <div className="admin-players">
      <form className="admin-bar" role="search" onSubmit={submit}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('admin.search')} />
        <button type="submit" className="admin-btn">
          {t('admin.search')}
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
                <th>{t('admin.col.player')}</th>
                <th>{t('admin.col.role')}</th>
                <th>{t('admin.col.runs')}</th>
                <th>{t('admin.col.created')}</th>
                <th>{t('admin.col.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} data-player={p.id}>
                  <td>
                    <a href={'#/u/' + p.id}>{p.displayName}</a>
                  </td>
                  <td>{p.role}</td>
                  <td>{fmtNumber(p.runs)}</td>
                  <td>{text.when(p.createdAt)}</td>
                  <td>{p.banned ? t('admin.banned') : t('admin.active')}</td>
                  <td>
                    {p.id !== user?.id && (
                      <button type="button" className="admin-btn" onClick={() => void toggleBan(p)}>
                        {p.banned ? t('admin.unban') : t('admin.ban')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
