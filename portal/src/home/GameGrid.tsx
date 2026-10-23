import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { isHidden } from '../events/model'
import { CATS, GAMES, type GameDef } from '../games/catalog'
import type { SudokuData } from '../data/sudoku'
import type { XqData } from '../data/xiangqi'
import { XQ_LEVEL } from '../data/xiangqi'
import type { Summary } from '../data/summary'
import type { RatingSummary } from '../server/types'
import { useI18n } from '../i18n/i18n'
import { readRaw, write } from '../lib/storage'
import { fmtDuration } from '../lib/time'
import { useServer } from '../server/ServerProvider'
import { Filters, type FilterKey } from './Filters'
import { GameCard } from './GameCard'
import { mountPreviews } from '../legacy/previews'
import { prefersReducedMotion } from './media'
import { isPlaying } from '../player/playing'
import { gamesHref } from '../player/route'
import { lastPlayedId, ribbonFor } from './ribbon'
import { matchesQuery } from './search'

const FILTER_KEY = 'game-portal-filter-v1'

const initialFilter = (): FilterKey => {
  const v = readRaw(FILTER_KEY)
  return v !== null && Object.hasOwn(CATS, v) ? (v as FilterKey) : 'all'
}

type Props = {
  sd: SudokuData
  xq: XqData
  rec: Record<string, number>
  sums: Record<string, Summary>
  openIds: Set<string>
  now: Date
  /** Từ khóa ở ô tìm trên thanh trên; rỗng thì không lọc. */
  query?: string
  onClearQuery?: () => void
  /** Tổng lượt chơi từ server (Home tải một lần, dùng chung với dải "Chơi nhiều nhất"). */
  totals?: Record<string, number>
  /** Đánh giá trung bình theo game. */
  ratings?: Record<string, RatingSummary>
  /** Danh sách theo thứ tự muốn hiện (trang #/games truyền bản đã sắp xếp); mặc định là danh mục. */
  list?: GameDef[]
  /** Hiện tối đa bấy nhiêu thẻ (khi không tìm kiếm) kèm nút "Xem tất cả" tới #/games. */
  limit?: number
}

export function GameGrid({ sd, xq, rec, sums, openIds, now, query = '', onClearQuery, totals = {}, ratings = {}, list = GAMES, limit }: Props) {
  const { t, loc } = useI18n()
  const [filter, setFilter] = useState<FilterKey>(initialFilter)
  const lastId = lastPlayedId(rec)
  const listRef = useRef<HTMLUListElement>(null)
  const { api, games } = useServer()
  // Game bị admin ẩn thì bỏ hẳn khỏi lưới (phím số vẫn dùng chỉ số gốc trong GAMES).
  const shown = list.filter((g) => !isHidden(games, g.id))
  const cardKey = shown.map((g) => g.id).join()
  const matched = new Set(shown.filter((g) => matchesQuery(g, query)).map((g) => g.id))
  const inView = shown.filter((g) => matched.has(g.id) && (filter === 'all' || g.cat === filter))
  const visibleCount = inView.length
  // Trang chủ chỉ hiện `limit` thẻ đầu; đang tìm thì hiện hết kết quả.
  const capped = limit !== undefined && !query.trim() && visibleCount > limit ? new Set(inView.slice(0, limit).map((g) => g.id)) : null

  // Chỉ gắn lại preview khi tập thẻ đổi (không phải mỗi lần render); dọn khi gỡ.
  useEffect(() => mountPreviews(listRef.current!, { isPlaying, reduceMotion: prefersReducedMotion() }), [cardKey])
  const notes: Record<string, string> = {
    sudoku: sd.won
      ? t('note.sudokuWins', { n: sd.won }) + (sd.best ? t('note.sudokuBest', { time: fmtDuration(sd.best.time) }) : '')
      : t('note.sudokuNone'),
    xiangqi: xq.level ? t('note.xqLevel', { level: t(XQ_LEVEL[xq.level]) }) : t('note.xqAi'),
  }

  return (
    <>
      <div className="section-head reveal" style={{ '--i': 4 } as CSSProperties}>
        <h2>{query.trim() ? t('games.results', { q: query.trim() }) : t('games.title')}</h2>
        <Filters
          filter={filter}
          games={shown}
          onChange={(k) => {
            setFilter(k)
            write(FILTER_KEY, k)
          }}
        />
      </div>
      <ul className="games" id="games" ref={listRef}>
        {shown.map((g) => (
          <GameCard
            key={g.id}
            game={g}
            index={GAMES.indexOf(g)}
            hidden={(filter !== 'all' && g.cat !== filter) || !matched.has(g.id) || (capped !== null && !capped.has(g.id))}
            plays={api ? totals[g.id] : undefined}
            rating={ratings[g.id]}
            ribbon={ribbonFor(g, { openIds, lastId, rec, t, now: now.getTime() })}
            note={notes[g.id] || (sums[g.id]?.note ? String(sums[g.id].note) : loc(g.note))}
          />
        ))}
      </ul>
      {capped && (
        <a className="games-more" href={gamesHref}>
          {t('games.seeAll', { n: visibleCount })} <span aria-hidden="true">→</span>
        </a>
      )}
      {query.trim() !== '' && visibleCount === 0 && (
        <div className="games-empty">
          <p>{t('games.noMatch', { q: query.trim() })}</p>
          <button type="button" onClick={onClearQuery}>
            {t('games.clear')}
          </button>
        </div>
      )}
    </>
  )
}