import { useMemo, useState, type CSSProperties } from 'react'
import { sudokuData } from '../data/sudoku'
import { xiangqiData } from '../data/xiangqi'
import { summaries } from '../data/summary'
import { recent } from '../data/recent'
import { isHidden } from '../events/model'
import { GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'
import { CollectionRows } from './CollectionRows'
import { EventBanner } from './EventBanner'
import { Footer } from './Footer'
import { GameGrid } from './GameGrid'
import { MostPlayed } from './MostPlayed'
import { buildStats } from './stats'
import { SearchBox } from './SearchBox'
import { Spotlight } from './Spotlight'
import { Stats } from './StatsPanel'
import { Today } from './Today'
import { TopWeek } from './TopWeek'
import { usePlayTotals } from './usePlayTotals'
import { useRatingSummary } from './useRatingSummary'
import { buildTodayTiles } from './todayTiles'
import { Topbar } from './Topbar'
import { useReveal } from './useReveal'

type Props = {
  /** Game đang giữ iframe (cho ruy băng "đang mở"). */
  openIds: Set<string>
  /** Đổi giá trị này thì đọc lại dữ liệu localStorage. */
  refreshKey: number
  /** Gọi sau khi áp giao diện (Task 6 truyền recolor). */
  onThemeApplied?: () => void
}

export function Home({ openIds, refreshKey, onThemeApplied }: Props) {
  const i18n = useI18n()
  const { games } = useServer()
  const [query, setQuery] = useState('')
  const totals = usePlayTotals()
  const ratings = useRatingSummary()
  // Đang tìm thì chỉ còn kết quả trong thư viện game, như cửa hàng game.
  const searching = query.trim() !== ''
  useReveal(refreshKey + ':' + i18n.lang)

  // Đọc lại khi đổi ngôn ngữ (nhãn) hoặc refreshKey; mốc `now` cố định cho cả lần vẽ.
  const data = useMemo(() => {
    const now = new Date()
    const sd = sudokuData(i18n.t, now)
    const xq = xiangqiData()
    const rec = recent()
    const sums = summaries()
    return { now, sd, xq, rec, sums }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, i18n.lang])
  const { now, sd, xq, rec, sums } = data

  const tiles = useMemo(
    () => {
      const hiddenIds = new Set(Object.keys(games).filter((id) => isHidden(games, id)))
      return buildTodayTiles({ sd, xq, rec, sums, now, i18n, hiddenIds })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, i18n.lang, games],
  )
  const stats = useMemo(
    () => buildStats(sd, sums, i18n),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, i18n.lang],
  )

  return (
    <div className="wrap">
      <Topbar onThemeApplied={onThemeApplied} search={<SearchBox value={query} onChange={setQuery} />} />
      <main>
        {!searching && (
          <>
            <Spotlight now={now} games={GAMES.filter((g) => !isHidden(games, g.id))} />
            <EventBanner />
            {tiles.length > 0 && (
              <div className="section-head reveal" style={{ '--i': 2 } as CSSProperties}>
                <h2>{i18n.t('today.label')}</h2>
              </div>
            )}
            <Today tiles={tiles} />
            <MostPlayed totals={totals} />
            <TopWeek />
            <CollectionRows />
          </>
        )}
        <GameGrid sd={sd} xq={xq} rec={rec} sums={sums} openIds={openIds} now={now} query={query} onClearQuery={() => setQuery('')} totals={totals} ratings={ratings} />
        {!searching && <Stats items={stats} />}
      </main>
      <Footer />
    </div>
  )
}