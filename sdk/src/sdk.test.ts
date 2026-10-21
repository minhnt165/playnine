import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlayNine } from './sdk'
import { isGameToPortal } from './protocol'

const origin = window.location.origin
let parent: { postMessage: ReturnType<typeof vi.fn> }

function make(opts: { parent?: unknown } = {}) {
  const p = 'parent' in opts ? opts.parent : parent
  return createPlayNine({ win: window, parent: p as Window | null })
}
function ready(source: unknown = parent, o: string = origin) {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'pn:ready', v: 1 }, source: source as MessageEventSource, origin: o }))
}

beforeEach(() => {
  vi.useFakeTimers()
  parent = { postMessage: vi.fn() }
})
afterEach(() => vi.useRealTimers())

describe('PlayNine SDK', () => {
  it('standalone when not framed', () => {
    const pn = make({ parent: null })
    expect(() => {
      pn.init({ gameId: 'x' })
      pn.gameStart({ mode: 'm' })
      pn.gameEnd({ mode: 'm', won: true })
    }).not.toThrow()
    expect(parent.postMessage).not.toHaveBeenCalled()
    expect(pn.isConnected()).toBe(false)
  })

  it('hello then ready connects', () => {
    const pn = make()
    pn.init({ gameId: '2048' })
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'pn:hello', v: 1, gameId: '2048' }, origin)
    expect(pn.isConnected()).toBe(false)
    ready()
    expect(pn.isConnected()).toBe(true)
  })

  it('queues calls until ready', () => {
    const pn = make()
    pn.init({ gameId: '2048' })
    parent.postMessage.mockClear()
    pn.gameStart({ mode: '4x4' })
    expect(parent.postMessage).not.toHaveBeenCalled()
    ready()
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'pn:start', v: 1, gameId: '2048', mode: '4x4', resume: false }, origin)
  })

  it('drops the queue after the timeout', () => {
    const pn = make()
    pn.init({ gameId: '2048' })
    parent.postMessage.mockClear()
    pn.gameStart({ mode: '4x4' })
    vi.advanceTimersByTime(1500)
    expect(pn.isConnected()).toBe(false)
    pn.gameStart({ mode: '4x4' })
    ready()
    expect(parent.postMessage).not.toHaveBeenCalled()
  })

  it('ignores ready from another origin or source', () => {
    const pn = make()
    pn.init({ gameId: '2048' })
    ready(parent, 'https://evil.example')
    ready({ postMessage: vi.fn() })
    expect(pn.isConnected()).toBe(false)
  })

  it('gameEnd without gameStart is ignored; second gameEnd dropped', () => {
    const pn = make()
    pn.init({ gameId: '2048' })
    ready()
    parent.postMessage.mockClear()
    pn.gameEnd({ mode: '4x4', won: true })
    expect(parent.postMessage).not.toHaveBeenCalled()
    pn.gameStart({ mode: '4x4' })
    pn.gameEnd({ mode: '4x4', won: true, score: 10, timeMs: 5 })
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      { type: 'pn:end', v: 1, gameId: '2048', mode: '4x4', won: true, score: 10, timeMs: 5 },
      origin,
    )
    const n = parent.postMessage.mock.calls.length
    pn.gameEnd({ mode: '4x4', won: true })
    expect(parent.postMessage).toHaveBeenCalledTimes(n)
  })

  it('never throws', () => {
    parent.postMessage.mockImplementation(() => {
      throw new Error('boom')
    })
    const pn = make()
    expect(() => {
      pn.gameStart({ mode: 'm' })
      pn.init({ gameId: 'x' })
      ready()
      pn.gameStart({ mode: 'm' })
      pn.gameEnd({ mode: 'm', won: false })
      pn.isConnected()
    }).not.toThrow()
  })
})

describe('isGameToPortal', () => {
  it('accepts well-formed messages', () => {
    expect(isGameToPortal({ type: 'pn:hello', v: 1, gameId: 'a' })).toBe(true)
    expect(isGameToPortal({ type: 'pn:end', v: 1, gameId: 'a', mode: 'm', won: true, score: 0 })).toBe(true)
  })
  it.each([
    [{ type: 'pn:hello', v: 1 }],
    [{ type: 'pn:hello', v: 2, gameId: 'a' }],
    [{ type: 'pn:end', v: 1, gameId: 'a', mode: 'm', won: true, score: -1 }],
    [{ type: 'pn:end', v: 1, gameId: 'a', mode: 'm', won: true, score: NaN }],
    [{ type: 'pn:end', v: 1, gameId: 'a', mode: 'm', won: 'yes' }],
    [null],
  ])('rejects %j', (m) => {
    expect(isGameToPortal(m)).toBe(false)
  })
})