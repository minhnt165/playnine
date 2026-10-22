import { useEffect, useRef, useState } from 'react'
import { useCloudStatus } from '../data/useCloudSync'
import { useI18n } from '../i18n/i18n'
import { usePoints } from '../leaderboards/usePoints'
import { historyHref } from '../player/route'
import { rememberReturnHash } from '../server/returnHash'
import { useServer } from '../server/ServerProvider'

/** Dòng trạng thái lưu tiến độ game lên tài khoản. */
function CloudLine() {
  const { t, fmtDate } = useI18n()
  const s = useCloudStatus()
  if (s.state === 'off') return null
  const time = s.at ? fmtDate(new Date(s.at), { hour: '2-digit', minute: '2-digit' }) : ''
  const text =
    s.state === 'error' ? t('cloud.error') : s.state === 'syncing' && !s.at ? t('cloud.syncing') : t('cloud.saved', { time })
  return (
    <p className={'auth-cloud' + (s.state === 'error' ? ' is-error' : '')} role="status">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        {s.state === 'error' ? (
          <path d="M12 10.5v3.5M12 16.2v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        ) : (
          <path d="m9.5 13.5 1.8 1.8 3.4-3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      {text}
    </p>
  )
}

/** Điểm tuần và tổng điểm của chính mình trong menu tài khoản; chưa tải xong thì không hiện. */
function MenuPoints({ userId }: { userId: string }) {
  const { t, fmtNumber } = useI18n()
  const pts = usePoints(userId)
  if (!pts?.all) return null
  const line = (key: 'week' | 'all', label: string) => {
    const v = pts[key]
    return (
      <span>
        <b>{fmtNumber(v?.points ?? 0)}</b> {label}
        {v?.rank != null && <em>{t('points.rank', { rank: v.rank })}</em>}
      </span>
    )
  }
  return (
    <a role="menuitem" className="auth-points" href="#/leaderboards">
      <span className="auth-points-title">{t('points.title')}</span>
      {line('week', t('lb.week'))}
      {line('all', t('lb.all'))}
    </a>
  )
}

/** Nút đăng nhập Google và chơi với tư cách khách / avatar + menu. Không có server thì không render gì. */
export function AuthButton() {
  const { t } = useI18n()
  const { api, user, authReady } = useServer()
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!api || !authReady) return null

  const run = (fn: () => Promise<void>) => {
    setFailed(false)
    fn().catch(() => setFailed(true))
  }

  if (!user) {
    return (
      <>
        <button
          className="theme-btn auth-btn"
          type="button"
          aria-label={t('auth.signIn')}
          onClick={() => run(() => api.signInWithGoogle())}
        >
          <span className="label">{t('auth.signIn')}</span>
          <span className="label-short" aria-hidden="true">
            {t('auth.signInShort')}
          </span>
        </button>
        <button
          className="theme-btn auth-btn auth-guest"
          type="button"
          aria-label={t('auth.guest')}
          onClick={() => run(() => api.signInAsGuest())}
        >
          <span className="label">{t('auth.guest')}</span>
          <span className="label-short" aria-hidden="true">
            {t('auth.guestShort')}
          </span>
        </button>
        {failed && (
          <span className="auth-error" role="alert">
            {t('auth.failed')}
          </span>
        )}
      </>
    )
  }

  const avatar = user.avatarUrl && /^https:\/\//i.test(user.avatarUrl) ? user.avatarUrl : null
  const initial = Array.from(user.displayName.trim())[0]?.toUpperCase() ?? '?'
  return (
    <div className="auth-wrap" ref={ref}>
      <button
        className={'auth-avatar' + (user.isGuest ? ' is-guest' : '')}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('auth.menu')}: ${user.displayName}`}
        onClick={() => setOpen((o) => !o)}
      >
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{initial}</span>}
      </button>
      {open && (
        <div className="auth-menu" role="menu">
          <div className="auth-name">
            {user.displayName}
            {user.isGuest && <span className="auth-tag">{t('auth.guestTag')}</span>}
          </div>
          <MenuPoints userId={user.id} />
          <CloudLine />
          {user.isGuest && (
            <button
              role="menuitem"
              type="button"
              className="auth-link"
              onClick={() => {
                setOpen(false)
                rememberReturnHash()
                run(() => api.linkGoogle())
              }}
            >
              {t('auth.link')}
              <small>{t('auth.linkHint')}</small>
            </button>
          )}
          <a role="menuitem" href={`#/u/${encodeURIComponent(user.id)}`} onClick={() => setOpen(false)}>
            {t('auth.profile')}
          </a>
          <a role="menuitem" href={historyHref} onClick={() => setOpen(false)}>
            {t('history.title')}
          </a>
          {user.isAdmin && (
            <a role="menuitem" href="#/admin" onClick={() => setOpen(false)}>
              {t('auth.admin')}
            </a>
          )}
          {user.isGuest ? (
            // Khách đăng xuất sẽ được tạo khách mới ngay và mất điểm cũ: thay bằng đăng nhập tài khoản Google có sẵn.
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                rememberReturnHash()
                run(() => api.signInWithGoogle())
              }}
            >
              {t('auth.signInExisting')}
            </button>
          ) : (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                run(() => api.signOut())
              }}
            >
              {t('auth.signOut')}
            </button>
          )}
        </div>
      )}
      {failed && (
        <span className="auth-error" role="alert">
          {t('auth.failed')}
        </span>
      )}
    </div>
  )
}
