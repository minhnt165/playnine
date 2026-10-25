import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { I18nProvider } from './i18n/i18n'
import * as glyphs from './legacy/glyphs'
import { createFakeApi } from './server/fakeApi'
import { ServerProvider } from './server/ServerProvider'

const renderApp = () =>
  render(
    <I18nProvider>
      <ServerProvider api={createFakeApi()}>
        <App />
      </ServerProvider>
    </I18nProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  location.hash = ''
})

describe('App routes', () => {
  it('trang phụ được tải lười: hiện vòng chờ trước khi trang tới', async () => {
    location.hash = '#/game/2048'
    const { container } = renderApp()
    expect(container.querySelector('.page-loading')).not.toBeNull()
    expect(container.querySelector('main.detail')).toBeNull()
    await waitFor(() => expect(container.querySelector('main.detail')).not.toBeNull())
    expect(container.querySelector('.page-loading')).toBeNull()
  })

  it('#/events hiện trang sự kiện tạm, không hiện lưới game', async () => {
    location.hash = '#/events'
    const { container } = renderApp()
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(container.querySelector('[data-page="events"]')).not.toBeNull()
    expect(container.querySelector('#games')).toBeNull()
  })

  it('#/events/<uuid> hiện trang chi tiết sự kiện tạm', async () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    location.hash = '#/events/' + id
    const { container } = renderApp()
    await waitFor(() => expect(container.querySelector(`[data-page="event"][data-event-id="${id}"]`)).not.toBeNull())
  })

  it('#/admin hiện trang quản trị tạm', async () => {
    location.hash = '#/admin'
    const { container } = renderApp()
    // Trang admin là chunk lazy lớn: lần import đầu khi cả bộ test chạy song song có thể quá 1 giây mặc định.
    await waitFor(() => expect(container.querySelector('[data-page="admin"]')).not.toBeNull(), { timeout: 5000 })
  })

  it('#/game/2048 hiện trang giới thiệu game, không hiện lưới game', async () => {
    location.hash = '#/game/2048'
    const { container } = renderApp()
    await waitFor(() => expect(container.querySelector('main.detail')).not.toBeNull())
    expect(container.querySelector('a.detail-play')).toHaveAttribute('href', '#/play/2048')
    expect(container.querySelector('#games')).toBeNull()
  })

  it('nền chữ bật sau lần vẽ đầu (không ép tính layout lúc mount) và nhận màu giao diện', async () => {
    const recolor = vi.fn()
    const spy = vi.spyOn(glyphs, 'startGlyphs').mockReturnValue({ recolor, stop: vi.fn() })
    const canvas = document.createElement('canvas')
    canvas.id = 'bg'
    document.body.appendChild(canvas)
    try {
      renderApp()
      expect(spy).not.toHaveBeenCalled()
      await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
      expect(recolor).toHaveBeenCalled()
    } finally {
      canvas.remove()
    }
  })

  it('#/play/2048 vẫn mở Player như trước', () => {
    location.hash = '#/play/2048'
    const { container } = renderApp()
    expect(container.querySelector('iframe')).not.toBeNull()
  })
})
