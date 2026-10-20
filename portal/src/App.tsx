import { useI18n } from './i18n/i18n'

// Khung tạm: các task sau thay bằng trang chủ thật.
export function App() {
  const { t } = useI18n()
  return <h1>{t('meta.description')}</h1>
}