import { Link, Outlet } from 'react-router'
import { useSession } from '../auth/session'
import AppShell, { Brand } from './AppShell'
import '../pages/PublicHomePage.css'

/** Campeonatos podem ser acompanhados também por visitantes. */
export default function CompetitionShell() {
  const { user } = useSession()
  if (user) return <AppShell />
  return (
    <div className="public">
      <header className="public__bar"><div className="public__inner public__bar-inner"><Link to="/" aria-label="CampHoop, início"><Brand /></Link><Link to="/login" className="btn btn--accent">Login</Link></div></header>
      <main className="public__inner public__main"><Outlet /></main>
      <footer className="public__inner public__foot">CampHoop · Basquete de base · Demonstração 2025/26</footer>
    </div>
  )
}
