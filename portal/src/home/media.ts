// Truy vấn media an toàn: môi trường không có matchMedia (jsdom) coi như không khớp.
export const mediaMatches = (query: string): boolean =>
  typeof matchMedia === 'function' && matchMedia(query).matches

export const prefersReducedMotion = (): boolean => mediaMatches('(prefers-reduced-motion: reduce)')
export const canHover = (): boolean => mediaMatches('(hover: hover) and (pointer: fine)')