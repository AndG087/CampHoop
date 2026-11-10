import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { getAthleteAccount, inviteMember, revokeInvitation, type AthleteAccount } from '../api/accounts'
import type { AthleteProfile } from '../api/types'
import { useApi } from '../api/useApi'
import Modal from '../components/Modal'
import './AccountPages.css'

export default function AthleteAccountDialog({ athlete, onClose, onInvited }: { athlete: AthleteProfile; onClose: () => void; onInvited: (email: string) => void }) {
  const clubId = athlete.team.club.id
  const query = useApi(() => getAthleteAccount(clubId, athlete.id), `athlete-account:${athlete.id}`)
  return <Modal title="Vincular conta ao atleta" onClose={onClose}>
    {!query.data ? <p className="roster-form-state" role={query.error ? 'alert' : 'status'}>{query.error?.message ?? 'Conferindo o vínculo…'}</p> : <AccountEditor key={`${athlete.id}:${query.data.pendingInvitation?.id ?? 'new'}`} athlete={athlete} account={query.data} onClose={onClose} onInvited={onInvited} />}
  </Modal>
}

function AccountEditor({ athlete, account, onClose, onInvited }: { athlete: AthleteProfile; account: AthleteAccount; onClose: () => void; onInvited: (email: string) => void }) {
  const clubId = athlete.team.club.id
  const [email, setEmail] = useState(account.linkedAccount?.email ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { const saved = await inviteMember(clubId, { email, role: 'atleta', teamId: athlete.team.id, athleteId: athlete.id }); onInvited(saved.email) }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível enviar o convite.'); setBusy(false) }
  }
  async function revoke() {
    if (!account.pendingInvitation) return
    setBusy(true); setError('')
    try { await revokeInvitation(clubId, account.pendingInvitation.id) }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível revogar o convite.') }
    finally { setBusy(false) }
  }
  const linked = account.linkedAccount
  const pending = account.pendingInvitation
  return <form className="roster-form account-form" onSubmit={submit}>
    <div className="account-note"><strong>{athlete.name}</strong><p>{athlete.team.name} · {athlete.season}</p></div>
    {linked?.isMember ? <><p role="status">Este atleta já tem uma conta vinculada.</p><p><strong>{linked.name}</strong><br />{linked.email}</p><Link to={`/clubes/${clubId}`} onClick={onClose}>Gerenciar o vínculo no clube →</Link></> : pending ? <><p>Há um convite pendente para <strong>{pending.email}</strong>, válido até {new Date(pending.expiresAt).toLocaleDateString('pt-BR')}.</p><p>A pessoa deve entrar com esse e-mail, confirmá-lo e aceitar o convite no sininho de notificações, na aba <strong>Convites</strong>.</p><button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void revoke()}>{busy ? 'Revogando…' : 'Revogar convite'}</button></> : <>
      <p>Informe o e-mail da conta que pertence a este atleta. Se a pessoa já tem cadastro, ela aceita no sininho de notificações, na aba <strong>Convites</strong>. Caso ainda não tenha, poderá criar a conta com esse e-mail.</p>
      {linked && <p className="account-note">O histórico deste atleta pertence a {linked.email}. Você pode convidar essa mesma conta novamente para o clube.</p>}
      <label>E-mail do atleta<input type="email" required maxLength={254} value={email} disabled={busy} readOnly={!!linked} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
      <p className="muted">O perfil será de atleta, vinculado a este cadastro e equipe. O acesso só é liberado após a pessoa confirmar o e-mail e aceitar o convite.</p>
      <div className="roster-form-actions"><button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn btn--accent" disabled={busy}>{busy ? 'Enviando…' : 'Enviar convite de atleta'}</button></div>
    </>}
    {error && <p role="alert" className="account-error">{error}</p>}
  </form>
}
