import { Topbar } from '../home/Topbar'

/** Trang tạm cho #/admin (Task 6 thay bằng bản thật). */
export function AdminPage({ onThemeApplied }: { onThemeApplied?: () => void }) {
  return (
    <div className="wrap" data-page="admin">
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="profile">
        <h1>Admin</h1>
      </main>
    </div>
  )
}
