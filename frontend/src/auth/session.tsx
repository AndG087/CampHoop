import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { DEMO_USERS, ROLES, roleCan, type DemoUser, type Permission, type Role } from './roles'

const STORAGE_KEY = 'camphoop.demoRole'

type Session = {
  /** `null` = visitante, navegando sem login. */
  user: DemoUser | null
  can: (permission: Permission) => boolean
  /** Entra com uma conta de demonstração; devolve `false` se o e-mail não existir. */
  signIn: (email: string, password: string) => boolean
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

function readStoredRole(): Role | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return ROLES.includes(value as Role) ? (value as Role) : null
  } catch {
    return null
  }
}

function storeRole(role: Role | null) {
  try {
    if (role) localStorage.setItem(STORAGE_KEY, role)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sem armazenamento (janela anônima, por exemplo): a sessão vale só até recarregar.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(readStoredRole)

  const signIn = useCallback((email: string, password: string) => {
    const account = Object.values(DEMO_USERS).find((u) => u.email === email.trim().toLowerCase())
    // Demonstração: qualquer senha preenchida é aceita.
    if (!account || !password) return false
    storeRole(account.role)
    setRole(account.role)
    return true
  }, [])

  const signOut = useCallback(() => {
    storeRole(null)
    setRole(null)
  }, [])

  const value = useMemo<Session>(
    () => ({
      user: role ? DEMO_USERS[role] : null,
      can: (permission) => (role ? roleCan(role, permission) : false),
      signIn,
      signOut,
    }),
    [role, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession precisa estar dentro de <SessionProvider>')
  return session
}
