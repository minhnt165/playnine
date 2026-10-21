import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/i18n'
import { BUILD_INFO } from '../lib/buildInfo'
import { Footer } from './Footer'

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Footer', () => {
  it('hiện phiên bản và commit của bản build', () => {
    const { container } = render(
      <I18nProvider>
        <Footer />
      </I18nProvider>,
    )
    const box = container.querySelector('#build-info')
    expect(box?.textContent).toContain('v' + BUILD_INFO.version + ' · ' + BUILD_INFO.commit + ' · ')
    if (BUILD_INFO.commit !== 'dev') {
      expect(box?.querySelector('a')?.getAttribute('href')).toBe(
        'https://github.com/minhnt165/playnine/commit/' + BUILD_INFO.commit,
      )
    }
  })
})
