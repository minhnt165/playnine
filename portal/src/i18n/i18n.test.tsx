import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider, LANG_KEY, useI18n } from './i18n'

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
const setup = () => renderHook(() => useI18n(), { wrapper })

beforeEach(() => localStorage.clear())
afterEach(() => {
  localStorage.clear()
  document.documentElement.lang = 'en'
})

describe('i18n', () => {
  it('defaults to en when the key is empty', () => {
    expect(setup().result.current.lang).toBe('en')
  })

  it('defaults to en for an unknown stored value', () => {
    localStorage.setItem(LANG_KEY, 'fr')
    expect(setup().result.current.lang).toBe('en')
  })

  it('translates, falls back to the key, and substitutes params', () => {
    const { result } = setup()
    expect(result.current.t('cat.all')).toBe('All')
    expect(result.current.t('missing.key')).toBe('missing.key')
    expect(result.current.t('theme.label', { label: 'Dark' })).toBe('Theme: Dark. Click to change')
    act(() => result.current.setLang('vi'))
    expect(result.current.t('cat.all')).toBe('Tất cả')
  })

  it('picks one/other plural by n === 1', () => {
    const { result } = setup()
    expect(result.current.t('ago.min', { n: 1 })).toBe('1 minute ago')
    expect(result.current.t('ago.min', { n: 5 })).toBe('5 minutes ago')
  })

  it('setLang writes storage and document lang', () => {
    const { result } = setup()
    act(() => result.current.setLang('vi'))
    expect(localStorage.getItem(LANG_KEY)).toBe('vi')
    expect(document.documentElement.lang).toBe('vi')
  })

  it('follows a storage event from another tab', () => {
    const { result } = setup()
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: LANG_KEY, newValue: 'vi' }))
    })
    expect(result.current.lang).toBe('vi')
  })

  it('loc falls back to en', () => {
    const { result } = setup()
    act(() => result.current.setLang('vi'))
    expect(result.current.loc({ en: 'A' })).toBe('A')
    expect(result.current.loc({ en: 'A', vi: 'B' })).toBe('B')
    expect(result.current.loc('plain')).toBe('plain')
  })
})