import { beforeEach, describe, expect, it } from 'vitest'
import type { AuthUser } from './types'
import { createFakeApi } from './fakeApi'
import { createRunManager } from './runs'

const A: AuthUser = { id: 'u-a', displayName: 'A', avatarUrl: null }
const B: AuthUser = { id: 'u-b', displayName: 'B', avatarUrl: null }
const R = { score: 100, timeMs: 5000, won: true, assisted: false }
const KEY = 'playnine-run-2048'
const DAY = 24 * 60 * 60 * 1000

let storage: Storage
let t: number
let user: AuthUser | null
beforeEach(() => {
  storage = window.localStorage
  storage.clear()
  t = 5_000_000
  user = A
})
const mk = (api: ReturnType<typeof createFakeApi> | null) =>
  createRunManager({ api, getUser: () => user, storage, now: () => t })
const names = (api: ReturnType<typeof createFakeApi>) => api.calls.map((c) => c.method)

describe('createRunManager', () => {
  it('guest runs are unscored', async () => {
    user = null
    const api = createFakeApi()
    const m = mk(api)
    expect(await m.start('2048', 'classic', false)).toEqual({ kind: 'unscored', why: 'guest' })
    expect(names(api)).not.toContain('startRun')
    expect(await m.end('2048', 'classic', R)).toEqual({ kind: 'skipped' })
  })

  it('no server → no_server', async () => {
    const m = mk(null)
    expect(await m.start('2048', 'classic', false)).toEqual({ kind: 'unscored', why: 'no_server' })
    expect(await m.end('2048', 'classic', R)).toEqual({ kind: 'skipped' })
  })

  it('start then end saves and clears the stored run', async () => {
    const api = createFakeApi({ finish: { status: 'finished', reason: null, ranks: { week: 1 } } })
    const m = mk(api)
    expect(await m.start('2048', 'classic', false)).toEqual({ kind: 'scored' })
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual({ runId: 'run-1', mode: 'classic', userId: 'u-a', startedAt: t })
    const out = await m.end('2048', 'classic', R)
    expect(out).toEqual({ kind: 'saved', result: api.state.finish })
    expect(api.calls.find((c) => c.method === 'finishRun')!.args).toEqual(['run-1', R])
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('resume reuses a stored run within 24h for the same mode and user', async () => {
    const api = createFakeApi()
    await mk(api).start('2048', 'classic', false)
    t += DAY - 1
    const m2 = mk(api) // như sau khi tải lại trang
    expect(await m2.start('2048', 'classic', true)).toEqual({ kind: 'scored' })
    expect(names(api).filter((n) => n === 'startRun')).toHaveLength(1)
    expect((await m2.end('2048', 'classic', R)).kind).toBe('saved')
    expect(api.calls.find((c) => c.method === 'finishRun')!.args[0]).toBe('run-1')
  })

  it('resume after 24h, other mode or other user → no_resume, end → skipped', async () => {
    const api = createFakeApi()
    await mk(api).start('2048', 'classic', false)

    t += DAY
    let m = mk(api)
    expect(await m.start('2048', 'classic', true)).toEqual({ kind: 'unscored', why: 'no_resume' })
    expect(await m.end('2048', 'classic', R)).toEqual({ kind: 'skipped' })

    t -= DAY
    m = mk(api)
    expect(await m.start('2048', 'hard', true)).toEqual({ kind: 'unscored', why: 'no_resume' })
    expect(await m.end('2048', 'hard', R)).toEqual({ kind: 'skipped' })

    user = B
    expect(await m.start('2048', 'classic', true)).toEqual({ kind: 'unscored', why: 'no_resume' })
    expect(await m.end('2048', 'classic', R)).toEqual({ kind: 'skipped' })
    expect(names(api)).not.toContain('finishRun')
  })

  it('signed out mid-game → end skipped, no server call', async () => {
    const api = createFakeApi()
    const m = mk(api)
    await m.start('2048', 'classic', false)
    user = null
    expect(await m.end('2048', 'classic', R)).toEqual({ kind: 'skipped' })
    expect(names(api)).not.toContain('finishRun')
  })

  it('signed in mid-game (start was guest) → end skipped', async () => {
    user = null
    const api = createFakeApi()
    const m = mk(api)
    await m.start('2048', 'classic', false)
    user = A
    expect(await m.end('2048', 'classic', R)).toEqual({ kind: 'skipped' })
    expect(names(api)).not.toContain('finishRun')
  })

  it('start overwrites an open run for the same game', async () => {
    const api = createFakeApi()
    const m = mk(api)
    await m.start('2048', 'classic', false)
    await m.start('2048', 'classic', false)
    await m.end('2048', 'classic', R)
    expect(api.calls.find((c) => c.method === 'finishRun')!.args[0]).toBe('run-2')
  })

  it('startRun failure → error status, end skipped', async () => {
    const api = createFakeApi()
    api.fail('startRun')
    const m = mk(api)
    expect(await m.start('2048', 'classic', false)).toEqual({ kind: 'unscored', why: 'error' })
    expect(await m.end('2048', 'classic', R)).toEqual({ kind: 'skipped' })
  })

  it('finishRun network failure → error, key kept', async () => {
    const api = createFakeApi()
    const m = mk(api)
    await m.start('2048', 'classic', false)
    api.fail('finishRun')
    expect(await m.end('2048', 'classic', R)).toEqual({ kind: 'error' })
    expect(storage.getItem(KEY)).not.toBeNull()
  })

  it('finishRun rejected → rejected, key cleared', async () => {
    const api = createFakeApi({ finish: { status: 'rejected', reason: 'too_fast', ranks: {} } })
    const m = mk(api)
    await m.start('2048', 'classic', false)
    expect((await m.end('2048', 'classic', R)).kind).toBe('rejected')
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('ending twice → second end skipped', async () => {
    const api = createFakeApi()
    const m = mk(api)
    await m.start('2048', 'classic', false)
    expect((await m.end('2048', 'classic', R)).kind).toBe('saved')
    expect(await m.end('2048', 'classic', R)).toEqual({ kind: 'skipped' })
    expect(names(api).filter((n) => n === 'finishRun')).toHaveLength(1)
  })

  it('ending twice concurrently sends one finishRun', async () => {
    const api = createFakeApi()
    const m = mk(api)
    await m.start('2048', 'classic', false)
    const [a, b] = await Promise.all([m.end('2048', 'classic', R), m.end('2048', 'classic', R)])
    expect([a.kind, b.kind].sort()).toEqual(['saved', 'skipped'])
  })
})
describe('createRunManager: chờ auth và tuần tự hóa', () => {
  const deferred = <T = void>() => {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)))
    return { promise, resolve, reject }
  }

  it('start gửi trước khi auth xong (resume) → scored, giữ khóa, end gọi finishRun', async () => {
    const api = createFakeApi()
    await mk(api).start('2048', 'classic', false)
    const gate = deferred()
    let current: AuthUser | null = null
    const m = createRunManager({ api, getUser: () => current, storage, now: () => t, whenAuthReady: () => gate.promise })
    const started = m.start('2048', 'classic', true)
    const ended = m.end('2048', 'classic', R)
    current = A
    gate.resolve()
    expect(await started).toEqual({ kind: 'scored' })
    expect((await ended).kind).toBe('saved')
    expect(api.calls.find((c) => c.method === 'finishRun')!.args[0]).toBe('run-1')
  })

  it('end trong lúc startRun đang chờ → kết thúc ván mới, không để khóa mồ côi', async () => {
    const api = createFakeApi()
    const d = deferred<string>()
    api.startRun = () => d.promise
    const m = mk(api)
    const s = m.start('2048', 'classic', false)
    const e = m.end('2048', 'classic', R)
    d.resolve('run-new')
    await s
    expect((await e).kind).toBe('saved')
    expect(api.calls.find((c) => c.method === 'finishRun')!.args[0]).toBe('run-new')
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('start trong lúc end đang lỗi chậm → khóa cuối cùng là ván mới', async () => {
    const api = createFakeApi()
    const m = mk(api)
    await m.start('2048', 'classic', false)
    const d = deferred<never>()
    api.finishRun = () => d.promise
    const e = m.end('2048', 'classic', R)
    const s = m.start('2048', 'classic', false)
    d.reject(new Error('net'))
    expect(await e).toEqual({ kind: 'error' })
    await s
    expect(JSON.parse(storage.getItem(KEY)!).runId).toBe('run-2')
  })

  it('finishRun trả not_open (đã chốt từ lần trước) → skipped, im lặng', async () => {
    const api = createFakeApi({ finish: { status: 'rejected', reason: 'not_open', ranks: {} } })
    const m = mk(api)
    await m.start('2048', 'classic', false)
    expect(await m.end('2048', 'classic', R)).toEqual({ kind: 'skipped' })
    expect(storage.getItem(KEY)).toBeNull()
  })
})