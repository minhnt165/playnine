import { useCallback, useEffect, useRef, useState } from 'react'
import { isHidden } from '../events/model'
import { GAMES, gameById } from '../games/catalog'
import { Topbar } from '../home/Topbar'
import { useI18n } from '../i18n/i18n'
import { dateKeyOf } from '../lib/time'
import { formatValue, unitLabel } from '../player/leaderboardModel'
import { detailHref, playHref } from '../player/route'
import { rememberReturnHash } from '../server/returnHash'
import { useServer } from '../server/ServerProvider'
import type { HistoryRun } from '../server/types'

const PAGE = 30

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; runs: HistoryRun[]; more: boolean; loadingMore: boolean; moreFailed: boolean }

type Day = { key: string; date: Date; runs: HistoryRun[] }

/** Gom ván theo ngày giờ máy, giữ thứ tự mới nhất trước. */
export function groupByDay(runs: HistoryRun[]): Day[] {
  const days: Day[] = []
  for (const r of runs) {
    const date = new Date(r.endedAt)
    const key = dateKeyOf(date)
    const last = days[days.length - 1]
    if (last?.key === key) last.runs.push(r)
    else days.push({ key, date, runs: [r] })
  }
  return days
}

/** Trang #/history: các ván của chính người dùng (mới nhất trước), lọc theo game, gom theo ngày, tải thêm theo trang. */
export function HistoryPage({ onThemeApplied }: { onThemeApplied?: () => void }) {
  const { t, lang, loc, fmtDate, fmtNumber } = useI18n()
  const { api, user, authReady, games } = useServer()
  const [gameId, setGameId] = useState('')
  const [state, setState] = useState<State>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [authFailed, setAuthFailed] = useState(false)
  // Tăng mỗi lần tải lại từ đầu: bỏ kết quả "xem thêm" của bộ lọc cũ.
  const seq = useRef(0)
  const userId = user?.id ?? null

  useEffect(() => {
    const prev = document.title
    document.title = t('history.title') + ' · PlayNine'
    return () => {
      document.title = prev
    }
  }, [t])

  useEffect(() => {
    if (!api || !userId) return
    const id = ++seq.current
    setState({ status: 'loading' })
    api.myRuns(gameId ? { gameId, limit: PAGE } : { limit: PAGE }).then(
      (runs) => id === seq.current && setState({ status: 'ready', runs, more: runs.length >= PAGE, loadingMore: false, moreFailed: false }),
      () => id === seq.current && setState({ status: 'error' }),
    )
  }, [api, userId, gameId, reload])

  const loadMore = useCallback(() => {
    if (!api || state.status !== 'ready' || state.loadingMore || state.runs.length === 0) return
    const id = seq.current
    const before = state.runs[state.runs.length - 1].endedAt
    setState({ ...state, loadingMore: true, moreFailed: false })
    api.myRuns(gameId ? { gameId, before, limit: PAGE } : { before, limit: PAGE }).then(
      (page) =>
        id === seq.current &&
        setState((s) => {
          if (s.status !== 'ready') return s
          const seen = new Set(s.runs.map((r) => r.id))
          return { ...s, runs: [...s.runs, ...page.filter((r) => !seen.has(r.id))], more: page.length >= PAGE, loadingMore: false }
        }),
      () => id === seq.current && setState((s) => (s.status === 'ready' ? { ...s, loadingMore: false, moreFailed: true } : s)),
    )
  }, [api, state, gameId])

  const signIn = (fn: () => Promise<void>) => {
    setAuthFailed(false)
    fn().catch(() => setAuthFailed(true))
  }

  const filterGames = GAMES.filter((g) => g.sdk && !isHidden(games, g.id))
  const picked = gameById(gameId)

  const now = new Date()
  const todayKey = dateKeyOf(now)
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const yesterdayKey = dateKeyOf(yesterday)
  const dayLabel = (d: Day) =>
    d.key === todayKey
      ? t('history.today')
      : d.key === yesterdayKey
        ? t('history.yesterday')
        : fmtDate(d.date, {
            // Tiếng Việt dùng tháng dạng số (18/10) cho gọn trên điện thoại.
            weekday: 'long', day: 'numeric', month: lang === 'vi' ? 'numeric' : 'short',
            ...(d.date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
          })
  const pts = (n: number) => unitLabel(t, 'lbs.unit.points', n, fmtNumber)

  const resultOf = (r: HistoryRun) =>
    r.status === 'rejected'
      ? { cls: 'is-rejected', text: t('history.rejected') }
      : r.won === true
        ? { cls: 'is-won', text: t('history.won') }
        : r.won === false
          ? { cls: 'is-lost', text: t('history.lost') }
          : { cls: 'is-done', text: t('history.finished') }

  const reasonOf = (reason: string | null) => {
    if (!reason) return null
    const key = 'history.reason.' + reason
    const s = t(key)
    return s === key ? reason : s
  }

  /** Điểm số hoặc thời gian theo chỉ số của game; game tính thắng thì chỉ hiện kết quả. */
  const valueOf = (r: HistoryRun) => {
    if (r.status === 'rejected') return null
    const metric = games[r.gameId]?.metric ?? (r.timeMs != null ? 'time_low' : 'score_high')
    if (metric === 'wins') return null
    const v = metric === 'time_low' ? r.timeMs : r.score
    if (v == null) return null
    return { text: formatValue(metric, v, fmtNumber), label: t(metric === 'time_low' ? 'history.time' : 'history.score') }
  }

  const row = (r: HistoryRun) => {
    const game = gameById(r.gameId)
    const name = game ? loc(game.name) : r.gameId
    const modeMeta = games[r.gameId]?.modes.find((m) => m.key === r.mode)
    const mode = modeMeta ? loc(modeMeta.label) : r.mode
    const res = resultOf(r)
    const value = valueOf(r)
    const reason = r.status === 'rejected' ? reasonOf(r.rejectReason) : null
    const ended = new Date(r.endedAt)
    return (
      <li key={r.id} className={'hist-row ' + res.cls}>
        {game ? (
          <a className="hist-icon" href={detailHref(game)} tabIndex={-1} aria-hidden="true">
            <span className="card-icon" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} />
          </a>
        ) : (
          <span className="hist-icon" aria-hidden="true">
            <span className="card-icon" />
          </span>
        )}
        <div className="hist-main">
          {game ? (
            <a className="hist-game" href={detailHref(game)}>
              {name}
            </a>
          ) : (
            <span className="hist-game">{name}</span>
          )}
          <span className="hist-meta">
            <span className="hist-mode">{mode}</span>
            <span aria-hidden="true"> · </span>
            <time dateTime={r.endedAt}>{fmtDate(ended, { hour: '2-digit', minute: '2-digit' })}</time>
          </span>
        </div>
        <div className="hist-res">
          <span className="hist-badge">{res.text}</span>
          {value && (
            <span className="hist-value" title={value.label}>
              {value.text}
            </span>
          )}
          {reason && <span className="hist-reason">{reason}</span>}
        </div>
        {r.points > 0 ? (
          <span className="hist-pts">+{pts(r.points)}</span>
        ) : (
          <span className="hist-pts is-zero" title={t(r.status === 'rejected' ? 'history.zeroRejected' : 'history.zeroPoints')}>
            {pts(0)}
          </span>
        )}
        {game ? (
          <a className="hist-again" href={playHref(game)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.4-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" fill="currentColor" />
            </svg>
            <span className="hist-again-text">{t('history.playAgain')}</span>
          </a>
        ) : (
          <span className="hist-again-gap" />
        )}
      </li>
    )
  }

  let body
  if (!api) body = <p className="lb-note">{t('history.unavailable')}</p>
  else if (!authReady) body = null
  else if (!user) {
    body = (
      <section className="hist-signin">
        <p>{t('history.signIn')}</p>
        <div className="hist-signin-actions">
          <button
            type="button"
            className="profile-btn"
            onClick={() => {
              rememberReturnHash()
              signIn(() => api.signInWithGoogle())
            }}
          >
            {t('auth.signIn')}
          </button>
          <button type="button" className="profile-btn" onClick={() => signIn(() => api.signInAsGuest())}>
            {t('auth.guest')}
          </button>
        </div>
        {authFailed && (
          <span className="auth-error" role="alert">
            {t('auth.failed')}
          </span>
        )}
      </section>
    )
  } else {
    let list
    if (state.status === 'loading') {
      list = (
        <>
          <p className="lb-note" role="status">
            {t('history.loading')}
          </p>
          <ul className="hist-skel" aria-hidden="true">
            <li />
            <li />
            <li />
          </ul>
        </>
      )
    } else if (state.status === 'error') {
      list = (
        <div className="hist-empty">
          <p className="lb-note">{t('history.error')}</p>
          <button type="button" className="profile-btn" onClick={() => setReload((k) => k + 1)}>
            {t('history.retry')}
          </button>
        </div>
      )
    } else if (state.runs.length === 0) {
      list = (
        <div className="hist-empty">
          <p className="lb-note">{picked ? t('history.emptyGame', { game: loc(picked.name) }) : t('history.empty')}</p>
          {picked ? (
            <a className="detail-play" href={playHref(picked)}>
              {t('detail.play')} <span aria-hidden="true">→</span>
            </a>
          ) : (
            <a className="detail-play" href="#/">
              {t('history.browse')} <span aria-hidden="true">→</span>
            </a>
          )}
        </div>
      )
    } else {
      const days = groupByDay(state.runs)
      list = (
        <>
          {days.map((d) => {
            const dayPts = d.runs.reduce((s, r) => s + r.points, 0)
            return (
              <section key={d.key} className="hist-day" aria-labelledby={'hist-day-' + d.key}>
                <div className="hist-day-head">
                  <h2 id={'hist-day-' + d.key}>{dayLabel(d)}</h2>
                  <span>
                    {fmtNumber(d.runs.length)} {t('history.sum.runs', { n: d.runs.length })}
                    {dayPts > 0 && <> · +{pts(dayPts)}</>}
                  </span>
                </div>
                <ul className="hist-list">{d.runs.map(row)}</ul>
              </section>
            )
          })}
          {state.more && (
            <div className="hist-more">
              <button type="button" className="profile-btn" onClick={loadMore} disabled={state.loadingMore}>
                {state.loadingMore ? t('history.loadingMore') : t('history.more')}
              </button>
              {state.moreFailed && (
                <span className="auth-error" role="alert">
                  {t('history.moreError')}
                </span>
              )}
            </div>
          )}
        </>
      )
    }
    const runs = state.status === 'ready' ? state.runs : []
    const wins = runs.filter((r) => r.status === 'finished' && r.won === true).length
    const earned = runs.reduce((s, r) => s + r.points, 0)
    body = (
      <>
        <div className="hist-bar">
          <label className="hist-filter">
            <span>{t('history.filter')}</span>
            <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
              <option value="">{t('history.allGames')}</option>
              {filterGames.map((g) => (
                <option key={g.id} value={g.id}>
                  {loc(g.name)}
                </option>
              ))}
            </select>
          </label>
          {runs.length > 0 && (
            <ul className="hist-sum" aria-label={t('history.sum')} title={t('history.sum')}>
              <li>
                <b>{fmtNumber(runs.length)}</b> {t('history.sum.runs', { n: runs.length })}
              </li>
              <li>
                <b>{fmtNumber(wins)}</b> {t('history.sum.wins', { n: wins })}
              </li>
              <li>
                <b>{fmtNumber(earned)}</b> {t('history.sum.points', { n: earned })}
              </li>
            </ul>
          )}
        </div>
        {list}
      </>
    )
  }

  return (
    <div className="wrap" data-page="history">
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="profile history">
        <header className="news-head">
          <h1 className="ev-heading">{t('history.title')}</h1>
          <p className="news-tagline">{t('history.tagline')}</p>
        </header>
        {body}
      </main>
    </div>
  )
}
