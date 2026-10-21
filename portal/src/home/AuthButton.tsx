import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { usePoints } from '../leaderboards/usePoints'
import { rememberReturnHash } from '../server/returnHash'
import { useServer } from '../server/ServerProvider'

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
