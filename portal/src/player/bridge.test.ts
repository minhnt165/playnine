import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameToPortal } from '@playnine/sdk/protocol'
import { useGameBridge } from './bridge'

const frames: HTMLIFrameElement[] = []
const mkFrame = () => {
  const f = document.createElement('iframe')
  document.body.appendChild(f)
  frames.push(f)
  return f
}
afterEach(() => {
  frames.splice(0).forEach((f) => f.remove())
})

const send = (data: unknown, source: Window | null, origin = location.origin) =>
  window.dispatchEvent(new MessageEvent('message', { data, source, origin }))

describe('useGameBridge', () => {
  const setup = () => {
    const frame = mkFrame()
    const onMessage = vi.fn<(m: GameToPortal) => void>()
    renderHook(() => useGameBridge({ frame, gameId: '2048', onMessage }))
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    return { frame, onMessage, post }
  }

  it('pn:hello được trả pn:ready, không chuyển cho onMessage', () => {
    const { frame, onMessage, post } = setup()
    send({ type: 'pn:hello', v: 1, gameId: '2048' }, frame.contentWindow)
    expect(post).toHaveBeenCalledWith({ type: 'pn:ready', v: 1 }, location.origin)
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('pn:start tới onMessage', () => {
    const { frame, onMessage, post } = setup()
    const m = { type: 'pn:start', v: 1, gameId: '2048', mode: 'classic', resume: false }
    send(m, frame.contentWindow)
    expect(onMessage).toHaveBeenCalledWith(m)
    expect(post).not.toHaveBeenCalled()
  })

  it('bỏ qua tin từ cửa sổ khác, origin khác, gameId khác, sai dạng', () => {
    const { frame, onMessage, post } = setup()
    const other = mkFrame()
    const start = { type: 'pn:start', v: 1, gameId: '2048', mode: 'classic', resume: false }
    send(start, other.contentWindow)
    send(start, null)
    send(start, frame.contentWindow, 'https://evil.example')
    send({ ...start, gameId: 'sugoku' }, frame.contentWindow)
    send({ ...start, resume: 'yes' }, frame.contentWindow)
    send('hello', frame.contentWindow)
    send({ type: 'pn:hello', v: 1, gameId: 'sugoku' }, frame.contentWindow)
    expect(onMessage).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('gỡ listener khi unmount', () => {
    const frame = mkFrame()
    const onMessage = vi.fn()
    const { unmount } = renderHook(() => useGameBridge({ frame, gameId: '2048', onMessage }))
    unmount()
    send({ type: 'pn:start', v: 1, gameId: '2048', mode: 'm', resume: false }, frame.contentWindow)
    expect(onMessage).not.toHaveBeenCalled()
  })
})