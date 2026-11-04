import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import Modal from '../components/Modal'
import { DATA_SEASON } from '../api/client'
import { getTeamAccess, grantCoachAccess, revokeCoachAccess, authorizeTeam, revokeAuthorization, deleteRosterRecord } from '../api/management'
import { listTeams } from '../api/athletes'
import { listCompetitions } from '../api/public'
import { useApi } from '../api/useApi'
import { useSession } from '../auth/session'
import './RosterDialogs.css'

const message = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir a operação.'

export function TeamAccessDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { user, refresh } = useSession()
  const navigate = useNavigate()
  const query = useApi(() => Promise.all([getTeamAccess(id), listTeams(), listCompetitions()]), `team-access:${id}`)
  const [email, setEmail] = useState('')
  const [kind, setKind] = useState<'friendly' | 'enroll'>('friendly')
  const [opponent, setOpponent] = useState('')
  const [date, setDate] = useState('')
  const [competition, setCompetition] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await action(); await refresh() }
    catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }
  const access = query.data?.[0]
  const currentTeam = query.data?.[1].find((t) => t.id === id)
  const opponents = query.data?.[1].filter((t) => t.id !== id && t.category === currentTeam?.category && t.gender === currentTeam?.gender) ?? []
  const competitions = query.data?.[2].filter((c) => c.status === 'inscricoes') ?? []
  function authorize(e: FormEvent) {
    e.preventDefault()
    void run(() => authorizeTeam(id, { season: DATA_SEASON, kind, ...(kind === 'friendly' ? { opponentId: opponent, date } : { competitionId: competition }) }))
  }
  return <Modal title="Acessos e autorizações" onClose={() => { if (!busy) onClose() }}>
    <div className="roster-form">
      <p className="roster-form-intro">Trocar de equipe de trabalho mantém seus vínculos autorizados. Você pode encerrar um vínculo ou, como dono, revogar os acessos concedidos.</p>
      {query.error && <p role="alert">{query.error.message}</p>}
      {!access && !query.error && <p role="status">Carregando autorizações…</p>}
      {access?.owner && <>
        <h3>Técnicos com acesso</h3>
        <ul className="roster-control-list" aria-label="Técnicos autorizados">{access.coaches.map((c) => <li key={c.id}><span>{c.name}<small>{c.email}{c.owner ? ' · Proprietário' : ''}</small></span>{!c.owner && <button className="btn btn--ghost" disabled={busy} onClick={() => void run(() => revokeCoachAccess(id, c.id))}>Revogar acesso de {c.name}</button>}</li>)}</ul>
        <form onSubmit={(e) => { e.preventDefault(); void run(() => grantCoachAccess(id, email)) }}>
          <fieldset disabled={busy}><label>E-mail do técnico<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><p className="roster-form-hint">O acesso permite ver dados privados do elenco e gerenciar treinos e jogadas. A edição dos cadastros permanece com o proprietário.</p><button className="btn btn--ghost">Conceder acesso</button></fieldset>
        </form>
        <h3>Autorizar participação · {DATA_SEASON}</h3>
        <p className="roster-form-hint">Amistosos só poderão ser agendados pelo técnico do adversário, na data autorizada. Inscrições são liberadas apenas para o campeonato escolhido.</p>
        <form onSubmit={authorize}><fieldset disabled={busy}>
          <label>Tipo de autorização<select aria-label="Tipo de autorização" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="friendly">Amistoso</option><option value="enroll">Inscrição em campeonato</option></select></label>
          {kind === 'friendly' ? <><label>Adversário<select aria-label="Adversário" required value={opponent} onChange={(e) => setOpponent(e.target.value)}><option value="">Selecionar equipe…</option>{opponents.map((t) => <option key={t.id} value={t.id}>{t.club.name} · {t.name}</option>)}</select></label><label>Data do amistoso<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label></> : <label>Campeonato<select aria-label="Campeonato autorizado" required value={competition} onChange={(e) => setCompetition(e.target.value)}><option value="">Selecionar campeonato…</option>{competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
          <button className="btn btn--accent">Autorizar participação</button>
        </fieldset></form>
        <ul className="roster-control-list" aria-label="Autorizações concedidas">{access.authorizations.map((a) => <li key={a.id}><span>{a.label}<small>{a.season}</small></span><button className="btn btn--ghost" disabled={busy} onClick={() => void run(() => revokeAuthorization(id, a.id))}>Revogar autorização</button></li>)}</ul>
        <p className="roster-form-hint">Revogar uma autorização impede novas operações. Jogos e inscrições já aceitos preservam seu histórico.</p>
      </>}
      {access && !access.owner && <>
        <p>Encerrar seu acesso remove a equipe da sua área de trabalho e bloqueia dados privados, treinos e jogadas dessa equipe.</p>
        {!leaving ? <button className="btn btn--ghost" onClick={() => setLeaving(true)}>Encerrar meu acesso</button> : <button className="btn btn--accent" disabled={busy} onClick={() => void run(async () => { await revokeCoachAccess(id, user!.id); onClose(); navigate('/') })}>Confirmar encerramento do acesso</button>}
      </>}
      {error && <p role="alert" className="roster-form-error">{error}</p>}
      <button className="btn btn--ghost" disabled={busy} onClick={onClose}>Fechar</button>
    </div>
  </Modal>
}

export function DeleteRosterDialog({ kind, id, season, revision, name, onClose }: { kind: 'athlete' | 'team' | 'season'; id: string; season: string; revision: number; name: string; onClose: () => void }) {
  const { refresh } = useSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function remove() {
    setBusy(true); setError('')
    try { await deleteRosterRecord(kind, id, season, revision); await refresh(); onClose(); navigate(kind === 'athlete' ? '/atletas' : '/times') }
    catch (e) { setError(message(e)); setBusy(false) }
  }
  return <Modal title="Excluir cadastro sem histórico" onClose={() => { if (!busy) onClose() }}><div className="roster-form"><p>Excluir {name} ({season})?</p><p className="roster-form-hint">A exclusão é definitiva. Cadastros com registros de jogo, contas associadas ou outros vínculos em uso são protegidos. Para excluir uma equipe ou temporada, remova primeiro seus cadastros vazios.</p>{error && <p className="roster-form-error" role="alert">{error}</p>}<div className="roster-form-actions"><button className="btn btn--ghost" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn btn--accent" disabled={busy} onClick={() => void remove()}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button></div></div></Modal>
}
