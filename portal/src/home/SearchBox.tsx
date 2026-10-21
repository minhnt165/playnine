import { useI18n } from '../i18n/i18n'

/** Ô tìm game trên thanh trên của trang chủ; phím / đưa con trỏ vào đây, Esc xóa. */
export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  return (
    <div className="search" role="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id="game-search"
        type="search"
        value={value}
        placeholder={t('games.search')}
        aria-label={t('games.search')}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('')
        }}
      />
      <kbd aria-hidden="true">/</kbd>
    </div>
  )
}
