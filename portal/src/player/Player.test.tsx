import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GAMES, gameById } from '../games/catalog'
import { I18nProvider } from '../i18n/i18n'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { ServerProvider } from '../server/ServerProvider'
import { Player } from './Player'

const g2048 = gameById('2048')!
const NAME = (g2048.name as { en: string }).en
const mount = (portalSeen = false, game = g2048 as typeof g2048 | null) =>
  render(
    <I18nProvider>
      <Player game={game} heldIds={game ? [game.id] : []} portalSeen={portalSeen} />
    </I18nProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  location.hash = ''
})
afterEach(() => {
  cleanup()
  document.body.classList.remove('playing')
})

describe('Player', () => {
  it('mở 2048: iframe đúng title/src/allow, loading tắt khi iframe load', () => {
    const { container } = mount()
    const frames = container.querySelectorAll('#frames iframe')
    expect(frames).toHaveLength(1)
    const f = frames[0] as HTMLIFrameElement
    expect(f.title).toBe(NAME)
    expect(f.getAttribute('src')!.endsWith('2048/index.html')).toBe(true)
    expect(f.getAttribute('allow')).toBe('fullscreen')
    expect(f).toHaveClass('on')
    const loading = container.querySelector('#p-loading')!
    expect(loading).toHaveClass('on')
    fireEvent.load(f)
    expect(loading).not.toHaveClass('on')
    expect(document.body).toHaveClass('playing')
    expect(document.title).toBe(NAME + ' · PlayNine')
  })

  it('#p-switch có 17 nút, nút 2048 aria-current', () => {
    const { container } = mount()
    const btns = container.querySelectorAll('#p-switch button')
    expect(btns).toHaveLength(GAMES.length)
    expect(btns).toHaveLength(17)
    const cur = [...btns].filter((b) => b.getAttribute('aria-current') === 'true')
    expect(cur).toHaveLength(1)
    expect(cur[0].getAttribute('title')).toBe(NAME)
  })

  it('chip streak ẩn khi 0, hiện khi summary daily.streak = 4', () => {
    const a = mount()
    expect(a.container.querySelector('#p-chip')).toHaveAttribute('hidden')
    cleanup()
    localStorage.setItem(
      'playnine-2048-summary-v1',
      JSON.stringify({ v: 1, daily: { date: '2026-01-01', streak: 4 } }),
    )
    const b = mount()
    const chip = b.container.querySelector('#p-chip')!
    expect(chip).not.toHaveAttribute('hidden')
    expect(chip.textContent).toBe((DICT.en['player.streak'] as { other: string }).other.replace('{n}', '4'))
  })

  it('menu mở bằng #p-menu, Escape và click ngoài đóng lại', () => {
    const { container } = mount()
    const list = container.querySelector('#p-menu-list')!
    const btn = container.querySelector('#p-menu')!
    expect(list).toHaveAttribute('hidden')
    fireEvent.click(btn)
    expect(list).not.toHaveAttribute('hidden')
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(list).toHaveAttribute('hidden')
    fireEvent.click(btn)
    expect(list).not.toHaveAttribute('hidden')
    fireEvent.click(document.body)
    expect(list).toHaveAttribute('hidden')
  })

  it('đổi ngôn ngữ từ iframe: nhãn đổi, iframe giữ nguyên phần tử', () => {
    const { container } = mount()
    const before = container.querySelector('#frames iframe')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'playnine-lang', newValue: 'vi' }))
    })
    expect(container.querySelector('#p-back')!.getAttribute('aria-label')).toBe('Về PlayNine')
    expect(container.querySelector('#frames iframe')).toBe(before)
  })

  it('Back khi portalSeen=false đặt hash rỗng', () => {
    location.hash = '#/play/2048'
    const { container } = mount(false)
    fireEvent.click(container.querySelector('#p-back')!)
    expect(location.hash).toBe('')
  })

  it('Back khi portalSeen=true gọi history.back', () => {
    const { container } = mount(true)
    let called = false
    const orig = history.back
    history.back = () => { called = true }
    fireEvent.click(container.querySelector('#p-back')!)
    history.back = orig
    expect(called).toBe(true)
  })

  it('game=null: không còn class playing; frame keepAlive vẫn còn nhưng ẩn', () => {
    const xq = gameById('xiangqi')!
    const { container, rerender } = render(
      <I18nProvider>
        <Player game={xq} heldIds={['xiangqi']} portalSeen />
      </I18nProvider>,
    )
    const f = container.querySelector('#frames iframe')
    rerender(
      <I18nProvider>
        <Player game={null} heldIds={['xiangqi']} portalSeen />
      </I18nProvider>,
    )
    expect(document.body).not.toHaveClass('playing')
    expect(container.querySelector('#frames iframe')).toBe(f)
    expect(f).not.toHaveClass('on')
    expect(document.title).toBe('PlayNine')
  })
})

