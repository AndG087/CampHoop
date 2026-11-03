import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
// Estilos globais primeiro: o CSS de cada página vem depois e pode ajustá-los.
import './styles/tokens.css'
import './styles/global.css'
import App from './App'
import { SessionProvider } from './auth/session'
import { useSeason } from './api/useSeason'

function SeasonApp() {
  const season = useSeason()
  return <App key={season} />
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
