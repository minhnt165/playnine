import { useEffect, useRef, type CSSProperties } from 'react'
import { useI18n } from '../i18n/i18n'
import { prefersReducedMotion } from './media'
import type { StatItem } from './stats'

// Đếm từ 0 lên `target` trong 900ms (ease-out bậc 3); bỏ hiệu ứng khi prefers-reduced-motion.
function CountUp({ target, suffix, delay }: { target: number; suffix: string; delay: number }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current!
    if (prefersReducedMotion() || target === 0) {
      el.textContent = target + suffix
      return
    }
    el.textContent = '0' + suffix
    let raf = 0
    const timer = setTimeout(() => {
      const start = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / 900)
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, delay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [target, suffix, delay])
  return <b ref={ref}>{'0' + suffix}</b>
}

export function Stats({ items }: { items: StatItem[] }) {
  const { t } = useI18n()
  return (
    <>
      <div className="section-head reveal" style={{ '--i': 7 } as CSSProperties}>
        <h2>{t('stats.title')}</h2>
        <span>{t('stats.source')}</span>
      </div>
      {items.length === 0 ? (
        <div id="stats" className="empty reveal" style={{ '--i': 7.5 } as CSSProperties}>
          {t('stats.empty')}
        </div>
      ) : (
        <div id="stats" className="stats">
          {items.map((it, i) => (
            <div key={i + it.label} className="stat reveal" style={{ '--i': 7.5 + i * 0.4 } as CSSProperties}>
              {it.text !== undefined ? <b>{it.text}</b> : <CountUp target={it.n ?? 0} suffix={it.suffix ?? ''} delay={500 + i * 120} />}
              <span>{it.label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}