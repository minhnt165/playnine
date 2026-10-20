import type { CSSProperties } from 'react'
import { useI18n } from '../i18n/i18n'
import { greetingKey } from '../lib/time'

export function Hero({ now }: { now: Date }) {
  const { t, lang, fmtDate, weekdayOf } = useI18n()
  const date =
    lang === 'vi'
      ? weekdayOf(now) + ', ' + String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear()
      : fmtDate(now, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <section className="hero reveal" style={{ '--i': 1 } as CSSProperties}>
      <p className="greet" id="greet">
        {t(greetingKey(now)) + ' · ' + date}
      </p>
      <h1 dangerouslySetInnerHTML={{ __html: t('hero.title') }} />
      <p className="tagline">{t('hero.tagline')}</p>
    </section>
  )
}