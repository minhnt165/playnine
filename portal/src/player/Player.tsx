import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameToPortal } from '@playnine/sdk/protocol'
import { sudokuData } from '../data/sudoku'
import { readSummary } from '../data/summary'
import { gameById, GAMES, type GameDef } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { createRunManager, type RunStatus } from '../server/runs'
import { useServer } from '../server/ServerProvider'
import { useGameBridge } from './bridge'
import { Toast, type Notice } from './Toast'
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

  // Cầu nối game ↔ server: RunManager tạo một lần, đọc người dùng hiện tại qua ref.
  const { api, user, authReady } = useServer()
  const userRef = useRef(user)
  userRef.current = user
  const runs = useMemo(() => createRunManager({ api, getUser: () => userRef.current }), [api])
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null)
  const [runStatus, setRunStatus] = useState<RunStatus>({ kind: 'idle' })
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeSeq = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  // Đổi game: trạng thái ván của game trước không còn đúng.
  useEffect(() => {
    setRunStatus({ kind: 'idle' })
    setNotice(null)
  }, [gameId])
  useEffect(() => {
    setFrame(gameId ? (frameRefs.current[gameId] ?? null) : null)
  }, [gameId, heldIds])

  const say = (text: string) => {
    if (alive.current && gameRef.current) setNotice({ id: ++noticeSeq.current, text })
  }
  const onGameMessage = (m: GameToPortal) => {
    if (m.type === 'pn:start') {
      const id = m.gameId
      runs.start(id, m.mode, m.resume).then(
        (s) => alive.current && gameRef.current?.id === id && setRunStatus(s),
        () => alive.current && gameRef.current?.id === id && setRunStatus({ kind: 'unscored', why: 'error' }),
      )
    } else if (m.type === 'pn:end') {
      const { mode } = m
      runs.end(m.gameId, mode, { score: m.score, timeMs: m.timeMs, won: m.won, assisted: m.assisted ?? false }).then(
        (o) => {
          if (o.kind === 'saved') {
            const rank = mode === 'daily' ? o.result.ranks.day : o.result.ranks.week
            if (rank === undefined) say(t('play.savedNoRank'))
            else say(t(mode === 'daily' ? 'play.savedToday' : 'play.saved', { rank }))
          } else if (o.kind === 'rejected') say(t('play.rejected'))
          else if (o.kind === 'error') say(t('play.saveFailed'))
        },
        () => say(t('play.saveFailed')),
      )
    }
  }
  useGameBridge({ frame, gameId, onMessage: onGameMessage })
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
      {api && authReady && game && (!user || (runStatus.kind === 'unscored' && (runStatus.why === 'no_resume' || runStatus.why === 'error'))) && (
        <div className="play-status">
          {user ? (
            t('play.unscored')
          ) : (
            <>
              <span>{t('play.signInToScore')}</span>
              <button type="button" onClick={() => api.signInWithGoogle().catch(() => {})}>
                {t('auth.signIn')}
              </button>
            </>
          )}
        </div>
      )}
      <Toast notice={notice} />
      <div className="frames" id="frames">
        {/* Render trước iframe (giống cổng cũ) để iframe đang tải không che spinner. */}
        <div className={'loading' + (game && !ready.has(game.id) ? ' on' : '')} id="p-loading">
          <div>
            <i></i>
            <span>{t('player.loading')}</span>
          </div>
        </div>
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
      </div>
    </div>
  )
}
