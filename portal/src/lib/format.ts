/** Số lượt chơi dạng rút gọn: en 1.2K, vi 1,2 N. */
export function formatCount(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}