import { useState, type ReactNode } from 'react'
import { recent } from '../data/recent'
import { isHidden } from '../events/model'
import { gameById, type GameDef } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { detailHref } from '../player/route'
import { useServer } from '../server/ServerProvider'
import { BrandMark } from './BrandMark'
import { useFavoriteGames } from './FavoriteRow'
import { GameMenu } from './GameMenu'

const MAX_RECENT = 5

const ICON_HOME = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M10 21v-6h4v6" />
  </svg>
)
const ICON_EVENTS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
  </svg>
)
const ICON_GAMES = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </svg>
)
const ICON_BOARDS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 21V12h4v9M10 21V5h4v16M16 21v-6h4v6" />
  </svg>
)
const ICON_NEWS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" />
    <path d="M17 9h3v10a2 2 0 0 1-2 2M8 9h5M8 13h5M8 17h3" />
  </svg>
)
const ICON_PROFILE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
)

// Mục sidebar đang mở theo tiền tố của hash; trang game (#/game/...) thuộc Trang chủ.
const PREFIXES: [string, string][] = [
  ['#/events', 'events'],
  ['#/leaderboards', 'leaderboards'],
  ['#/news', 'news'],
]
function sectionOf(hash: string, profileHref: string | null): string | null {
  const hit = PREFIXES.find(([p]) => hash.startsWith(p))
  if (hit) return hit[1]
  if (profileHref && hash === profileHref) return 'profile'
  return hash === '' || hash === '#/' || hash.startsWith('#/game/') ? 'home' : null
}

/** Thanh điều hướng bên trái (máy tính) / thanh tab dưới đáy (điện thoại), kèm danh sách game chơi gần đây. */
export function Sidebar() {
  const { t, loc } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const favs = useFavoriteGames().slice(0, MAX_RECENT)
  const { api, user, games } = useServer()
  // Sidebar vẽ lại cùng trang mỗi lần đổi route hoặc quay về từ game nên đọc hash và `recent` lúc vẽ là đủ.
  const hash = location.hash
  const profileHref = user ? '#/u/' + encodeURIComponent(user.id) : null
  const section = sectionOf(hash, profileHref)
  const rec = recent()
  const played = Object.keys(rec)
    .sort((a, b) => rec[b] - rec[a])
    .map((id) => gameById(id))
    .filter((g): g is GameDef => g !== undefined && !isHidden(games, g.id))
    .slice(0, MAX_RECENT)

  // `short`: nhãn ngắn cho thanh tab dưới đáy (mobile) để không xuống dòng; tên đầy đủ vẫn là aria-label.
  const item = (key: string, href: string, icon: ReactNode, label: string, short?: string) => (
    <a href={href} aria-current={section === key ? 'page' : undefined} aria-label={short ? label : undefined}>
      {icon}
      <span className={short ? 'nav-full' : undefined}>{label}</span>
      {short && (
        <span className="nav-short" aria-hidden="true">
          {short}
        </span>
      )}
    </a>
  )

  return (
    <aside className="sidenav">
      <a className="brand" href="#/">
        <BrandMark />
        <span className="brand-name">
          Play<span>Nine</span>
        </span>
      </a>
      <nav className="sidenav-links" aria-label={t('nav.label')}>
        {item('home', '#/', ICON_HOME, t('nav.home'))}
        <button type="button" className="sidenav-games" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          {ICON_GAMES}
          <span>{t('nav.games')}</span>
        </button>
        {api && item('leaderboards', '#/leaderboards', ICON_BOARDS, t('nav.leaderboards'), t('nav.leaderboardsShort'))}
        {api && item('events', '#/events', ICON_EVENTS, t('ev.title'))}
        {api && item('news', '#/news', ICON_NEWS, t('news.title'))}
        {profileHref && item('profile', profileHref, ICON_PROFILE, t('nav.profile'))}
      </nav>
      {favs.length > 0 && (
        <section className="sidenav-recent sidenav-favs">
          <h2>{t('nav.favorites')}</h2>
          <ul>
            {favs.map((g) => (
              <li key={g.id}>
                <a href={detailHref(g)}>
                  <span className="card-icon" dangerouslySetInnerHTML={{ __html: g.icon(g.dir) }} />
                  <span>{loc(g.name)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {played.length > 0 && (
        <section className="sidenav-recent">
          <h2>{t('nav.recent')}</h2>
          <ul>
            {played.map((g) => (
              <li key={g.id}>
                <a href={detailHref(g)}>
                  <span className="card-icon" dangerouslySetInnerHTML={{ __html: g.icon(g.dir) }} />
                  <span>{loc(g.name)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {menuOpen && <GameMenu onClose={() => setMenuOpen(false)} />}
    </aside>
  )
}
