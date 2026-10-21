import { Topbar } from '../home/Topbar'

/** Trang tạm cho #/events (Task 4 thay bằng bản thật). */
export function EventsPage({ onThemeApplied }: { onThemeApplied?: () => void }) {
  return (
    <div className="wrap" data-page="events">
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="profile">
        <h1>Events</h1>
      </main>
    </div>
  )
}

/** Trang tạm cho #/events/<id> (Task 4 thay bằng bản thật). */
export function EventPage({ eventId, onThemeApplied }: { eventId: string; onThemeApplied?: () => void }) {
  return (
    <div className="wrap" data-page="event" data-event-id={eventId}>
      <Topbar onThemeApplied={onThemeApplied} />
      <main className="profile">
        <h1>Events</h1>
      </main>
    </div>
  )
}
