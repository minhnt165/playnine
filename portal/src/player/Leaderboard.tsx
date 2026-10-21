import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { readRaw, write } from '../lib/storage'
import { useServer } from '../server/ServerProvider'
import type { GameMeta, LeaderRow, Period } from '../server/types'
import { formatValue, periodsFor } from './leaderboardModel'

const WIDE = '(min-width: 900px)'
const TOP = 50
const modeKeyOf = (gameId: string) => 'playnine-lb-mode-' + gameId
const PERIOD_LABEL: Record<Period, string> = { day: 'lb.day', week: 'lb.week', all: 'lb.all' }

/** Màn rộng (≥ 900px) hiện ngăn bên phải; không có matchMedia thì coi là màn rộng. */
function useWide(): boolean {
  const get = () => (typeof matchMedia === 'function' ? matchMedia(WIDE).matches : true)
  const [wide, setWide] = useState(get)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(WIDE)
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

type Loaded = { key: string; rows: LeaderRow[]; mine: LeaderRow | null; error: boolean }

type Props = { gameId: string; refreshKey: number }

/** Chỉ render khi có server và game có trong metadata. */
export function Leaderboard({ gameId, refreshKey }: Props) {
  const { api, games } = useServer()
  const meta = games[gameId]
  if (!api || !meta || meta.modes.length === 0) return null
  return <Board key={gameId} meta={meta} refreshKey={refreshKey} />
}

function Row({ r, me, value, you }: { r: LeaderRow; me: boolean; value: string; you: string }) {
  return (
    <li className={me ? 'me' : undefined}>
      <span className="lb-rank">{r.rank}</span>
      <span className="lb-name">
        <a href={`#/u/${encodeURIComponent(r.userId)}`}>{r.displayName}</a>
        {me && <em className="lb-you">{you}</em>}
      </span>
      <span className="lb-value">{value}</span>
    </li>
  )
}
function Board({ meta, refreshKey }: { meta: GameMeta; refreshKey: number }) {
  const { api, user } = useServer()
  const { t, lang, fmtNumber } = useI18n()
  const gameId = meta.id
  const wide = useWide()
  const [open, setOpen] = useState(false)
  const [savedMode, setSavedMode] = useState(() => readRaw(modeKeyOf(gameId)))
  const [savedPeriod, setSavedPeriod] = useState<Period | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  const mode = meta.modes.some((m) => m.key === savedMode) ? (savedMode as string) : meta.modes[0].key
  const periods = periodsFor(mode)
  const period = savedPeriod && periods.includes(savedPeriod) ? savedPeriod : periods[0]
  const viewKey = `${mode}|${period}`
  const userId = user?.id ?? null
  const active = wide || open

  useEffect(() => {
    if (!api || !active) return
    let alive = true
    const key = `${mode}|${period}`
    ;(async () => {
      try {
        const rows = await api.leaderboard(gameId, mode, period, TOP)
        let mine: LeaderRow | null = null
        if (user && !rows.some((r) => r.userId === user.id)) {
          const r = await api.myRank(gameId, mode, period)
          if (r) mine = { rank: r.rank, userId: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, value: r.value, achievedAt: '' }
        }
        if (alive) setLoaded({ key, rows, mine, error: false })
      } catch {
        if (alive) setLoaded({ key, rows: [], mine: null, error: true })
      }
    })()
    return () => {
      alive = false
    }
    // user đổi theo userId; displayName đổi không cần tải lại bảng.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, gameId, mode, period, refreshKey, userId, active])

  const close = useCallback(() => {
    setOpen(false)
    openerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  // Rộng ra khi sheet đang mở thì đóng sheet, tránh kẹt trạng thái modal.
  useEffect(() => {
    if (wide) setOpen(false)
  }, [wide])

  // Giữ Tab trong sheet.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const els = sheetRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
    if (!els || els.length === 0) return
    const first = els[0]
    const last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const pickMode = (key: string) => {
    write(modeKeyOf(gameId), key)
    setSavedMode(key)
    setSavedPeriod(null)
  }

  const fmt = (v: number) => formatValue(meta.metric, v, fmtNumber)
  const data = loaded && loaded.key === viewKey ? loaded : null
  const body = (
    <>
      <div className="lb-tabs" role="tablist">
        {meta.modes.map((m) => (
          <button key={m.key} type="button" role="tab" aria-selected={m.key === mode} onClick={() => pickMode(m.key)}>
            {m.label[lang]}
          </button>
        ))}
      </div>
      <div className="lb-tabs lb-periods" role="tablist">
        {periods.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={p === period} onClick={() => setSavedPeriod(p)}>
            {t(PERIOD_LABEL[p])}
          </button>
        ))}
      </div>
      {data?.error ? (
        <p className="lb-note lb-error" role="alert">
          {t('lb.error')}
        </p>
      ) : data && data.rows.length === 0 && !data.mine ? (
        <p className="lb-note">{t('lb.empty')}</p>
      ) : data ? (
        <ol className="lb-list">
          {data.rows.map((r) => (
            <Row key={r.userId} r={r} me={r.userId === userId} value={fmt(r.value)} you={t('lb.you')} />
          ))}
          {data.mine && (
            <>
              <li className="lb-gap" aria-hidden="true">
                …
              </li>
              <Row r={data.mine} me value={fmt(data.mine.value)} you={t('lb.you')} />
            </>
          )}
        </ol>
      ) : null}
    </>
  )

  if (wide) {
    return (
      <aside className="lb-panel" aria-labelledby={titleId}>
        <h2 id={titleId}>{t('lb.title')}</h2>
        {body}
      </aside>
    )
  }
  return (
    <>
      <button ref={openerRef} type="button" className="lb-open" onClick={() => setOpen(true)}>
        {t('lb.open')}
      </button>
      {open && (
        <div className="lb-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
          <div ref={sheetRef} className="lb-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}>
            <div className="lb-sheet-head">
              <h2 id={titleId}>{t('lb.title')}</h2>
              <button ref={closeRef} type="button" className="lb-close" aria-label={t('lb.close')} onClick={close}>
                ×
              </button>
            </div>
            {body}
          </div>
        </div>
      )}
    </>
  )
}