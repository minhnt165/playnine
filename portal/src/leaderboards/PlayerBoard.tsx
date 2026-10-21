import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { unitLabel } from '../player/leaderboardModel'
import { Row } from '../player/LeaderRow'
import { Podium, PODIUM } from './Podium'
import { useServer } from '../server/ServerProvider'
import type { Period, PlayerKind, PlayerRow } from '../server/types'

const KINDS: PlayerKind[] = ['points', 'runs', 'wins', 'badges']
const PERIOD_LABEL: Record<Period, string> = { day: 'lb.day', week: 'lb.week', all: 'lb.all' }
/** Huy hiệu chỉ tính mọi lúc; điểm, số ván và số trận thắng có cả tuần và ngày. */
export const periodsOfKind = (k: PlayerKind): Period[] => (k === 'badges' ? ['all'] : ['week', 'day', 'all'])
const TOP = 50

type Loaded = { key: string; rows: PlayerRow[]; error: boolean }

/** Xếp hạng người chơi toàn cổng: chọn tiêu chí và kỳ; top 3 lên bục, còn lại dạng danh sách. */
export function PlayerBoard() {
  const { t, fmtNumber } = useI18n()
  const { api, user } = useServer()
  const [kind, setKind] = useState<PlayerKind>('points')
  const [savedPeriod, setSavedPeriod] = useState<Period>('week')
  const periods = periodsOfKind(kind)
  const period = periods.includes(savedPeriod) ? savedPeriod : periods[0]
  const key = kind + '|' + period
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!api) return
    let alive = true
    api.playerLeaderboard(kind, period, TOP).then(
      (rows) => alive && setLoaded({ key: kind + '|' + period, rows, error: false }),
      () => alive && setLoaded({ key: kind + '|' + period, rows: [], error: true }),
    )
    return () => {
      alive = false
    }
  }, [api, kind, period])

  const view = loaded?.key === key ? loaded : null
  const unit = (n: number) => unitLabel(t, 'lbs.unit.' + kind, n, fmtNumber)
  const rest = view ? view.rows.slice(PODIUM) : []

  return (
    <section className="lb-panel lbs-players">
      <div className="lb-tabs" role="group" aria-label={t('lbs.kind')}>
        {KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={k === kind} onClick={() => setKind(k)}>
            {t('lbs.' + k)}
          </button>
        ))}
      </div>
      {periods.length > 1 && (
        <div className="lb-tabs lb-periods" role="group" aria-label={t('lb.title')}>
          {periods.map((p) => (
            <button key={p} type="button" aria-pressed={p === period} onClick={() => setSavedPeriod(p)}>
              {t(PERIOD_LABEL[p])}
            </button>
          ))}
        </div>
      )}
      {!view ? null : view.error ? (
        <p className="lb-note lb-error">{t('lb.error')}</p>
      ) : view.rows.length === 0 ? (
        <p className="lb-note">{t('lb.empty')}</p>
      ) : (
        <>
          <Podium rows={view.rows} meId={user?.id ?? null} value={unit} />
          {rest.length > 0 && (
            <ol className="lb-list" start={PODIUM + 1}>
              {rest.map((r) => (
                <Row key={r.userId} r={{ ...r, achievedAt: '' }} me={r.userId === user?.id} value={unit(r.value)} you={t('lb.you')} />
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  )
}
