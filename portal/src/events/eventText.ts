import { gameById } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'
import type { GameEvent } from '../server/types'
import { localized } from './model'

/** Chữ hiển thị của sự kiện: tên, game, mode và thời gian theo giờ máy người xem. */
export function useEventText() {
  const { lang, loc } = useI18n()
  const { games } = useServer()
  const fmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' })
  return {
    title: (e: GameEvent) => localized(e.title, lang),
    description: (e: GameEvent) => localized(e.description, lang),
    gameName: (e: GameEvent) => {
      const g = gameById(e.gameId)
      return g ? loc(g.name) : e.gameId
    },
    modeLabel: (e: GameEvent) => {
      const m = games[e.gameId]?.modes.find((x) => x.key === e.mode)
      return m ? loc(m.label) : e.mode
    },
    when: (iso: string) => fmt.format(new Date(iso)),
  }
}
