import { useI18n } from '../i18n/i18n'

/** Vòng xoay "Đang tải…" giữa trang khi trang đang chờ dữ liệu từ server. */
export function PageLoading() {
  const { t } = useI18n()
  return (
    <div className="page-loading" role="status">
      <i aria-hidden="true" />
      <span>{t('page.loading')}</span>
    </div>
  )
}
