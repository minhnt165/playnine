import { useEffect, useState } from 'react'
import { useServer } from '../server/ServerProvider'
import type { GameEvent } from '../server/types'

export type EventsState =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; events: GameEvent[] }

/** Tải danh sách sự kiện một lần; không có server thì không gọi mạng. */
export function useEvents(): EventsState {
  const { api } = useServer()
  const [state, setState] = useState<EventsState>({ status: 'loading' })
  useEffect(() => {
    if (!api) return
    let alive = true
    setState({ status: 'loading' })
    api.events().then(
      (events) => alive && setState({ status: 'ready', events }),
      () => alive && setState({ status: 'error' }),
    )
    return () => {
      alive = false
    }
  }, [api])
  return api ? state : { status: 'unavailable' }
}
