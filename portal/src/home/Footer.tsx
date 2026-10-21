import type { CSSProperties } from 'react'
import { GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'
import { canHover } from './media'

// Phím tắt 1–9/T/L do useShortcuts (Task 7) xử lý; ở đây chỉ hiện gợi ý trên thiết bị có chuột.
export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="reveal" style={{ '--i': 8 } as CSSProperties}>
      <div
        id="shortcut-hint"
        dangerouslySetInnerHTML={canHover() ? { __html: t('footer.shortcuts', { max: Math.min(9, GAMES.length) }) } : undefined}
      />
      <div>{t('footer.note')}</div>
    </footer>
  )
}