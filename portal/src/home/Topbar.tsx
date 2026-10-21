import { useI18n } from '../i18n/i18n'
import { AuthButton } from './AuthButton'
import { useTheme, type Theme } from '../theme/useTheme'

const ICONS: Record<Theme, string> = {
  auto: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2v16a8 8 0 0 1 0-16z"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.7 14.6A8.5 8.5 0 0 1 9.4 3.3a8.5 8.5 0 1 0 11.3 11.3z"/></svg>',
}

export function Topbar({ onThemeApplied }: { onThemeApplied?: () => void }) {
  const { t, lang, setLang } = useI18n()
  const { theme, cycle } = useTheme(onThemeApplied)
  const themeLabel = t('theme.' + theme)
  return (
    <header className="topbar reveal">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <rect width="64" height="64" fill="#e0b964" />
            <circle cx="32" cy="32" r="22" fill="#14100d" />
            <circle cx="32" cy="32" r="18.5" fill="none" stroke="#e0b964" strokeWidth="1.5" />
            <g fill="none" stroke="#e0b964" strokeWidth="4.5" strokeLinecap="round">
              <circle cx="32" cy="27.5" r="6.5" />
              <path d="M38.5 27.5V35a7 7 0 0 1-7 7H28" />
            </g>
          </svg>
        </span>
        <span className="brand-name">
          Play<span>Nine</span>
        </span>
      </div>
      <div className="top-actions">
        <AuthButton />
        <button
          className="theme-btn lang-btn"
          id="lang-btn"
          type="button"
          aria-label={t('lang.label')}
          title={t('lang.label')}
          onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M3.5 9h17M3.5 15h17M12 3c-2.4 2.6-3.6 5.6-3.6 9s1.2 6.4 3.6 9c2.4-2.6 3.6-5.6 3.6-9S14.4 5.6 12 3z" />
          </svg>
          <span className="code">{lang.toUpperCase()}</span>
        </button>
        <button
          className="theme-btn"
          id="theme-btn"
          type="button"
          aria-label={t('theme.label', { label: themeLabel })}
          onClick={cycle}
        >
          <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: ICONS[theme] }} />
          <span className="label">{themeLabel}</span>
        </button>
      </div>
    </header>
  )
}