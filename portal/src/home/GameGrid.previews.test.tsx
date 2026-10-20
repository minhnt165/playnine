import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../i18n/i18n'
import { emptySd } from './testUtil'
import { GameGrid } from './GameGrid'

afterEach(cleanup)

const grid = (openIds: Set<string>) => (
  <I18nProvider>
    <GameGrid sd={emptySd()} xq={{ level: null } as never} rec={{}} sums={{}} openIds={openIds} now={new Date()} />
  </I18nProvider>
)

describe('GameGrid + previews', () => {
  it('preview được chèn và ribbon bật/tắt vẫn sống chung với phần tử đã chèn', () => {
    const { container, rerender, unmount } = render(grid(new Set()))
    const host = container.querySelector('.preview[data-game="sudoku"]')!
    const injected = host.querySelector('.mini-sudoku, div, svg')
    expect(host.children.length).toBeGreaterThan(1) // kbd + preview đã chèn
    expect(injected).not.toBeNull()
    const injectedCount = host.children.length
    expect(host.querySelector('.ribbon')).toBeNull()

    expect(() => rerender(grid(new Set(['sudoku'])))).not.toThrow()
    expect(host.querySelector('.ribbon')).not.toBeNull()
    expect(host.children.length).toBe(injectedCount + 1)

    expect(() => rerender(grid(new Set()))).not.toThrow()
    expect(host.querySelector('.ribbon')).toBeNull()
    expect(host.children.length).toBe(injectedCount)
    unmount()
  })

  it('gỡ component thì dọn timer', async () => {
    const { vi } = await import('vitest')
    vi.useFakeTimers()
    const { unmount } = render(grid(new Set()))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })
})