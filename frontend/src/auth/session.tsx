import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { remoteApi, request, configureSeasons, type SourceMetadata } from '../api/client'
import { DEMO_USERS, ROLES, roleCan, type DemoUser, type Permission, type Role } from './roles'

const STORAGE_KEY = 'camphoop.demoRole'

type Session = {
  /** `null` = visitante, navegando sem login. */
  user: DemoUser | null
  can: (permission: Permission) => boolean
  /** Entra com uma conta de demonstração; devolve `false` se o e-mail não existir. */
  signIn: (email: string, password: string) => Promise<boolean>
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
  const [role, setRole] = useState<Role | null>(() => remoteApi ? null : readStoredRole())
  const [account, setAccount] = useState<DemoUser | null>(null)
  const [ready, setReady] = useState(!remoteApi)
  const [sessionError, setSessionError] = useState('')
  useEffect(() => {
    if (!remoteApi) return
    let active = true
    Promise.all([request<DemoUser | null>('/auth/me'), request<SourceMetadata>('/meta')]).then(([user, meta]) => { if (active) { configureSeasons(meta); setAccount(user); setReady(true) } }, (error: Error) => { if (active) setSessionError(error.message) })
    return () => { active = false }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (remoteApi) {
      try { setAccount(await request<DemoUser>('/auth/login', 'POST', { email, password })); return true }
      catch (error) { if (error instanceof Error && 'status' in error && error.status === 401) return false; throw error }
    }
    const account = Object.values(DEMO_USERS).find((u) => u.email === email.trim().toLowerCase())
    // Demonstração: qualquer senha preenchida é aceita.
    if (!account || !password) return false
    storeRole(account.role)
    setRole(account.role)
    return true
  }, [])

  const signOut = useCallback(() => {
    if (remoteApi) {
      void request('/auth/logout', 'POST').then(() => setAccount(null), (error: Error) => window.alert(error.message))
      return
    }
    storeRole(null)
    setRole(null)
  }, [])

  const value = useMemo<Session>(
    () => ({
      user: remoteApi ? account : role ? DEMO_USERS[role] : null,
      can: (permission) => { const r = remoteApi ? account?.role : role; return r ? roleCan(r, permission) : false },
      signIn,
      signOut,
    }),
    [role, account, signIn, signOut],
  )

  if (!ready) return <main className="page"><p role={sessionError ? 'alert' : 'status'}>{sessionError || 'Conectando ao CampHoop…'}</p>{sessionError && <button type="button" className="btn btn--accent" onClick={() => location.reload()}>Tentar novamente</button>}</main>
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession precisa estar dentro de <SessionProvider>')
  return session
}
