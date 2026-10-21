import { PlayNine } from './sdk'

declare global {
  interface Window {
    PlayNine: typeof PlayNine
  }
}

window.PlayNine = PlayNine