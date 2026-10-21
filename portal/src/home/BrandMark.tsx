import { useId } from 'react'

/** Logo PlayNine: số 9 trong vòng tròn trên nền chuyển màu tím–xanh ngọc. */
export function BrandMark() {
  // Sidebar và thanh trên điện thoại cùng vẽ logo: id gradient phải khác nhau.
  const grad = 'pn-mark' + useId().replace(/[^\w-]/g, '')
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b6cff" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" fill={`url(#${grad})`} />
        <circle cx="32" cy="32" r="21" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
        <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round">
          <circle cx="32" cy="27.5" r="6.5" />
          <path d="M38.5 27.5V35a7 7 0 0 1-7 7H28" />
        </g>
      </svg>
    </span>
  )
}
