import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DICT } from '../i18n/dict'
import { I18nProvider } from '../i18n/i18n'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import { AuthButton } from './AuthButton'

const en = (k: string) => DICT.en[k] as string
const GUEST = { id: 'g1', displayName: 'Guest-ABCD', avatarUrl: null, isGuest: true }

const mount = (api: ReturnType<typeof createFakeApi>, autoGuest = false) =>
  render(
    <I18nProvider>
      <ServerProvider api={api} autoGuest={autoGuest}>
        <AuthButton />
      </ServerProvider>
    </I18nProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(cleanup)

describe('Tài khoản khách', () => {
  it('chưa đăng nhập: có nút chơi với tư cách khách gọi signInAsGuest', async () => {
    const api = createFakeApi({})
    mount(api)
    fireEvent.click(await screen.findByRole('button', { name: en('auth.guest') }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'signInAsGuest')).toBe(true))
  })

  it('autoGuest: không có phiên thì tự tạo khách đúng một lần', async () => {
    const api = createFakeApi({})
    mount(api, true)
    expect(await screen.findByRole('button', { name: /Guest-ABCD/ })).toBeInTheDocument()
    expect(api.calls.filter((c) => c.method === 'signInAsGuest')).toHaveLength(1)
  })

  it('autoGuest nhưng đã có phiên: không tạo khách', async () => {
    const api = createFakeApi({ user: { id: 'u1', displayName: 'An', avatarUrl: null } })
    mount(api, true)
    await screen.findByRole('button', { name: /An/ })
    expect(api.calls.some((c) => c.method === 'signInAsGuest')).toBe(false)
  })

  it('menu của khách: có nhãn khách, liên kết Google và đăng nhập tài khoản có sẵn, không có đăng xuất', async () => {
    const api = createFakeApi({ user: GUEST })
    mount(api)
    fireEvent.click(await screen.findByRole('button', { name: /Guest-ABCD/ }))
    expect(screen.getByText(en('auth.guestTag'))).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: en('auth.signOut') })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(en('auth.link')) }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'linkGoogle')).toBe(true))
    fireEvent.click(await screen.findByRole('button', { name: /Guest-ABCD/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: en('auth.signInExisting') }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'signInWithGoogle')).toBe(true))
  })

  it('liên kết Google lỗi ngay (server chưa bật manual linking): khách thấy thông báo rõ ràng', async () => {
    const api = createFakeApi({ user: GUEST })
    api.fail('linkGoogle', new Error('linkGoogle: Manual linking is disabled'))
    mount(api)
    fireEvent.click(await screen.findByRole('button', { name: /Guest-ABCD/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(en('auth.link')) }))
    expect(await screen.findByRole('alert')).toHaveTextContent(en('auth.linkDisabled'))
  })

  it('quay về từ Google với lỗi "identity already exists": báo tài khoản Google đã có và dọn tham số lỗi trên URL', async () => {
    history.replaceState(null, '', '?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user#/play/2048')
    const api = createFakeApi({ user: GUEST })
    mount(api)
    expect(await screen.findByRole('alert')).toHaveTextContent(en('auth.alreadyLinked'))
    expect(location.search).toBe('')
    expect(location.hash).toBe('#/play/2048')
    history.replaceState(null, '', location.pathname)
  })

  it('lỗi khác khi đăng nhập Google: thông báo lỗi chung kèm chi tiết từ server', async () => {
    history.replaceState(null, '', '?error=access_denied&error_description=User+cancelled')
    mount(createFakeApi({}))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(en('auth.failed'))
    expect(alert).toHaveTextContent('User cancelled')
    expect(location.search).toBe('')
  })

  it('liên kết Google lỗi ngay vì lý do khác: báo liên kết không thành công kèm chi tiết', async () => {
    const api = createFakeApi({ user: GUEST })
    api.fail('linkGoogle', new Error('linkGoogle: Unsupported provider: provider is not enabled'))
    mount(api)
    fireEvent.click(await screen.findByRole('button', { name: /Guest-ABCD/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(en('auth.link')) }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(en('auth.linkFailed'))
    expect(alert).toHaveTextContent('Unsupported provider: provider is not enabled')
    expect(alert).not.toHaveTextContent('linkGoogle:')
  })

  it('quay về từ Google sau khi bấm liên kết mà server báo lỗi: báo liên kết không thành công, không phải lỗi đăng nhập', async () => {
    const api = createFakeApi({ user: GUEST })
    mount(api)
    fireEvent.click(await screen.findByRole('button', { name: /Guest-ABCD/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(en('auth.link')) }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'linkGoogle')).toBe(true))
    cleanup()
    // Trình duyệt đã sang Google rồi quay lại trang với lỗi trên URL.
    history.replaceState(null, '', '?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code')
    mount(createFakeApi({ user: GUEST }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(en('auth.linkFailed'))
    expect(alert).toHaveTextContent('Unable to exchange external code')
    expect(alert).toHaveTextContent('unexpected_failure')
    cleanup()
    // Đã báo xong thì quên việc đang liên kết: lỗi đăng nhập lần sau là lỗi đăng nhập.
    history.replaceState(null, '', '?error=access_denied')
    mount(createFakeApi({}))
    expect(await screen.findByRole('alert')).toHaveTextContent(en('auth.failed'))
  })

  it('menu hiện điểm tuần và tổng điểm kèm hạng', async () => {
    const api = createFakeApi({ user: GUEST, points: { g1: { week: { points: 120, rank: 4 }, all: { points: 980, rank: null } } } })
    mount(api)
    fireEvent.click(await screen.findByRole('button', { name: /Guest-ABCD/ }))
    const box = await screen.findByRole('menuitem', { name: /Points/ })
    expect(box).toHaveAttribute('href', '#/leaderboards')
    expect(box.textContent).toContain('120')
    expect(box.textContent).toContain('Rank #4')
    expect(box.textContent).toContain('980')
  })
})
