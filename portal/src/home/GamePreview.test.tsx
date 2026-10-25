import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GAMES, gameById } from '../games/catalog'
import { I18nProvider } from '../i18n/i18n'
import previewsSrc from '../legacy/previews.js?raw'
import { GamePreview, previewBg } from './GamePreview'
import { Spotlight } from './Spotlight'

afterEach(cleanup)

const bia = gameById('bia')!
const sudoku = gameById('sudoku')!

describe('GamePreview', () => {
  it('game có preview.svg: ảnh tĩnh trên nền riêng, không gắn data-game cho preview động', () => {
    const { container } = render(<GamePreview g={bia} className="detail-preview" />)
    const host = container.querySelector('.preview.detail-preview.pv-bia') as HTMLElement
    expect(host).not.toBeNull()
    expect(host.dataset.game).toBeUndefined()
    expect(host.style.background).not.toBe('')
    expect(host.querySelector('img.pv-img')!.getAttribute('src')).toBe(bia.dir + 'preview.svg')
  })

  it('game cũ: không có ảnh tĩnh, để previews.js dựng theo data-game', () => {
    const { container } = render(<GamePreview g={sudoku} />)
    const host = container.querySelector('.preview.pv-sudoku') as HTMLElement
    expect(host.dataset.game).toBe('sudoku')
    expect(host.querySelector('img')).toBeNull()
  })

  it('previewBg: nền riêng cho bìa của game mới, game cũ dùng lớp pv-<id> trong CSS', () => {
    expect(previewBg(bia)).toEqual({ background: bia.preview!.bg })
    expect(previewBg(sudoku)).toBeUndefined()
  })

  it('mọi game trong danh mục đều có ô xem trước: preview.svg hoặc preview động pv_<id>', () => {
    const missing = GAMES.filter((g) => !g.preview && !previewsSrc.includes('pv_' + g.id + '(')).map((g) => g.id)
    expect(missing).toEqual([])
  })

  it('Spotlight: game nổi bật là game mới thì vẫn có ảnh xem trước', () => {
    const { container } = render(
      <I18nProvider>
        <Spotlight now={new Date(2026, 9, 25)} games={[bia]} />
      </I18nProvider>,
    )
    expect(container.querySelector('.spot-media .preview img.pv-img')).not.toBeNull()
  })
})
