import { useEffect, useMemo, useRef, useState } from 'react'
import { sudokuData } from '../data/sudoku'
import { readSummary } from '../data/summary'
import { gameById, GAMES, type GameDef } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { gameHref, playHref } from './route'

type Props = {
  /** Game đang mở; null khi ở trang chủ. */
  game: GameDef | null
  /** Game đang giữ iframe (kể cả đang ẩn). */
  heldIds: string[]
  /** Đã ở trang cổng trước khi vào game (để Back = history.back). */
  portalSeen: boolean
}

const icon = (g: GameDef) => ({ __html: g.icon(g.dir) })

export function Player({ game, heldIds, portalSeen }: Props) {
  const { t, loc } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [ready, setReady] = useState<Set<string>>(() => new Set())
  const playerRef = useRef<HTMLDivElement>(null)
  const frameRefs = useRef<Record<string, HTMLIFrameElement | null>>({})
  const gameRef = useRef(game)
  gameRef.current = game
  const gameId = game?.id ?? null
  const name = game ? loc(game.name) : ''

  // Class body, tiêu đề tab, thoát toàn màn hình khi về trang chủ.
  useEffect(() => {
    if (!game) return
    document.body.classList.add('playing')
    return () => document.body.classList.remove('playing')
  }, [game])
  useEffect(() => {
    document.title = name ? name + ' · PlayNine' : 'PlayNine'
  }, [name])
  useEffect(() => {
    if (!gameId && document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }, [gameId])

  // Đổi game: đóng menu; game đã tải xong thì focus luôn vào iframe.
  useEffect(() => {
    setMenuOpen(false)
    if (gameId && ready.has(gameId)) frameRefs.current[gameId]?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  // Quên trạng thái "đã tải" của iframe đã bị gỡ để lần mở sau hiện lại màn chờ.
  useEffect(() => {
    setReady((cur) => {
      const kept = [...cur].filter((id) => heldIds.includes(id))
      return kept.length === cur.size ? cur : new Set(kept)
    })
  }, [heldIds])

  // Click ngoài menu và Escape đóng menu.
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null
      if (!el?.closest('#p-menu-list, #p-menu')) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // Chip streak đọc lại khi đổi game hoặc ngôn ngữ (t đổi theo ngôn ngữ).
  const streak = useMemo(() => {
    if (!game) return 0
    if (game.id === 'sudoku') return sudokuData(t).streak
    const s = readSummary(game.id)
    return s && s.daily ? Number(s.daily.streak) || 0 : 0
  }, [game, t])

  const go = (x: GameDef) => {
    setMenuOpen(false)
    // replace: chuyển game không thêm lịch sử, Back vẫn về thẳng cổng
    if (x !== game) location.replace(playHref(x))
  }
  const onBack = () => {
    if (portalSeen) history.back()
    else location.hash = ''
  }
  const onFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else playerRef.current?.requestFullscreen().catch(() => {})
  }
  const onLoad = (id: string) => {
    setReady((cur) => (cur.has(id) ? cur : new Set(cur).add(id)))
    if (gameRef.current?.id === id) frameRefs.current[id]?.focus()
  }

  return (
    <div className="player" id="player" ref={playerRef}>
      <div className="pbar">
        <button className="pbtn back" id="p-back" type="button" aria-label={t('player.back')} title={t('player.back')} onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M10.8 5.3 4.1 12l6.7 6.7 1.4-1.4L7.9 13H20v-2H7.9l4.3-4.3z" />
          </svg>
          <span className="label">PlayNine</span>
        </button>
        <div className="ptitle" id="p-title">
          {game && (
            <>
              <span className="card-icon" dangerouslySetInnerHTML={icon(game)} />
              <span className="name">{name}</span>
            </>
          )}
        </div>
        <span className="pchip" id="p-chip" hidden={!streak}>
          {streak ? t('player.streak', { n: streak }) : ''}
        </span>
        <div className="pswitch" id="p-switch" aria-label={t('player.switch')}>
          {GAMES.map((x) => (
            <button
              key={x.id}
              type="button"
              title={loc(x.name)}
              aria-label={t('player.switchTo', { game: loc(x.name) })}
              aria-current={x === game}
              onClick={() => go(x)}
              dangerouslySetInnerHTML={icon(x)}
            />
          ))}
        </div>
        <button
          className="pbtn icon-only"
          id="p-menu"
          type="button"
          aria-label={t('player.menu')}
          title={t('player.menu')}
          aria-expanded={menuOpen}
          aria-controls="p-menu-list"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
          </svg>
        </button>
        <div className="pmenu" id="p-menu-list" hidden={!menuOpen}>
          {GAMES.map((x) => (
            <button key={x.id} type="button" aria-current={x === game} onClick={() => go(x)}>
              <span className="card-icon" dangerouslySetInnerHTML={icon(x)} />
              {loc(x.name)}
            </button>
          ))}
        </div>
        <a
          className="pbtn icon-only"
          id="p-newtab"
          href={game ? gameHref(game) : undefined}
          target="_blank"
          rel="noopener"
          aria-label={t('player.newtab')}
          title={t('player.newtabShort')}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
          </svg>
        </a>
        <button
          className="pbtn icon-only"
          id="p-full"
          type="button"
          aria-label={t('player.full')}
          title={t('player.full')}
          hidden={!document.fullscreenEnabled}
          onClick={onFull}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 3h7v2H5v5H3zm11 0h7v7h-2V5h-5zM3 14h2v5h5v2H3zm16 0h2v7h-7v-2h5z" />
          </svg>
        </button>
      </div>
      <div className="frames" id="frames">
        {heldIds.map((id) => {
          const g = gameById(id)
          if (!g) return null
          return (
            <iframe
              key={id}
              ref={(el) => {
                frameRefs.current[id] = el
              }}
              className={id === gameId ? 'on' : undefined}
              title={loc(g.name)}
              allow="fullscreen"
              src={gameHref(g)}
              onLoad={() => onLoad(id)}
            />
          )
        })}
        <div className={'loading' + (game && !ready.has(game.id) ? ' on' : '')} id="p-loading">
          <div>
            <i></i>
            <span>{t('player.loading')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
