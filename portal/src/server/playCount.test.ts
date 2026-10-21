import { describe, expect, it } from 'vitest'
import { createFakeApi } from './fakeApi'
import { recordPlayThrottled } from './playCount'

const MIN = 60_000
const setup = () => {
  const api = createFakeApi()
  let t = 1_000_000
  const deps = { storage: window.sessionStorage, now: () => t }
  window.sessionStorage.clear()
  return { api, deps, advance: (ms: number) => (t += ms) }
}
const count = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((c) => c.method === 'recordPlay').length

describe('recordPlayThrottled', () => {
  it('lần đầu gọi recordPlay, lần hai trong 30 phút không gọi', () => {
    const { api, deps, advance } = setup()
    recordPlayThrottled(api, '2048', deps)
    advance(29 * MIN)
    recordPlayThrottled(api, '2048', deps)
    expect(count(api)).toBe(1)
  })
  it('sau 30 phút gọi lại', () => {
    const { api, deps, advance } = setup()
    recordPlayThrottled(api, '2048', deps)
    advance(30 * MIN)
    recordPlayThrottled(api, '2048', deps)
    expect(count(api)).toBe(2)
  })
  it('game khác gọi riêng', () => {
    const { api, deps } = setup()
    recordPlayThrottled(api, '2048', deps)
    recordPlayThrottled(api, 'sugoku', deps)
    expect(api.calls.filter((c) => c.method === 'recordPlay').map((c) => c.args[0])).toEqual(['2048', 'sugoku'])
  })
  it('recordPlay lỗi không ném, kể cả không có unhandled rejection', async () => {
    const { api, deps } = setup()
    api.fail('recordPlay')
    expect(() => recordPlayThrottled(api, '2048', deps)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(count(api)).toBe(1)
  })
  it('api null không làm gì', () => {
    const { deps } = setup()
    expect(() => recordPlayThrottled(null, '2048', deps)).not.toThrow()
    expect(window.sessionStorage.getItem('playnine-play-2048')).toBeNull()
  })
  it('storage hỏng vẫn không ném', () => {
    const { api, advance } = setup()
    const bad = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } } as unknown as Storage
    advance(0)
    expect(() => recordPlayThrottled(api, '2048', { storage: bad })).not.toThrow()
  })
})