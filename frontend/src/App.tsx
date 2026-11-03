import { Link, Route, Routes } from 'react-router'
import { RequirePermission, RequireSession } from './auth/guards'
import { useSession } from './auth/session'
import AppShell from './layout/AppShell'
import AthletePage from './pages/AthletePage'
import AthletesPage from './pages/AthletesPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import PlaceholderPage from './pages/PlaceholderPage'
import PublicHomePage from './pages/PublicHomePage'
import SchedulePage from './pages/SchedulePage'
import TeamPage from './pages/TeamPage'
import TeamsPage from './pages/TeamsPage'

function NotFound() {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">ERRO 404</div>
        <h1>Página não encontrada</h1>
        <p>
          Esse endereço não existe no CampHoop. <Link to="/" style={{ fontWeight: 700 }}>Voltar ao início →</Link>
        </p>
      </div>
    </div>
  )
}

/** "/" é a página pública para quem não entrou e o Início do sistema para quem entrou. */
function Home() {
  const { user } = useSession()
  if (!user) return <PublicHomePage />
  return (
    <AppShell>
      <HomePage />
    </AppShell>
  )
}

export default function App() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route element={<AppShell />}>
          <Route path="times" element={<TeamsPage />} />
          <Route path="times/:teamId" element={<TeamPage />} />
          <Route path="agenda" element={<SchedulePage />} />
          <Route path="campeonatos" element={<PlaceholderPage title="Campeonatos" subtitle="Inscrições, classificação e tabela de jogos." stage={7} issue={11} />} />
          <Route path="atletas" element={<AthletesPage />} />
          <Route path="atletas/:athleteId" element={<AthletePage />} />
          <Route path="ao-vivo" element={<PlaceholderPage title="Partida ao vivo" subtitle="Placar, ações em tempo real, box score e escalação." stage={8} issue={12} action={{ label: 'Registrar ação', permission: 'match.record' }} />} />
          <Route
            path="quadro-tatico"
            element={
              <RequirePermission permission="tactics.use">
                <PlaceholderPage title="Quadro tático" subtitle="Posicione jogadores e desenhe jogadas." stage={9} issue={13} />
              </RequirePermission>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}
