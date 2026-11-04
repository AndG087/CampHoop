import { DATA_SEASON } from '../api/client'
import DataSource from '../components/DataSource'
import SeasonSelector from '../components/SeasonSelector'
import WorkTeam from '../components/WorkTeam'
import NotificationBell from '../components/NotificationBell'
import { startTransition, useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { ROLE_INFO } from '../auth/roles'
import { useSession } from '../auth/session'
import { NAV_ITEMS, activeNavItem } from '../navigation'
import './AppShell.css'

export function Brand() {
  return (
    <div className="brand">
      <span className="brand__ball" aria-hidden="true" />
      <span>
        CampHoop
        <small>GAME ON. GROW TOGETHER.</small>
      </span>
    </div>
  )
}

/** Estrutura do sistema para quem entrou. Visitantes ficam na página pública. */
export default function AppShell({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation()
  const { user, can, signOut } = useSession()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const current = activeNavItem(pathname)
  const navItems = NAV_ITEMS.filter((item) => !item.permission || can(item.permission))
  const mobileItems = navItems.filter((item) => item.mobile)
  const moreItems = navItems.filter((item) => !item.mobile)
  const moreActive = moreItems.some((item) => item === current)

  useEffect(() => setMoreOpen(false), [pathname])

  if (!user) return null

  function leave() {
    // Sair e ir para a página pública no mesmo render; separado, o bloqueio
    // das páginas internas veria a sessão vazia antes e mandaria para o login.
    startTransition(() => {
      signOut()
      navigate('/')
    })
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar__label">MENU PRINCIPAL</div>
        <nav className="sidebar__nav" aria-label="Menu principal">
          {navItems.map((item) => (
            <NavLink key={item.path} to={item.path} end={item.path === '/'} className="sidebar__link">
              <span className="sidebar__icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__bottom">
          <div className="season">
            <span>BASE DE DADOS</span>
            <strong>{DATA_SEASON}</strong>
            <SeasonSelector />
          </div>
          <div className="user">
            <div className="avatar" aria-hidden="true">{user.initials}</div>
            <div className="user__info">
              {user.name}
              <small>{user.context}</small>
              <button type="button" className="user__switch" onClick={leave}>Sair</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">
            CampHoop <span className="crumb__sep">/</span> <b>{current?.label ?? 'Página não encontrada'}</b>
          </div>
          <div className="topbar__actions">
            <SeasonSelector />
            <input className="search" type="search" placeholder="⌕  Buscar time, atleta..." aria-label="Buscar time ou atleta" />
            <NotificationBell />
            <span className="role-pill" title={`${(user.isDemo ?? true) ? 'Conta de teste' : 'Conta'}: ${user.name}`}>
              {(user.isDemo ?? true) && <span className="role-pill__demo">TESTE</span>}
              {ROLE_INFO[user.role].label}
            </span>
          </div>
        </header>
        <section className="content"><WorkTeam />{children ?? <Outlet />}<DataSource /></section>
      </main>

      {moreOpen && (
        <div className="more-sheet" role="dialog" aria-label="Mais páginas">
          {moreItems.map((item) => (
            <NavLink key={item.path} to={item.path} className="more-sheet__link">
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          <button type="button" className="more-sheet__link" onClick={leave}>
            <span aria-hidden="true">⇥</span>
            Sair · {user.name}
          </button>
        </div>
      )}

      <nav className="mobile-nav" aria-label="Menu principal">
        {mobileItems.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.path === '/'} className="mobile-nav__link">
            <span aria-hidden="true">{item.icon}</span>
            {item.mobileLabel ?? item.label}
          </NavLink>
        ))}
        <button
          type="button"
          className={`mobile-nav__link${moreActive || moreOpen ? ' active' : ''}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span aria-hidden="true">⋯</span>
          Mais
        </button>
      </nav>
    </div>
  )
}
