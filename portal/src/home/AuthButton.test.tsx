import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/i18n'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import { AuthButton } from './AuthButton'

const A = { id: 'u-a', displayName: 'Alice', avatarUrl: null }
const renderBtn = (api: ReturnType<typeof createFakeApi> | null) =>
  render(
    <I18nProvider>
      <ServerProvider api={api}>
        <AuthButton />
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
})

describe('AuthButton', () => {
  it('không có server: không render gì', () => {
    const { container } = renderBtn(null)
    expect(container.innerHTML).toBe('')
  })

  it('chưa đăng nhập: nút đăng nhập gọi signInWithGoogle', async () => {
    const api = createFakeApi()
    renderBtn(api)
    const btn = await screen.findByRole('button', { name: DICT.en['auth.signIn'] as string })
    fireEvent.click(btn)
    await waitFor(() => expect(api.calls.some((c) => c.method === 'signInWithGoogle')).toBe(true))
  })

  it('đã đăng nhập: chữ cái đầu, menu có liên kết hồ sơ và đăng xuất', async () => {
    const api = createFakeApi({ user: A })
    renderBtn(api)
    const avatar = await screen.findByRole('button', { name: /Alice/ })
    expect(avatar).toHaveTextContent('A')
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(avatar)
    const link = screen.getByRole('menuitem', { name: DICT.en['auth.profile'] as string })
    expect(link).toHaveAttribute('href', '#/u/u-a')
    fireEvent.click(screen.getByRole('menuitem', { name: DICT.en['auth.signOut'] as string }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'signOut')).toBe(true))
  })

  it('có avatarUrl thì hiện ảnh', async () => {
    renderBtn(createFakeApi({ user: { ...A, avatarUrl: 'https://example.com/a.png' } }))
    const btn = await screen.findByRole('button', { name: /Alice/ })
    expect(btn.querySelector('img')).toHaveAttribute('src', 'https://example.com/a.png')
  })

  it('tên chứa HTML hiện dạng text, không dựng phần tử', async () => {
    const evil = '<img src=x onerror=alert(1)>'
    const { container } = renderBtn(createFakeApi({ user: { ...A, displayName: evil } }))
    const btn = await screen.findByRole('button', { name: new RegExp('onerror') })
    fireEvent.click(btn)
    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(container.textContent).toContain(evil)
  })
})
