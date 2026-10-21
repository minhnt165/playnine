import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { I18nProvider } from './i18n/i18n'
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
  it('#/events hiện trang sự kiện tạm, không hiện lưới game', () => {
    location.hash = '#/events'
    const { container } = renderApp()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(container.querySelector('#games')).toBeNull()
  })

  it('#/admin hiện trang quản trị tạm', () => {
    location.hash = '#/admin'
    const { container } = renderApp()
    expect(container.querySelector('[data-page="admin"]')).not.toBeNull()
  })

  it('#/play/2048 vẫn mở Player như trước', () => {
    location.hash = '#/play/2048'
    const { container } = renderApp()
    expect(container.querySelector('iframe')).not.toBeNull()
  })
})
