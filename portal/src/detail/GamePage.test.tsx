import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gameById } from '../games/catalog'
import { DICT } from '../i18n/dict'
import { I18nProvider } from '../i18n/i18n'
import type { Localized } from '../i18n/types'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import type { GameMeta } from '../server/types'
import { GamePage } from './GamePage'

const en = (k: string) => DICT.en[k] as string
const enOf = (v: Localized<string>) => (typeof v === 'string' ? v : v.en)
const GAMES: GameMeta[] = [
  { id: '2048', metric: 'score_high', hidden: false, modes: [{ key: 'classic', label: { en: 'Classic', vi: 'Cổ điển' } }] },
]
const g2048 = gameById('2048')!
const ME = { id: 'me', displayName: 'Minh', avatarUrl: null }

const mount = (api: ReturnType<typeof createFakeApi> | null, game = g2048) =>
  render(
    <I18nProvider>
      <ServerProvider api={api}>
        <GamePage game={game} refreshKey={0} />
      </ServerProvider>
    </I18nProvider>,
  )

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('GamePage', () => {
  it('hiện tên, mô tả, tiêu đề tab và nút chơi dẫn tới #/play/<id>', () => {
    mount(null)
    expect(screen.getByRole('heading', { level: 1, name: enOf(g2048.name) })).toBeInTheDocument()
    expect(screen.getByText(enOf(g2048.desc))).toBeInTheDocument()
    expect(document.title).toBe(enOf(g2048.name) + ' · PlayNine')
    expect(screen.getByRole('link', { name: new RegExp(en('detail.play')) })).toHaveAttribute('href', '#/play/2048')
  })

  it('có server: hiện bảng xếp hạng với các hàng', async () => {
    const api = createFakeApi({
      games: GAMES,
      gamePoints: { '2048|week': [{ rank: 1, userId: 'u1', displayName: 'An', avatarUrl: null, value: 500, achievedAt: '' }] },
    })
    mount(api)
    expect(await screen.findByRole('heading', { name: en('lb.title') })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'An' })).toHaveAttribute('href', '#/u/u1')
  })

  it('khách: có lời mời đăng nhập, nút gọi signInWithGoogle', async () => {
    const api = createFakeApi({ games: GAMES })
    const { container } = mount(api)
    const hint = await screen.findByText(en('play.signInToScore'))
    expect(hint.closest('.detail-signin')).toBe(container.querySelector('.detail-signin'))
    fireEvent.click(within(container.querySelector<HTMLElement>('.detail-signin')!).getByRole('button', { name: en('auth.signIn') }))
    expect(api.calls.some((c) => c.method === 'signInWithGoogle')).toBe(true)
  })

  it('đã đăng nhập: không có lời mời đăng nhập', async () => {
    mount(createFakeApi({ user: ME, games: GAMES }))
    await screen.findByRole('heading', { name: en('lb.title') })
    expect(screen.queryByText(en('play.signInToScore'))).toBeNull()
  })

  it('game chưa nối SDK: không có bảng xếp hạng', async () => {
    mount(createFakeApi({ games: [{ ...GAMES[0] }] }), { ...g2048, sdk: false })
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByRole('heading', { name: en('lb.title') })).toBeNull()
  })

  it('rời trang thì trả tiêu đề mặc định', () => {
    const view = mount(null)
    view.unmount()
    expect(document.title).toBe('PlayNine')
  })
})
