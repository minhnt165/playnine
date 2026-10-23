import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/i18n'
import { UpdateNotice } from './UpdateNotice'

const server = (commit: string) => vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ commit }) })

afterEach(() => vi.unstubAllGlobals())

const mount = (current: string, fetchFn: ReturnType<typeof vi.fn>) => {
  vi.stubGlobal('fetch', fetchFn)
  return render(
    <I18nProvider>
      <UpdateNotice current={current} />
    </I18nProvider>,
  )
}

describe('UpdateNotice', () => {
  it('không hiện gì khi server vẫn là bản đang chạy', async () => {
    const f = server('abc1234')
    mount('abc1234', f)
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('hiện thông báo và nút tải lại khi server có commit khác', async () => {
    mount('abc1234', server('def5678'))
    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('A new version of PlayNine is ready')
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    screen.getByRole('button', { name: 'Reload' }).click()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('kiểm tra lại khi app được mở lại (tab/app hiện trở lại)', async () => {
    const f = server('abc1234')
    mount('abc1234', f)
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    f.mockResolvedValue({ ok: true, json: () => Promise.resolve({ commit: 'def5678' }) })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })
})
