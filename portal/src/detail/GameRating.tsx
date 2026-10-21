import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { unitLabel } from '../player/leaderboardModel'
import { useServer } from '../server/ServerProvider'
import type { RatingSummary } from '../server/types'

const STARS = [1, 2, 3, 4, 5]

/** Đánh giá của một game: trung bình, số lượt và 5 sao để tự chấm (cần đăng nhập, khách cũng được). */
export function GameRating({ gameId }: { gameId: string }) {
  const { api } = useServer()
  if (!api) return null
  return <Rating key={gameId} gameId={gameId} />
}

function Rating({ gameId }: { gameId: string }) {
  const { t, fmtNumber } = useI18n()
  const { api, user } = useServer()
  const [summary, setSummary] = useState<RatingSummary | null>(null)
  const [mine, setMine] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const userId = user?.id ?? null

  // Trung bình của mọi game và số sao của mình (chưa đăng nhập thì không hỏi).
  const fetchBoth = () =>
    Promise.all([api!.ratingSummary(), userId ? api!.myRatings() : Promise.resolve<Record<string, number>>({})])
  const apply = ([all, my]: [Record<string, RatingSummary>, Record<string, number>]) => {
    setSummary(all[gameId] ?? null)
    setMine(my[gameId] ?? null)
  }

  useEffect(() => {
    let alive = true
    fetchBoth().then(
      (r) => alive && apply(r),
      () => {},
    )
    return () => {
      alive = false
    }
    // fetchBoth/apply chỉ phụ thuộc api, gameId, userId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, gameId, userId])

  const rate = async (stars: number | null) => {
    if (!api || busy || !userId) return
    const prev = mine
    setMine(stars)
    setBusy(true)
    setFailed(false)
    try {
      await api.rateGame(gameId, stars)
      apply(await fetchBoth())
    } catch {
      setMine(prev)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const shown = hover ?? mine ?? 0
  return (
    <div className="rating">
      <div className="rating-summary">
        <span className="rating-avg" aria-hidden="true">
          ★
        </span>
        {summary ? (
          <>
            <b>{summary.average.toFixed(1)}</b>
            <span className="rating-count">{unitLabel(t, 'rate.count', summary.count, fmtNumber)}</span>
          </>
        ) : (
          <span className="rating-count">{t('rate.none')}</span>
        )}
      </div>
      {userId ? (
        <div className="rating-mine">
          <span className="rating-label">{t('rate.yours')}</span>
          <div className="stars" role="radiogroup" aria-label={t('rate.yours')} onMouseLeave={() => setHover(null)}>
            {STARS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={mine === n}
                aria-label={t('rate.star', { n })}
                className={n <= shown ? 'on' : undefined}
                disabled={busy}
                onMouseEnter={() => setHover(n)}
                onClick={() => void rate(n)}
              >
                ★
              </button>
            ))}
          </div>
          {mine !== null && (
            <button type="button" className="rating-clear" disabled={busy} onClick={() => void rate(null)}>
              {t('rate.clear')}
            </button>
          )}
          {failed && (
            <span className="auth-error" role="alert">
              {t('rate.error')}
            </span>
          )}
        </div>
      ) : (
        <span className="rating-label">{t('rate.signIn')}</span>
      )}
    </div>
  )
}
