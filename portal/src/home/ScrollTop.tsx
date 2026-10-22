import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/i18n'
import { prefersReducedMotion } from './media'

// Hiện nút khi đã cuộn quá khoảng 1,5 màn hình.
const SHOW_AFTER = 1.5

/** Nút tròn "lên đầu trang" ở góc dưới phải (trên thanh tab dưới đáy ở điện thoại). */
export function ScrollTop() {
  const { t } = useI18n()
  const [show, setShow] = useState(false)

  useEffect(() => {
    let raf = 0
    const check = () => {
      raf = 0
      setShow(window.scrollY > window.innerHeight * SHOW_AFTER)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check)
    }
    check()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <button
      type="button"
      className={'scroll-top' + (show ? ' on' : '')}
      aria-label={t('nav.top')}
      title={t('nav.top')}
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      onClick={() => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
