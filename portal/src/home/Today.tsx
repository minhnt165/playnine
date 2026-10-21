import { useEffect, useRef, type CSSProperties } from 'react'
import { useI18n } from '../i18n/i18n'
import type { TileText, TodayTile } from './todayTiles'

// Huy hiệu trạng thái ở góc icon game (SVG thay emoji để đồng nhất mọi hệ điều hành)
const TILE_BADGES: Record<TodayTile['badge'], string> = {
  play: '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M3.5 1.8v8.4c0 .5.5.8.9.5l6.3-4.2a.6.6 0 0 0 0-1L4.4 1.3c-.4-.3-.9 0-.9.5z"/></svg>',
  daily: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="1.5" y="2.5" width="9" height="8" rx="1.6"/><path d="M1.5 5.2h9M4 1v2.4M8 1v2.4"/></svg>',
  done: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.3 6.3l2.4 2.4 5-5"/></svg>',
  new: '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M6 .8l1.3 3.4a.8.8 0 0 0 .5.5L11.2 6l-3.4 1.3a.8.8 0 0 0-.5.5L6 11.2 4.7 7.8a.8.8 0 0 0-.5-.5L.8 6l3.4-1.3a.8.8 0 0 0 .5-.5z"/></svg>',
}

// html (từ DICT) dùng dangerouslySetInnerHTML; text (do game ghi) là text node nên không thể chèn phần tử.
function Line({ className, v }: { className: string; v: TileText }) {
  return 'html' in v ? <p className={className} dangerouslySetInnerHTML={{ __html: v.html }} /> : <p className={className}>{v.text}</p>
}

export function Today({ tiles }: { tiles: TodayTile[] }) {
  const { t } = useI18n()
  const box = useRef<HTMLElement>(null)

  // Thanh tiến độ chạy rộng sau 2 khung hình (thao tác DOM trực tiếp như cổng cũ, tránh setState ngoài React).
  useEffect(() => {
    let r2 = 0
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        box.current?.querySelectorAll<HTMLElement>('.bar > i').forEach((el) => {
          el.style.width = el.dataset.w ?? ''
        })
      })
    })
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
    }
  }, [tiles])

  return (
    <section className="today" id="today" aria-label={t('today.label')} ref={box}>
      {tiles.map((tile, i) => (
        <a
          key={tile.game.id + tile.badge + i}
          className="tile reveal"
          style={{ '--i': 2 + i * 0.6 } as CSSProperties}
          href={'#/play/' + tile.game.id}
        >
          <span
            className="tile-icon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{
              __html: tile.game.icon(tile.game.dir) + '<span class="tile-badge">' + TILE_BADGES[tile.badge] + '</span>',
            }}
          />
          <span className="tile-body">
            <p className="tile-kicker">{tile.kicker}</p>
            <Line className="tile-title" v={tile.title} />
            <Line className="tile-meta" v={tile.meta} />
            {tile.bar !== undefined && (
              <span className="bar">
                <i data-w={(tile.bar * 100).toFixed(1) + '%'} />
              </span>
            )}
          </span>
          <span className="tile-go" aria-hidden="true">
            →
          </span>
        </a>
      ))}
    </section>
  )
}