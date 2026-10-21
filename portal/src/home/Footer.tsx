import type { CSSProperties } from 'react'
import { GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { BUILD_INFO, buildLabel, commitUrl } from '../lib/buildInfo'
import { canHover } from './media'

// Phím tắt 1–9/T/L do useShortcuts (Task 7) xử lý; ở đây chỉ hiện gợi ý trên thiết bị có chuột.
export function Footer() {
  const { t, fmtDate } = useI18n()
  const label = buildLabel(BUILD_INFO, (d) => fmtDate(d, { dateStyle: 'short', timeStyle: 'short' }))
  const href = commitUrl(BUILD_INFO.commit)
  return (
    <footer className="reveal" style={{ '--i': 8 } as CSSProperties}>
      <div
        id="shortcut-hint"
        dangerouslySetInnerHTML={canHover() ? { __html: t('footer.shortcuts', { max: Math.min(9, GAMES.length) }) } : undefined}
      />
      <div>{t('footer.note')}</div>
      {/* Bản build đang chạy, để biết web đã cập nhật chưa */}
      <div id="build-info">
        {href ? (
          <a href={href} target="_blank" rel="noopener" style={{ color: 'inherit' }}>
            {label}
          </a>
        ) : (
          label
        )}
      </div>
    </footer>
  )
}