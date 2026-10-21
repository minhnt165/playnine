import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isHidden } from '../events/model'
import { CATS, GAMES, type Cat, type GameDef } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { detailHref, playHref } from '../player/route'
import { useServer } from '../server/ServerProvider'
import { matchesQuery } from './search'

function Row({ game, onPick }: { game: GameDef; onPick: () => void }) {
  const { t, loc } = useI18n()
  const name = loc(game.name)
  return (
    <li className="gmenu-item">
      <a className="gmenu-link" href={detailHref(game)} onClick={onPick}>
        <span className={'gmenu-icon pv-' + game.id} aria-hidden="true">
          <span className="card-icon" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} />
        </span>
        <span className="gmenu-text">
          <span className="gmenu-name">{name}</span>
          <span className="gmenu-sub">{loc(game.sub)}</span>
        </span>
      </a>
      <a className="gmenu-play" href={playHref(game)} onClick={onPick} aria-label={t('menu.playName', { name })} title={t('detail.play')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
        </svg>
      </a>
    </li>
  )
}

/** Menu tất cả game (mở từ sidebar / thanh tab dưới đáy): tìm nhanh, nhóm theo thể loại, vào trang game hoặc chơi ngay. */
export function GameMenu({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const { games } = useServer()
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const shown = GAMES.filter((g) => !isHidden(games, g.id))
  const found = query.trim() ? shown.filter((g) => matchesQuery(g, query)) : null

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    input.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      // Giữ Tab trong menu.
      if (e.key !== 'Tab' || !panel.current) return
      const items = panel.current.querySelectorAll<HTMLElement>('a[href], button, input')
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
  }, [onClose])

  // Portal ra body: thanh tab dưới đáy có backdrop-filter nên con position: fixed sẽ bị kẹt trong nó.
  return createPortal(
    <div className="gmenu-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gmenu" role="dialog" aria-modal="true" aria-labelledby="gmenu-title" ref={panel}>
        <div className="gmenu-head">
          <h2 id="gmenu-title">{t('menu.title')}</h2>
          <span className="gmenu-count">{t('menu.count', { n: shown.length })}</span>
          <button type="button" className="gmenu-close" onClick={onClose} aria-label={t('menu.close')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <input
          ref={input}
          className="gmenu-search"
          type="search"
          value={query}
          placeholder={t('games.search')}
          aria-label={t('games.search')}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="gmenu-body">
          {found ? (
            found.length > 0 ? (
              <ul className="gmenu-list">
                {found.map((g) => (
                  <Row key={g.id} game={g} onPick={onClose} />
                ))}
              </ul>
            ) : (
              <p className="gmenu-empty">{t('games.noMatch', { q: query.trim() })}</p>
            )
          ) : (
            (Object.keys(CATS) as Cat[]).map((cat) => {
              const list = shown.filter((g) => g.cat === cat)
              if (list.length === 0) return null
              return (
                <section key={cat} className="gmenu-cat" aria-labelledby={'gmenu-cat-' + cat}>
                  <h3 id={'gmenu-cat-' + cat}>
                    {t(CATS[cat])} <b>{list.length}</b>
                  </h3>
                  <ul className="gmenu-list">
                    {list.map((g) => (
                      <Row key={g.id} game={g} onPick={onClose} />
                    ))}
                  </ul>
                </section>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
