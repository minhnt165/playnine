import type { CSSProperties, ReactNode } from 'react'
import type { GameDef } from '../games/catalog'

/** Nền ô xem trước / bìa: game mới khai báo trong game.json (preview.bg); game cũ có lớp pv-<id> trong CSS. */
export const previewBg = (g: GameDef): CSSProperties | undefined => (g.preview ? { background: g.preview.bg } : undefined)

type Props = {
  g: GameDef
  /** Lớp thêm cho ô (vd. detail-preview). */
  className?: string
  /** Ô nằm ngay đầu trang: tải ảnh ngay thay vì tải lười. */
  eager?: boolean
  children?: ReactNode
}

/** Ô xem trước của một game: game mới dùng preview.svg tĩnh trên nền riêng; game cũ để previews.js dựng theo data-game. */
export function GamePreview({ g, className, eager, children }: Props) {
  return (
    <div
      className={'preview ' + (className ? className + ' ' : '') + 'pv-' + g.id}
      data-game={g.preview ? undefined : g.id}
      style={previewBg(g)}
      aria-hidden="true"
    >
      {g.preview && <img className="pv-img" src={g.dir + 'preview.svg'} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" />}
      {children}
    </div>
  )
}
