import { useEffect, useMemo, useState } from 'react'
import { recent } from '../data/recent'
import { sudokuData } from '../data/sudoku'
import { summaries } from '../data/summary'
import { xiangqiData } from '../data/xiangqi'
import { GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { readRaw, write } from '../lib/storage'
import { GameGrid } from './GameGrid'
import { SearchBox } from './SearchBox'
import { SORT_KEYS, sortGames, type SortKey } from './sortGames'
import { Topbar } from './Topbar'
import { usePlayTotals } from './usePlayTotals'
import { useRatingSummary } from './useRatingSummary'
import { useReveal } from './useReveal'

const SORT_KEY = 'game-portal-sort-v1'
const LABELS: Record<SortKey, string> = {
  order: 'games.sortOrder',
  newest: 'games.sortNewest',
  plays: 'games.sortPlays',
  rating: 'games.sortRating',
  name: 'games.sortName',
}

const initialSort = (): SortKey => {
  const v = readRaw(SORT_KEY)
  return SORT_KEYS.includes(v as SortKey) ? (v as SortKey) : 'order'
}

/** Trang #/games: mọi game, lọc theo thể loại, tìm theo tên và sắp xếp (trang chủ chỉ hiện một phần). */
export function GamesPage({ onThemeApplied }: { onThemeApplied?: () => void }) {
  const { t, lang } = useI18n()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>(initialSort)
  const totals = usePlayTotals()
  const ratings = useRatingSummary()
  // Đổi cách sắp xếp thì không chạy lại hiệu ứng xuất hiện của thẻ
  useReveal('games:' + lang + ':' + sort)

  useEffect(() => {
    const prev = document.title
    document.title = t('games.all') + ' · PlayNine'
    return () => {
      document.title = prev
    }
  }, [t])

  // Dữ liệu localStorage cho ghi chú / ruy băng trên thẻ, đọc một lần cho mỗi ngôn ngữ.
  const data = useMemo(() => {
    const now = new Date()
    return { now, sd: sudokuData(t, now), xq: xiangqiData(), rec: recent(), sums: summaries() }
  }, [t])
  const list = useMemo(() => sortGames(GAMES, sort, { totals, ratings, lang }), [sort, totals, ratings, lang])

  return (
    <div className="wrap" data-page="games">
      <Topbar onThemeApplied={onThemeApplied} search={<SearchBox value={query} onChange={setQuery} />} />
      <main className="games-page">
        <div className="games-page-head">
          <h1 className="ev-heading">{t('games.all')}</h1>
          <label className="games-sort">
            <span>{t('games.sort')}</span>
            <select
              value={sort}
              aria-label={t('games.sort')}
              onChange={(e) => {
                const v = e.target.value as SortKey
                setSort(v)
                write(SORT_KEY, v)
              }}
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(LABELS[k])}
                </option>
              ))}
            </select>
          </label>
        </div>
        <GameGrid {...data} openIds={new Set()} query={query} onClearQuery={() => setQuery('')} totals={totals} ratings={ratings} list={list} />
      </main>
    </div>
  )
}
