import { startTransition, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n/i18n'
import { ServerProvider } from './server/ServerProvider'
import './styles/portal.css'
import './styles/events.css'
import './styles/server.css'
import './styles/admin.css'
import './styles/favorites.css'
import './styles/history.css'

// Chờ một khung hình để màn chờ (logo) kịp vẽ trước khi React dựng trang chủ, máy yếu không thấy trang trắng;
// dựng trong transition để React chia nhỏ việc, không chặn luồng chính lâu trên điện thoại.
const root = createRoot(document.getElementById('root')!)
const start = () =>
  startTransition(() =>
    root.render(
      <StrictMode>
        <I18nProvider>
          <ServerProvider autoGuest>
            <App />
          </ServerProvider>
        </I18nProvider>
      </StrictMode>,
    ),
  )
requestAnimationFrame(() => setTimeout(start))