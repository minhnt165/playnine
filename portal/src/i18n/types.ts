// Kiểu dùng chung của lớp i18n (Task 4+ import từ './i18n' hoặc trực tiếp file này).
export type Lang = 'en' | 'vi'
/** Trường dạng { en, vi } (vi tùy chọn, thiếu thì lấy en) hoặc giá trị thường. */
export type Localized<T> = T | { en: T; vi?: T }
export type TFn = (key: string, params?: Record<string, string | number>) => string