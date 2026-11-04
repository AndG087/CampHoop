import { lazy, Suspense, type ReactNode } from 'react'
import { Link, Route, Routes } from 'react-router'
import { RequirePermission, RequireSession } from './auth/guards'
import { useSession } from './auth/session'
import AppShell from './layout/AppShell'
import CompetitionShell from './layout/CompetitionShell'
import AthletePage from './pages/AthletePage'
import AthletesPage from './pages/AthletesPage'
import HomePage from './pages/HomePage'
import CompetitionsPage from './pages/CompetitionsPage'
import CompetitionPage from './pages/CompetitionPage'
import LoginPage from './pages/LoginPage'
import LiveMatchPage from './pages/LiveMatchPage'
import TacticsPage from './pages/TacticsPage'
import PublicHomePage from './pages/PublicHomePage'
import SchedulePage from './pages/SchedulePage'
import TeamPage from './pages/TeamPage'
import TeamsPage from './pages/TeamsPage'
const AccountPage = lazy(() => import('./pages/AccountPage'))
const ClubsPage = lazy(() => import('./pages/ClubsPage'))
const ClubPage = lazy(() => import('./pages/ClubsPage').then((module) => ({ default: module.ClubPage })))
const InvitationsPage = lazy(() => import('./pages/InvitationsPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
import { RegisterPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage, InvitationPage } from './pages/AuthPages'

function LoadingPage({ children }: { children: ReactNode }) { return <Suspense fallback={<p className="muted" role="status">Carregando página…</p>}>{children}</Suspense> }

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
      <Route path="cadastro" element={<RegisterPage />} />
      <Route path="recuperar-senha" element={<ForgotPasswordPage />} />
      <Route path="redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="confirmar-email" element={<VerifyEmailPage />} />
      <Route path="convite" element={<InvitationPage />} />
      <Route element={<CompetitionShell />}>
        <Route path="campeonatos" element={<CompetitionsPage />} />
        <Route path="campeonatos/:competitionId" element={<CompetitionPage />} />
        <Route path="ao-vivo" element={<LiveMatchPage />} />
      </Route>
      <Route element={<RequireSession />}>
        <Route element={<AppShell />}>
          <Route path="times" element={<TeamsPage />} />
          <Route path="times/:teamId" element={<TeamPage />} />
          <Route path="agenda" element={<SchedulePage />} />
          <Route path="atletas" element={<AthletesPage />} />
          <Route path="atletas/:athleteId" element={<AthletePage />} />
          <Route path="conta" element={<LoadingPage><AccountPage /></LoadingPage>} />
          <Route path="clubes" element={<LoadingPage><ClubsPage /></LoadingPage>} />
          <Route path="clubes/:clubId" element={<LoadingPage><ClubPage /></LoadingPage>} />
          <Route path="convites" element={<LoadingPage><InvitationsPage /></LoadingPage>} />
          <Route path="notificacoes" element={<LoadingPage><NotificationsPage /></LoadingPage>} />
          <Route
            path="quadro-tatico"
            element={
              <RequirePermission permission="tactics.use">
                <TacticsPage />
              </RequirePermission>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}
