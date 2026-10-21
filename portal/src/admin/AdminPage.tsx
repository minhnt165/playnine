import { useEffect, useState } from 'react'
import { Topbar } from '../home/Topbar'
import { useI18n } from '../i18n/i18n'
import { useServer } from '../server/ServerProvider'
import { AdminGames } from './AdminGames'
import { AdminPlayers } from './AdminPlayers'
import { AdminRuns } from './AdminRuns'

const TAB_KEY = 'playnine-admin-tab'
// Thứ tự tab; Task 7 thay khung tạm của events và collections bằng trình soạn thật.
const TABS = ['games', 'events', 'collections', 'runs', 'players'] as const
type Tab = (typeof TABS)[number]

function readTab(): Tab {
  try {
    const v = sessionStorage.getItem(TAB_KEY)
    return TABS.find((x) => x === v) ?? 'games'
  } catch {
    return 'games'
  }
}

/** Trang #/admin: chỉ admin mới thấy; người khác không bị gọi admin_* nào. */
export function AdminPage({ onThemeApplied }: { onThemeApplied?: () => void }) {
  const { t } = useI18n()
  const { api, user, authReady } = useServer()
  const [tab, setTab] = useState<Tab>(readTab)

  useEffect(() => {
    const prev = document.title
    document.title = 'Admin · PlayNine'
    return () => {
      document.title = prev
    }
  }, [])

  const choose = (next: Tab) => {
    setTab(next)
    try {
      sessionStorage.setItem(TAB_KEY, next)
    } catch {
      /* không lưu được thì bỏ qua */
    }
  }

  let body = null
  if (!api) body = <p className="lb-note">{t('admin.unavailable')}</p>
  else if (!authReady) body = null
  else if (!user?.isAdmin) body = <p className="lb-note">{t('admin.forbidden')}</p>
  else {
    body = (
      <>
        <div className="admin-tabs" role="tablist">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={'admin-tab-' + id}
              aria-selected={tab === id}
              aria-controls="admin-panel"
              className="admin-tab"
              onClick={() => choose(id)}
            >
              {t('admin.tab.' + id)}
            </button>
          ))}
        </div>
        <div id="admin-panel" role="tabpanel" aria-labelledby={'admin-tab-' + tab} className="admin-panel">
          {tab === 'games' ? (
            <AdminGames />
          ) : tab === 'runs' ? (
            <AdminRuns />
          ) : tab === 'players' ? (
            <AdminPlayers />
          ) : (
            <h2>{t('admin.tab.' + tab)}</h2>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="wrap" data-page="admin">
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="profile admin">
        <h1>{t('admin.title')}</h1>
        {body}
      </main>
    </div>
  )
}
