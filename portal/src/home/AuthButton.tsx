import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'

/** Nút đăng nhập Google / avatar + menu. Không có server thì không render gì. */
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
        <button className="theme-btn auth-btn" type="button" onClick={() => run(() => api.signInWithGoogle())}>
          <span className="label">{t('auth.signIn')}</span>
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
        className="auth-avatar"
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
          <div className="auth-name">{user.displayName}</div>
          <a role="menuitem" href={`#/u/${encodeURIComponent(user.id)}`} onClick={() => setOpen(false)}>
            {t('auth.profile')}
          </a>
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
