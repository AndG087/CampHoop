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

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
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
          <button type="button" className="season">
            <span>TEMPORADA ATUAL</span>
            <strong>2025 / 2026 ⌄</strong>
          </button>
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
            <input className="search" type="search" placeholder="⌕  Buscar time, atleta..." aria-label="Buscar time ou atleta" />
            <button type="button" className="notif" aria-label="Notificações">
              <BellIcon />
            </button>
            <span className="role-pill" title={`Conta de demonstração: ${user.name}`}>
              <span className="role-pill__demo">DEMO</span>
              {ROLE_INFO[user.role].label}
            </span>
          </div>
        </header>
        <section className="content">{children ?? <Outlet />}</section>
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
