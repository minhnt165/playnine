import { useState } from 'react'
import { useFavorites } from '../data/favorites'
import type { GameDef } from '../games/catalog'
import { useI18n } from '../i18n/i18n'

type Props = { game: GameDef; className?: string; /** Hiện chữ cạnh trái tim (trang chi tiết). */ withLabel?: boolean }

/** Nút trái tim thêm / bỏ game khỏi danh sách yêu thích. */
export function FavButton({ game, className, withLabel = false }: Props) {
  const { t, loc } = useI18n()
  const { has, toggle } = useFavorites()
  const [pop, setPop] = useState(false)
  const on = has(game.id)
  const name = loc(game.name)
  return (
    <button
      type="button"
      className={'fav-btn' + (on ? ' on' : '') + (pop ? ' pop' : '') + (className ? ' ' + className : '')}
      aria-pressed={on}
      aria-label={withLabel ? undefined : t(on ? 'fav.remove' : 'fav.add', { game: name })}
      title={t(on ? 'fav.remove' : 'fav.add', { game: name })}
      onClick={(e) => {
        // Nút nằm cạnh link thẻ game: không để click lan ra.
        e.preventDefault()
        e.stopPropagation()
        setPop(!on)
        toggle(game.id).catch(() => {})
      }}
      onAnimationEnd={() => setPop(false)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4 7.4 4c2 0 3.5 1.1 4.6 2.7C13.1 5.1 14.6 4 16.6 4c3.5 0 5.8 3.6 4.6 7.1-1.7 4.8-9.2 9.4-9.2 9.4z" />
      </svg>
      {withLabel && <span>{t(on ? 'fav.saved' : 'fav.save')}</span>}
    </button>
  )
}
