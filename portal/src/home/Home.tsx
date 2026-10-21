import { useMemo } from 'react'
import { sudokuData } from '../data/sudoku'
import { xiangqiData } from '../data/xiangqi'
import { summaries } from '../data/summary'
import { recent } from '../data/recent'
import { useI18n } from '../i18n/i18n'
import { Footer } from './Footer'
import { GameGrid } from './GameGrid'
import { Hero } from './Hero'
import { buildStats } from './stats'
import { Stats } from './StatsPanel'
import { Today } from './Today'
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
    () => buildTodayTiles({ sd, xq, rec, sums, now, i18n }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, i18n.lang],
  )
  const stats = useMemo(
    () => buildStats(sd, sums, i18n),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, i18n.lang],
  )

  return (
    <div className="wrap">
      <Topbar onThemeApplied={onThemeApplied} />
      <main>
        <Hero now={now} />
        <Today tiles={tiles} />
        <GameGrid sd={sd} xq={xq} rec={rec} sums={sums} openIds={openIds} now={now} />
        <Stats items={stats} />
      </main>
      <Footer />
    </div>
  )
}