describe('Player + server', () => {
  const U = { id: 'u-a', displayName: 'Alice', avatarUrl: null }
  const mountServer = (api: ReturnType<typeof createFakeApi>) => {
    localStorage.setItem('playnine-lang', 'vi')
    const r = render(
      <I18nProvider>
        <ServerProvider api={api}>
          <Player game={g2048} heldIds={[g2048.id]} portalSeen={false} />
        </ServerProvider>
      </I18nProvider>,
    )
    const frame = r.container.querySelector('#frames iframe') as HTMLIFrameElement
    const send = (data: unknown) =>
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: frame.contentWindow }))
      })
    return { ...r, send }
  }
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  const start = { type: 'pn:start', v: 1, gameId: '2048', mode: 'classic', resume: false }
  const end = { type: 'pn:end', v: 1, gameId: '2048', mode: 'classic', score: 10, won: true }
  const has = (api: ReturnType<typeof createFakeApi>, m: string) => api.calls.some((c) => c.method === m)

  it('đã đăng nhập: pn:start rồi pn:end → toast "Đã ghi điểm · hạng #1"', async () => {
    const api = createFakeApi({ user: U, finish: { status: 'finished', reason: null, ranks: { week: 1 } } })
    const { send, container } = mountServer(api)
    await settle()
    send(start)
    await waitFor(() => expect(has(api, 'startRun')).toBe(true))
    await waitFor(() => expect(localStorage.getItem('playnine-run-2048')).not.toBeNull())
    send(end)
    await waitFor(() => expect(container.querySelector('[role="status"]')!.textContent).toContain('Đã ghi điểm · hạng #1'))
  })

  it('khách: hiện dòng đăng nhập để ghi điểm, nút gọi signInWithGoogle', async () => {
    const api = createFakeApi()
    const { container } = mountServer(api)
    await waitFor(() => expect(container.querySelector('.play-status')!.textContent).toContain('Đăng nhập để ghi điểm'))
    fireEvent.click(container.querySelector('.play-status button')!)
    expect(has(api, 'signInWithGoogle')).toBe(true)
  })

  it('finishRun lỗi → toast saveFailed, không lỗi chưa bắt', async () => {
    const api = createFakeApi({ user: U })
    const { send, container } = mountServer(api)
    await settle()
    send(start)
    await waitFor(() => expect(localStorage.getItem('playnine-run-2048')).not.toBeNull())
    api.fail('finishRun')
    send(end)
    await waitFor(() => expect(container.querySelector('[role="status"]')!.textContent).toBe(DICT.vi['play.saveFailed']))
  })

  it('startRun lỗi → dòng "không tính điểm"', async () => {
    const api = createFakeApi({ user: U })
    api.fail('startRun')
    const { send, container } = mountServer(api)
    await settle()
    send(start)
    await waitFor(() => expect(container.querySelector('.play-status')!.textContent).toBe(DICT.vi['play.unscored']))
  })
})