import type { PlayerRow } from '../server/types'

export const PODIUM = 3

const avatarOf = (r: PlayerRow) => (r.avatarUrl && /^https:\/\//i.test(r.avatarUrl) ? r.avatarUrl : null)

/** Bục top 3 (hiển thị 2 – 1 – 3): avatar, tên dẫn tới hồ sơ và giá trị đã định dạng. */
export function Podium({ rows, meId, value }: { rows: PlayerRow[]; meId: string | null; value: (n: number) => string }) {
  return (
    <ol className="lbs-podium">
      {rows.slice(0, PODIUM).map((r) => {
        const avatar = avatarOf(r)
        return (
          <li key={r.userId} className={'rank-' + r.rank + (r.userId === meId ? ' me' : '')}>
            <span className="lbs-medal">{r.rank}</span>
            <span className="lbs-avatar" aria-hidden="true">
              {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : Array.from(r.displayName.trim())[0]?.toUpperCase()}
            </span>
            <a className="lbs-name" href={`#/u/${encodeURIComponent(r.userId)}`}>
              {r.displayName}
            </a>
            <span className="lbs-value">{value(r.value)}</span>
          </li>
        )
      })}
    </ol>
  )
}
