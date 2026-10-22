import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n/i18n'
import { ServerProvider } from './server/ServerProvider'
import './styles/portal.css'
import './styles/events.css'
import './styles/server.css'
import './styles/admin.css'
import './styles/gamemenu.css'
import './styles/favorites.css'
import './styles/history.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ServerProvider autoGuest>
        <App />
      </ServerProvider>
    </I18nProvider>
  </StrictMode>,
)