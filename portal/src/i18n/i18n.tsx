import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readRaw, write } from '../lib/storage'
import { DICT } from './dict'
import type { Lang, Localized, TFn } from './types'

export type { Lang, Localized, TFn } from './types'

// Khóa chung với mọi game: localStorage['playnine-lang'] = 'en' | 'vi', mặc định 'en'.
export const LANG_KEY = 'playnine-lang'

const WEEKDAYS_VI = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

const normLang = (v: unknown): Lang => (v === 'vi' ? 'vi' : 'en')
const localeOf = (lang: Lang) => (lang === 'vi' ? 'vi-VN' : 'en-US')

/** Tra chuỗi theo ngôn ngữ, thiếu thì lấy tiếng Anh, rồi đến chính khóa; {x} thay bằng params.x. */
function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let s = DICT[lang][key]
  if (s === undefined) s = DICT.en[key]
  if (s === undefined) return key
  let str = typeof s === 'object' ? (params && params.n === 1 && s.one ? s.one : s.other) : s
  if (params) str = str.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] !== undefined ? String(params[k]) : m))
  return str
}

function useI18nState() {
  const [lang, setLangState] = useState<Lang>(() => normLang(readRaw(LANG_KEY)))

  const setLang = useCallback((l: Lang) => {
    const next = normLang(l)
    write(LANG_KEY, next)
    setLangState(next)
  }, [])

  // Đồng bộ khi tab/iframe khác đổi ngôn ngữ (sự kiện storage).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LANG_KEY) setLangState(normLang(e.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.setAttribute('content', translate(lang, 'meta.description'))
  }, [lang])

  return useMemo(() => {
    const locale = localeOf(lang)
    const t: TFn = (key, params) => translate(lang, key, params)
    // Trường dạng { en, vi }: lấy theo ngôn ngữ hiện tại (giá trị thường thì trả nguyên)
    const loc = <T,>(v: Localized<T>): T => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as { en: T; vi?: T }
        return (o[lang] !== undefined ? o[lang] : o.en) as T
      }
      return v as T
    }
    const fmtDate = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, o).format(d)
    const fmtNumber = (n: number) => new Intl.NumberFormat(locale).format(n)
    // Tên thứ: tiếng Việt giữ bảng cũ, tiếng Anh lấy từ Intl
    const weekdayOf = (d: Date) => (lang === 'vi' ? WEEKDAYS_VI[d.getDay()] : fmtDate(d, { weekday: 'long' }))
    return { lang, setLang, t, loc, fmtDate, fmtNumber, weekdayOf }
  }, [lang, setLang])
}

export type I18nApi = ReturnType<typeof useI18nState>

const I18nContext = createContext<I18nApi | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const api = useI18nState()
  return <I18nContext.Provider value={api}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nApi {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n phải nằm trong <I18nProvider>')
  return ctx
}