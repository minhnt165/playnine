import type { I18nApi } from '../i18n/i18n'
import { GAMES, gameById, type GameDef } from '../games/catalog'
import type { SudokuData } from '../data/sudoku'
import { SUDOKU_DIFF } from '../data/sudoku'
import type { XqData } from '../data/xiangqi'
import { XQ_LEVEL } from '../data/xiangqi'
import type { Summary } from '../data/summary'
import { dateKeyOf, fmtAgo, fmtDuration } from '../lib/time'

/** html chỉ đến từ DICT (tin cậy); text dành cho chữ do game ghi (render dạng text node). */
export type TileText = { html: string } | { text: string }

export type TodayTile = {
  game: GameDef
  badge: 'play' | 'daily' | 'done' | 'new'
  kicker: string
  title: TileText
  meta: TileText
  bar?: number
}

export const MAX_TODAY = 3

type Input = {
  sd: SudokuData
  xq: XqData
  rec: Record<string, number>
  sums: Record<string, Summary>
  now: Date
  i18n: I18nApi
}

/** Thứ tự ưu tiên: ván đang dở (mới nhất trước) → đề hằng ngày chưa làm → đề đã xong → gợi ý khác. */
export function buildTodayTiles({ sd, xq, rec, sums, now, i18n }: Input): TodayTile[] {
  const { t, loc, weekdayOf } = i18n
  const resumes: { at: number; tile: TodayTile }[] = []
  const todo: TodayTile[] = []
  const done: TodayTile[] = []
  const extras: TodayTile[] = []
  const todayKey = dateKeyOf(now)
  const weekday = weekdayOf(now)
  const streakMeta = (n: number): TileText => ({
    html: n ? '<span class="streak">' + t('streak.days', { n }) + '</span>' : t('streak.start'),
  })

  const sudoku = gameById('sudoku')!
  const sdDone = sd.today.time !== null
  ;(sdDone ? done : todo).push({
    game: sudoku,
    badge: sdDone ? 'done' : 'daily',
    kicker: t('today.daily', { game: String(loc(sudoku.name)), day: weekday }),
    title: {
      text: sdDone
        ? t('today.doneIn', { time: fmtDuration(sd.today.time as number) })
        : t('today.difficulty', { diff: t(SUDOKU_DIFF[sd.today.diff]) }),
    },
    meta: streakMeta(sd.streak),
  })

  if (sd.current) {
    const pct = Math.round(sd.current.pct * 100)
    resumes.push({
      at: rec.sudoku || 0,
      tile: {
        game: sudoku,
        badge: 'play',
        kicker: t('today.continue', { game: String(loc(sudoku.name)) }),
        title: { text: t('today.filled', { label: sd.current.label, pct }) },
        meta: { text: '⏱ ' + fmtDuration(sd.current.seconds) + ' · ' + t('today.mistakes', { n: sd.current.mistakes }) },
        bar: sd.current.pct,
      },
    })
  }

  GAMES.forEach((g) => {
    const s = sums[g.id]
    if (s?.resume) {
      resumes.push({
        at: s.updatedAt,
        tile: {
          game: g,
          badge: 'play',
          kicker: t('today.continue', { game: String(loc(g.name)) }),
          title: { text: String(s.resume.title) },
          meta: { text: String(s.resume.detail || '') },
          bar: typeof s.resume.pct === 'number' ? Math.max(0, Math.min(1, s.resume.pct)) : undefined,
        },
      })
    }
    if (s?.daily && s.daily.date === todayKey) {
      ;(s.daily.done ? done : todo).push({
        game: g,
        badge: s.daily.done ? 'done' : 'daily',
        kicker: t('today.daily', { game: String(loc(g.name)), day: weekday }),
        title: { text: s.daily.done ? t('today.doneToday') : String(s.daily.title || t('today.todayPuzzle')) },
        meta: streakMeta(Number(s.daily.streak) || 0),
      })
    } else if (g.daily) {
      // Game có đề hằng ngày nhưng hôm nay chưa mở lần nào
      const streak = s?.daily ? Number(s.daily.streak) || 0 : 0
      todo.push({
        game: g,
        badge: 'daily',
        kicker: t('today.daily', { game: String(loc(g.name)), day: weekday }),
        title: { text: String(loc(g.daily)) },
        meta: streakMeta(streak),
      })
    }
  })

  const tried = GAMES.filter((g) => g.isNew && !rec[g.id])
  if (tried.length) {
    const g = tried[0]
    extras.push({
      game: g,
      badge: 'new',
      kicker: t('today.newGame'),
      title: { text: t('today.try', { game: String(loc(g.name)) }) },
      meta: { text: String(loc(g.note) ?? '') },
    })
  }
  const xiangqi = gameById('xiangqi')!
  extras.push({
    game: xiangqi,
    badge: 'play',
    kicker: String(loc(xiangqi.name)),
    title: { text: xq.level ? t('today.xqRematch', { level: t(XQ_LEVEL[xq.level]) }) : t('today.xqTry') },
    meta: { text: rec.xiangqi ? t('today.xqLast', { ago: fmtAgo(rec.xiangqi, t, now.getTime()) }) : t('today.xqRed') },
  })

  resumes.sort((a, b) => b.at - a.at)
  return [...resumes.map((r) => r.tile), ...todo, ...done, ...extras].slice(0, MAX_TODAY)
}
