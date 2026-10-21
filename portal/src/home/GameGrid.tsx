import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CATS, GAMES } from '../games/catalog'
import type { SudokuData } from '../data/sudoku'
import type { XqData } from '../data/xiangqi'
import { XQ_LEVEL } from '../data/xiangqi'
import type { Summary } from '../data/summary'
import { useI18n } from '../i18n/i18n'
import { readRaw, write } from '../lib/storage'
import { fmtDuration } from '../lib/time'
import { Filters, type FilterKey } from './Filters'
import { GameCard } from './GameCard'
import { mountPreviews } from '../legacy/previews'
import { prefersReducedMotion } from './media'
import { isPlaying } from '../player/playing'
import { lastPlayedId, ribbonFor } from './ribbon'

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
}

export function GameGrid({ sd, xq, rec, sums, openIds, now }: Props) {
  const { t, loc } = useI18n()
  const [filter, setFilter] = useState<FilterKey>(initialFilter)
  const lastId = lastPlayedId(rec)
  const listRef = useRef<HTMLUListElement>(null)
  const cardKey = GAMES.map((g) => g.id).join()

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
        <h2>{t('games.title')}</h2>
        <Filters
          filter={filter}
          onChange={(k) => {
            setFilter(k)
            write(FILTER_KEY, k)
          }}
        />
      </div>
      <ul className="games" id="games" ref={listRef}>
        {GAMES.map((g, i) => (
          <GameCard
            key={g.id}
            game={g}
            index={i}
            hidden={filter !== 'all' && g.cat !== filter}
            ribbon={ribbonFor(g, { openIds, lastId, rec, t, now: now.getTime() })}
            note={notes[g.id] || (sums[g.id]?.note ? String(sums[g.id].note) : loc(g.note))}
          />
        ))}
      </ul>
    </>
  )
}