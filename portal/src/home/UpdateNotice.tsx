import { useI18n } from '../i18n/i18n'
import { useUpdateAvailable } from '../lib/updateCheck'

/** Thanh "đã có bản mới" ở đáy màn hình; bấm Tải lại để lấy bản vừa deploy. */
export function UpdateNotice({ current }: { current?: string }) {
  const { t } = useI18n()
  const available = useUpdateAvailable(current)
  if (!available) return null
  return (
    <div className="update-notice" role="status">
      <span>{t('update.ready')}</span>
      <button type="button" onClick={() => location.reload()}>
        {t('update.reload')}
      </button>
    </div>
  )
}
