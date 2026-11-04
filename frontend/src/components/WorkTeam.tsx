import { useState } from 'react'
import { Link } from 'react-router'
import { activateTeam, getManagementOptions } from '../api/management'
import { remoteApi, DATA_SEASON } from '../api/client'
import { useApi } from '../api/useApi'
import { useSession } from '../auth/session'
import '../pages/RosterDialogs.css'
import { TeamAccessDialog } from '../pages/TeamControls'

export default function WorkTeam() {
  const { user } = useSession()
  if (!remoteApi || user?.role !== 'tecnico') return null
  return <CoachWorkTeam />
}
function CoachWorkTeam() {
  const { user, refresh } = useSession()
  const { data, error } = useApi(getManagementOptions, `work-team:${user?.id}:${user?.teamId}:${DATA_SEASON}`)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [accessOpen, setAccessOpen] = useState(false)
  async function choose(id: string) {
    setBusy(true); setFeedback('')
    try { await activateTeam(id); await refresh() }
    catch (e) { setFeedback(e instanceof Error ? e.message : 'Não foi possível trocar de equipe.') }
    finally { setBusy(false) }
  }
  const teams = data?.teams.filter((t) => t.available || t.id === user?.teamId) ?? []
  const activeTeam = teams.find((t) => t.id === user?.teamId && t.available)
  return <div className="work-team"><label>Equipe de trabalho<select aria-label="Equipe de trabalho" disabled={busy || !data} value={user?.teamId ?? ''} onChange={(e) => void choose(e.target.value)}>{!teams.length && <option value="">Crie sua primeira equipe</option>}{teams.map((t) => <option key={t.id} value={t.id} disabled={!t.available}>{t.clubName} · {t.name}{t.imported ? ' · NCAA' : ''}{!t.available ? ' · Sem vínculo nesta temporada' : ''}</option>)}</select></label>{activeTeam && <Link className="link-button" to={`/atletas?equipe=${activeTeam.id}`}>Ver elenco →</Link>}<button type="button" className="link-button" disabled={!activeTeam} onClick={() => setAccessOpen(true)}>Acessos e autorizações</button><Link className="link-button" to="/times?nova=1">+ Criar equipe própria</Link>{(feedback || error) && <span role="alert">{feedback || error?.message}</span>}{activeTeam && accessOpen && <TeamAccessDialog id={activeTeam.id} onClose={() => setAccessOpen(false)} />}</div>
}
