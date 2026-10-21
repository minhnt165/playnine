import type { TFn } from '../i18n/types'

export const pad2 = (n: number): string => String(n).padStart(2, '0')

/** YYYY-MM-DD theo giờ máy. */
export const dateKeyOf = (d: Date): string =>
  d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())

export function fmtDuration(sec: number): string {
  sec = Math.max(0, Math.round(sec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h ? h + ':' + pad2(m) + ':' + pad2(s) : pad2(m) + ':' + pad2(s)
}

export function fmtAgo(ts: number, t: TFn, now: number = Date.now()): string {
  const min = Math.floor((now - ts) / 60000)
  if (min < 1) return t('ago.now')
  if (min < 60) return t('ago.min', { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return t('ago.hour', { n: h })
  const d = Math.floor(h / 24)
  return d === 1 ? t('ago.yesterday') : t('ago.day', { n: d })
}

export type GreetingKey =
  | 'greet.late'
  | 'greet.morning'
  | 'greet.noon'
  | 'greet.afternoon'
  | 'greet.evening'

export function greetingKey(d: Date): GreetingKey {
  const h = d.getHours()
  if (h < 5) return 'greet.late'
  if (h < 11) return 'greet.morning'
  if (h < 13) return 'greet.noon'
  if (h < 18) return 'greet.afternoon'
  return 'greet.evening'
}