import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { ROLE_INFO, type Permission } from './roles'
import { useSession } from './session'

/** Exige um perfil escolhido; sem ele, manda para o login e volta depois. */
export function RequireSession() {
  const { user } = useSession()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** Bloqueia a página inteira para perfis sem a permissão. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { user, can } = useSession()
  if (can(permission)) return children
  return (
    <div className="page-head">
      <div className="eyebrow">ACESSO RESTRITO</div>
      <h1>Esta página não está disponível para você</h1>
      <p>
        O perfil {user ? ROLE_INFO[user.role].label : ''} não tem acesso a esta área.{' '}
        <Link to="/" style={{ fontWeight: 700 }}>Voltar ao início →</Link>
      </p>
    </div>
  )
}

/** Mostra o conteúdo só para perfis com a permissão (botões, ações). */
export function Can({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useSession()
  return can(permission) ? children : null
}
