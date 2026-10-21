import type { LeaderRow } from '../server/types'

/** Một hàng bảng xếp hạng: hạng, tên (liên kết tới hồ sơ) và giá trị đã định dạng. */
export function Row({ r, me, value, you }: { r: LeaderRow; me: boolean; value: string; you: string }) {
  return (
    <li className={me ? 'me' : undefined}>
      <span className="lb-rank">{r.rank}</span>
      <span className="lb-name">
        <a href={`#/u/${encodeURIComponent(r.userId)}`}>{r.displayName}</a>
        {me && <em className="lb-you">{you}</em>}
      </span>
      <span className="lb-value">{value}</span>
    </li>
  )
}
