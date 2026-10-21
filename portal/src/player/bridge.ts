import { useEffect, useRef } from 'react'
import { isGameToPortal, PROTOCOL_VERSION, type GameToPortal, type PortalToGame } from '@playnine/sdk/protocol'

/** Nghe tin nhắn từ iframe game đang mở; chỉ nhận đúng origin, đúng cửa sổ, đúng gameId. */
export function useGameBridge(opts: {
  frame: HTMLIFrameElement | null
  gameId: string | null
  onMessage(m: GameToPortal): void
}): void {
  const { frame, gameId } = opts
  const handler = useRef(opts.onMessage)
  handler.current = opts.onMessage

  useEffect(() => {
    if (!frame || !gameId) return
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin) return
      const win = frame.contentWindow
      if (!win || e.source !== win) return
      const data: unknown = e.data
      if (!isGameToPortal(data) || data.gameId !== gameId) return
      if (data.type === 'pn:hello') {
        const ready: PortalToGame = { type: 'pn:ready', v: PROTOCOL_VERSION }
        try {
          win.postMessage(ready, location.origin)
        } catch {
          /* bỏ qua */
        }
        return
      }
      handler.current(data)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [frame, gameId])
}