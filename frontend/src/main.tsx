import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
// Estilos globais primeiro: o CSS de cada página vem depois e pode ajustá-los.
import './styles/tokens.css'
import './styles/global.css'
import App from './App'
import { SessionProvider, useSession } from './auth/session'
import { useSeason } from './api/useSeason'

function SeasonApp() {
  const season = useSeason()
  const { user } = useSession()
  return <App key={`${season}:${user?.id ?? 'visitor'}`} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <BrowserRouter>
        <SeasonApp />
      </BrowserRouter>
    </SessionProvider>
  </StrictMode>,
)
