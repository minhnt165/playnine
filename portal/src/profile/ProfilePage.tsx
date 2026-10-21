import { useEffect, useState, type FormEvent } from 'react'
import { localized } from '../events/model'
import { gameById } from '../games/catalog'
import { Topbar } from '../home/Topbar'
import { useI18n } from '../i18n/i18n'
import { formatValue } from '../player/leaderboardModel'
import { eventHref } from '../player/route'
import { useServer } from '../server/ServerProvider'
import type { Badge, BestRow, Profile } from '../server/types'

const NAME_MIN = 2
const NAME_MAX = 24

type Loaded = { status: 'loading' } | { status: 'error' } | { status: 'ready'; profile: Profile | null; bests: BestRow[]; badges: Badge[] }

/** Trang hồ sơ #/u/<id>: tên, avatar, kỷ lục theo game → mode; chủ hồ sơ được sửa tên. */
export function ProfilePage({ userId, onThemeApplied }: { userId: string; onThemeApplied?: () => void }) {
  const { t, loc, lang, fmtNumber } = useI18n()
  const { api, user, games, refreshUser } = useServer()
  const [data, setData] = useState<Loaded>({ status: 'loading' })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<'rule' | 'server' | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!api) return
    let alive = true
    setData({ status: 'loading' })
    setEditing(false)
    // Huy hiệu lỗi thì chỉ ẩn mục huy hiệu, phần còn lại vẫn hiện.
    const badges = api.profileBadges(userId).catch((): Badge[] => [])
    Promise.all([api.profile(userId), api.profileBests(userId), badges]).then(
      ([profile, bests, badges]) => alive && setData({ status: 'ready', profile, bests, badges }),
      () => alive && setData({ status: 'error' }),
    )
    return () => {
      alive = false
    }
  }, [api, userId])

  const profile = data.status === 'ready' ? data.profile : null
  useEffect(() => {
    if (!profile) return
    const prev = document.title
    document.title = profile.displayName + ' · PlayNine'
    return () => {
      document.title = prev
    }
  }, [profile])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!api || saving) return
    const name = draft.trim()
    const len = Array.from(name).length
    if (len < NAME_MIN || len > NAME_MAX) {
      setProblem('rule')
      return
    }
    setProblem(null)
    setSaving(true)
    try {
      await api.updateDisplayName(name)
      const fresh = await api.profile(userId)
      setData((d) => (d.status === 'ready' ? { ...d, profile: fresh ?? d.profile } : d))
      setEditing(false)
      await refreshUser()
    } catch {
      setProblem('server')
    } finally {
      setSaving(false)
    }
  }

  let body
  if (!api || data.status === 'error') {
    body = <p className="lb-note">{t('profile.unavailable')}</p>
  } else if (data.status === 'loading') {
    body = null
  } else if (!data.profile) {
    body = <p className="lb-note">{t('profile.notFound')}</p>
  } else {
    const p = data.profile
    const avatar = p.avatarUrl && /^https:\/\//i.test(p.avatarUrl) ? p.avatarUrl : null
    const initial = Array.from(p.displayName.trim())[0]?.toUpperCase() ?? '?'
    const isMe = user?.id === p.id
    const rows = data.bests.flatMap((b) => {
      const game = gameById(b.gameId)
      return game ? [{ b, game }] : []
    })
    body = (
      <>
        <section className="profile-head">
          <span className="profile-avatar">
            {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{initial}</span>}
          </span>
          <div className="profile-who">
            <h1 className="profile-name">{p.displayName}</h1>
            {isMe && !editing && (
              <button
                type="button"
                className="profile-btn"
                onClick={() => {
                  setDraft(p.displayName)
                  setProblem(null)
                  setEditing(true)
                }}
              >
                {t('profile.edit')}
              </button>
            )}
          </div>
        </section>
        {isMe && editing && (
          <form className="profile-form" onSubmit={save}>
            <input
              type="text"
              aria-label={t('profile.edit')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <button type="submit" className="profile-btn" disabled={saving}>
              {t('profile.save')}
            </button>
            {problem !== 'rule' && <span className="profile-hint">{t('profile.nameRule')}</span>}
            {problem === 'rule' && (
              <span className="auth-error" role="alert">
                {t('profile.nameRule')}
              </span>
            )}
            {problem === 'server' && (
              <span className="auth-error" role="alert">
                {t('profile.nameError')}
              </span>
            )}
          </form>
        )}
        {data.badges.length > 0 && (
          <section>
            <div className="section-head">
              <h2>{t('profile.badges')}</h2>
            </div>
            <ul className="profile-badges">
              {data.badges.map((b) => {
                const game = gameById(b.gameId)
                return (
                  <li key={b.eventId}>
                    <a href={eventHref(b.eventId)}>
                      <span className="badge-rank">{t('profile.badgeRank', { rank: b.rank })}</span>
                      <span className="badge-title">{localized(b.title, lang)}</span>
                      <span className="badge-game">{game ? loc(game.name) : b.gameId}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        <section>
          <div className="section-head">
            <h2>{t('profile.bests')}</h2>
          </div>
          {rows.length === 0 ? (
            <p className="lb-note">{t('profile.none')}</p>
          ) : (
            <ul className="profile-bests">
              {rows.map(({ b, game }) => {
                const mode = games[b.gameId]?.modes.find((m) => m.key === b.mode)
                return (
                  <li key={b.gameId + '|' + b.mode}>
                    <span className="card-icon" dangerouslySetInnerHTML={{ __html: game.icon(game.dir) }} />
                    <span className="profile-game">{loc(game.name)}</span>
                    <span className="profile-mode">{mode ? loc(mode.label) : b.mode}</span>
                    <span className="lb-value">{formatValue(b.metric, b.value, fmtNumber)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </>
    )
  }

  return (
    <div className="wrap">
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="profile">
        <a className="profile-back" href="#/">
          {t('profile.back')}
        </a>
        {body}
      </main>
    </div>
  )
}
