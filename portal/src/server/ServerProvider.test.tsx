import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeApi } from './fakeApi'
import { ServerProvider, useServer } from './ServerProvider'

const A = { id: 'u-a', displayName: 'Alice', avatarUrl: null }

let last: ReturnType<typeof useServer> | null = null
function Probe() {
  last = useServer()
  return null
}
const renderWith = (api: Parameters<typeof ServerProvider>[0]['api']) =>
  render(
    <ServerProvider api={api}>
      <Probe />
    </ServerProvider>,
  )

afterEach(() => {
  cleanup()
  last = null
  vi.unstubAllGlobals()
})

describe('ServerProvider', () => {
  it('api = null: không có server, authReady true, không gọi mạng', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    renderWith(null)
    expect(last).toMatchObject({ api: null, user: null, authReady: true, games: {} })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('có api: tải user và metadata game', async () => {
    const api = createFakeApi({ user: A })
    renderWith(api)
    await waitFor(() => expect(last!.authReady).toBe(true))
    expect(last!.user).toEqual(A)
    await waitFor(() => expect(Object.keys(last!.games).length).toBeGreaterThan(0))
    expect(last!.games['sugoku'].metric).toBeDefined()
  })

  it('onAuthChange phát null thì user về null', async () => {
    const api = createFakeApi({ user: A })
    renderWith(api)
    await waitFor(() => expect(last!.user).toEqual(A))
    await act(async () => {
      await api.signOut()
    })
    expect(last!.user).toBeNull()
  })

  it('gameMeta lỗi: games = {} và không ném', async () => {
    const api = createFakeApi({ user: A })
    api.fail('gameMeta')
    renderWith(api)
    await waitFor(() => expect(last!.authReady).toBe(true))
    expect(last!.games).toEqual({})
    expect(last!.user).toEqual(A)
  })
})
