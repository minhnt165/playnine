import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n/i18n'
import { ServerProvider } from './server/ServerProvider'
import './styles/portal.css'
import './styles/events.css'
import './styles/server.css'
import './styles/admin.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ServerProvider>
        <App />
      </ServerProvider>
    </I18nProvider>
  </StrictMode>,
)