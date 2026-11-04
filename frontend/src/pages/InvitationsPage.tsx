import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { acceptInvitation, listInvitations } from '../api/accounts'
import { useApi } from '../api/useApi'
import { useSession } from '../auth/session'
import { ROLE_INFO } from '../auth/roles'
import './AccountPages.css'

export default function InvitationsPage() {
  const { user, refresh } = useSession()
  const navigate = useNavigate()
  const ready = !!user?.emailVerified && !user?.isDemo
  const query = useApi(() => ready ? listInvitations() : Promise.resolve([]), `invitations:${user?.id}:${ready}`)
  const [busy, setBusy] = useState(''); const [error, setError] = useState('')
  async function accept(id: string) { setBusy(id); setError(''); try { const result = await acceptInvitation({ invitationId: id }); await refresh(); navigate('/clubes/' + result.clubId) } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível aceitar.') } finally { setBusy('') } }
  return <><div className="page-head"><div><div className="eyebrow">UMA NOVA CONEXÃO</div><h1>Convites</h1><p>Convites enviados para {user?.email}.</p></div><Link className="btn btn--ghost" to="/clubes">Meus clubes</Link></div>{!ready && <p className="account-note">Use uma conta real com e-mail confirmado. <Link to="/conta">Minha conta →</Link></p>}{error && <p className="account-error" role="alert">{error}</p>}{query.loading && <p role="status">Carregando convites…</p>}{query.error && <p className="account-error" role="alert">{query.error.message}</p>}<div className="club-grid">{query.data?.map((i) => <article className="card club-card" key={i.id}><span className="pill">CONVITE PARA VOCÊ</span><h2>{i.club}</h2><p>{ROLE_INFO[i.role].label} · até {new Date(i.expiresAt).toLocaleDateString('pt-BR')}</p><button className="btn btn--accent" disabled={!!busy} onClick={() => void accept(i.id)}>{busy === i.id ? 'Aceitando…' : 'Aceitar convite'}</button></article>)}</div>{ready && query.data?.length === 0 && <p className="account-note">Você não tem convites pendentes. Peça ao responsável pelo clube para convidar este e-mail.</p>}</>
}
