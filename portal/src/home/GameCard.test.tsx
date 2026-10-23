import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { gameById, type GameDef } from '../games/catalog'
import { I18nProvider } from '../i18n/i18n'
import { ServerProvider } from '../server/ServerProvider'
import { GameCard } from './GameCard'

afterEach(cleanup)

const card = (game: GameDef) =>
  render(
    <I18nProvider>
      <ServerProvider api={null}>
        <ul>
          <GameCard game={game} index={0} ribbon={null} note="" hidden={false} />
        </ul>
      </ServerProvider>
    </I18nProvider>,
  ).container

describe('GameCard', () => {
  it('manifest có preview: hiện preview.svg lười tải trên nền preview.bg, không gắn preview JS', () => {
    const c = card({ ...gameById('2048')!, id: 'demo', dir: 'demo/', preview: { bg: 'rgb(255, 0, 0)' } })
    const img = c.querySelector('img.pv-img')!
    expect(img.getAttribute('src')).toBe('demo/preview.svg')
    expect(img.getAttribute('loading')).toBe('lazy')
    const host = c.querySelector<HTMLElement>('.preview')!
    expect(host.hasAttribute('data-game')).toBe(false)
    expect(host.style.background).toBe('rgb(255, 0, 0)')
  })

  it('không có preview: giữ preview JS cũ (data-game), không có ảnh', () => {
    const c = card(gameById('2048')!)
    expect(c.querySelector('.preview[data-game="2048"]')).not.toBeNull()
    expect(c.querySelector('img.pv-img')).toBeNull()
  })
})
