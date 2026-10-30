import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { ROLE_INFO, type Permission } from './roles'
import { useSession } from './session'

/** Páginas do sistema exigem login; visitante vai para o login e volta depois. */
export function RequireSession() {
  const { user } = useSession()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

/**
 * Bloqueia a página inteira para quem não tem a permissão.
 * Visitante vai para o login e volta depois de entrar.
 */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { user, can } = useSession()
  const location = useLocation()
  if (can(permission)) return children
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">ACESSO RESTRITO</div>
        <h1>Esta página não está disponível para você</h1>
        <p>
          O perfil {ROLE_INFO[user.role].label} não tem acesso a esta área.{' '}
          <Link to="/" style={{ fontWeight: 700 }}>Voltar ao início →</Link>
        </p>
      </div>
    </div>
  )
}

/** Mostra o conteúdo só para perfis com a permissão (botões, ações). */
export function Can({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useSession()
  return can(permission) ? children : null
}
