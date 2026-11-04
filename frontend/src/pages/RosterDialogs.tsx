import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { CURRENT_DATE, DATA_SEASON, selectSeason } from '../api/client'
import { createAthlete, createTeam, createTeamSeason, editAthlete, editTeam, getAthleteEdit, getManagementOptions, linkAthlete, type AthleteEdit, type AthleteFields, type ManagementOptions, type TeamFields } from '../api/management'
import type { Category, Gender, TeamProfile } from '../api/types'
import { useApi } from '../api/useApi'
import { useSession } from '../auth/session'
import Modal from '../components/Modal'
import './RosterDialogs.css'

const CATEGORIES: Category[] = ['Sub-13', 'Sub-15', 'Sub-17', 'Universitário']
const GENDERS: Gender[] = ['Feminino', 'Masculino', 'Misto']
const message = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.'
function TeamFieldsForm({ value, onChange }: { value: TeamFields; onChange: (fields: TeamFields) => void }) {
  return <><label>Nome da equipe<input autoFocus required minLength={2} maxLength={100} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Ex.: CampHoop Sub-17" /></label><div className="roster-form-row"><label>Categoria<select value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value as Category })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label><label>Gênero<select value={value.gender} onChange={(e) => onChange({ ...value, gender: e.target.value as Gender })}>{GENDERS.map((g) => <option key={g}>{g}</option>)}</select></label></div><label>Responsável técnico<input required minLength={2} maxLength={120} value={value.coach} onChange={(e) => onChange({ ...value, coach: e.target.value })} /></label><p className="roster-form-hint">O responsável aparece no perfil da equipe. A gestão permanece com sua conta.</p></>
}

export function TeamDialog({ team, onClose }: { team?: TeamProfile; onClose: () => void }) {
  const options = useApi(getManagementOptions, 'management:team-options')
  if (!options.data) return <Modal title={team ? 'Editar equipe' : 'Criar equipe própria'} onClose={onClose}><p className="roster-form-state" role={options.error ? 'alert' : 'status'}>{options.error?.message ?? 'Carregando seus clubes…'}</p></Modal>
  return <TeamEditor options={options.data} team={team} onClose={onClose} />
}
function TeamEditor({ options, team, onClose }: { options: ManagementOptions; team?: TeamProfile; onClose: () => void }) {
  const { user, refresh } = useSession()
  const navigate = useNavigate()
  const [fields, setFields] = useState<TeamFields>({ name: team?.team.name ?? '', category: team?.team.category ?? 'Sub-17', gender: team?.team.gender ?? 'Feminino', coach: team?.coach ?? user?.name ?? '' })
  const [clubId, setClubId] = useState(options.clubs[0]?.id ?? 'new')
  const [club, setClub] = useState({ name: '', shortName: '', city: '' })
  const [season, setSeason] = useState(DATA_SEASON)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const saved = team ? await editTeam(team, fields) : await createTeam({ ...fields, season, ...(clubId === 'new' ? { club } : { clubId }) })
      await refresh(); selectSeason(saved.season); onClose(); navigate(`/times/${saved.id}`)
    } catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }
  return <Modal title={team ? 'Editar equipe' : 'Criar equipe própria'} onClose={() => { if (!busy) onClose() }}><form className="roster-form" onSubmit={submit}><p className="roster-form-intro">{team ? 'Atualize os dados da equipe nesta temporada.' : 'Comece pelo clube e pela equipe. Depois, cadastre seu elenco.'}</p><fieldset disabled={busy}>{!team && <><label>Clube<select aria-label="Clube" value={clubId} onChange={(e) => setClubId(e.target.value)}>{options.clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="new">+ Cadastrar novo clube</option></select></label>{clubId === 'new' && <div className="roster-club-fields"><label>Nome do clube<input required minLength={2} maxLength={150} value={club.name} onChange={(e) => setClub({ ...club, name: e.target.value })} /></label><div className="roster-form-row"><label>Sigla<input required maxLength={12} value={club.shortName} onChange={(e) => setClub({ ...club, shortName: e.target.value })} placeholder="Ex.: CH" /></label><label>Cidade<input required minLength={2} maxLength={100} value={club.city} onChange={(e) => setClub({ ...club, city: e.target.value })} /></label></div></div>}</>}<TeamFieldsForm value={fields} onChange={setFields} /><label>Temporada<input required pattern="20[0-9]{2}/[0-9]{2}" maxLength={7} value={season} readOnly={!!team} onChange={(e) => setSeason(e.target.value)} placeholder="2026/27" /></label>{!team && <p className="roster-form-hint">Use anos consecutivos. A nova equipe será sua equipe de trabalho.</p>}</fieldset>{error && <p className="roster-form-error" role="alert">{error}</p>}<div className="roster-form-actions"><button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn btn--accent" disabled={busy}>{busy ? 'Salvando…' : team ? 'Salvar equipe' : 'Criar equipe'}</button></div></form></Modal>
}

export function TeamSeasonDialog({ team, onClose }: { team: TeamProfile; onClose: () => void }) {
  const { refresh } = useSession(); const navigate = useNavigate()
  const [fields, setFields] = useState<TeamFields>({ name: team.team.name, category: team.team.category, gender: team.team.gender, coach: team.coach })
  const next = Number(DATA_SEASON.slice(0, 4)) + 1
  const [target, setTarget] = useState(`${next}/${String((next + 1) % 100).padStart(2, '0')}`)
  const [copy, setCopy] = useState(true)
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const saved = await createTeamSeason(team.team.id, { ...fields, sourceSeason: DATA_SEASON, targetSeason: target, copyRoster: copy })
      await refresh(); selectSeason(saved.season); onClose(); navigate(`/times/${saved.id}`, { state: { rosterCopyNotice: `${saved.copiedAthletes} atletas copiados. ${saved.skippedAthletes.length ? `Já vinculados e preservados: ${saved.skippedAthletes.map((a) => a.name).join(', ')}.` : ''}` } })
    } catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }
  return <Modal title="Preparar nova temporada" onClose={() => { if (!busy) onClose() }}><form className="roster-form" onSubmit={submit}><p className="roster-form-intro">O elenco de {DATA_SEASON} e suas estatísticas serão preservados. Os novos vínculos começam sem jogos registrados.</p><fieldset disabled={busy}><label>Nova temporada<input required pattern="20[0-9]{2}/[0-9]{2}" maxLength={7} value={target} onChange={(e) => setTarget(e.target.value)} /></label><TeamFieldsForm value={fields} onChange={setFields} /><label className="roster-check"><input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> Copiar os {team.roster.length} atletas do elenco atual</label><p className="roster-form-hint">Você poderá atualizar números, posições e dados dos atletas na nova temporada.</p></fieldset>{error && <p className="roster-form-error" role="alert">{error}</p>}<div className="roster-form-actions"><button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn btn--accent" disabled={busy}>{busy ? 'Preparando…' : 'Criar temporada'}</button></div></form></Modal>
}

export function AthleteDialog({ id, teamId, onClose }: { id?: string; teamId?: string; onClose: () => void }) {
  const record = useApi(() => id ? getAthleteEdit(id) : Promise.resolve(null), `management:edit:${id ?? 'new'}`)
  const options = useApi(() => getManagementOptions(record.data?.season ?? DATA_SEASON), `management:athlete-options:${record.data?.season ?? DATA_SEASON}`)
  if (!options.data || (id && (!record.data || options.data.season !== record.data.season))) return <Modal title={id ? 'Editar atleta' : 'Adicionar atleta'} onClose={onClose}><p className="roster-form-state" role={options.error || record.error ? 'alert' : 'status'}>{options.error?.message ?? record.error?.message ?? 'Carregando elenco…'}</p></Modal>
  return <AthleteEditor options={options.data} record={record.data ?? undefined} teamId={teamId} onClose={onClose} />
}
function AthleteEditor({ options, record, teamId, onClose }: { options: ManagementOptions; record?: AthleteEdit; teamId?: string; onClose: () => void }) {
  const { user, refresh } = useSession(); const navigate = useNavigate()
  const teams = options.teams.filter((t) => t.editable && t.available)
  const [mode, setMode] = useState<'new' | 'link'>('new')
  const [fields, setFields] = useState<AthleteFields>(() => record ? { teamId: record.teamId, name: record.name, number: record.number, position: record.position, birthDate: record.birthDate, heightCm: record.heightCm, memberSince: record.memberSince, photoUrl: record.photoUrl, status: record.status } : { teamId: teams.find((t) => t.id === teamId)?.id ?? teams.find((t) => t.id === user?.teamId)?.id ?? teams[0]?.id ?? '', name: '', number: null, position: '', birthDate: null, heightCm: null, memberSince: null, photoUrl: null, status: 'ativo' })
  const [originId, setOriginId] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const candidates = options.athletes.filter((a) => a.season !== (record?.season ?? DATA_SEASON))
  if (!teams.length) return <Modal title="Adicionar atleta" onClose={onClose}><div className="roster-form"><p>Crie uma equipe própria nesta temporada antes de cadastrar seu elenco.</p><p className="roster-form-hint">O cadastro de atletas está disponível nas equipes que você gerencia.</p><Link className="btn btn--accent" to="/times?nova=1" onClick={onClose}>Criar equipe própria</Link></div></Modal>
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const saved = record ? await editAthlete(record.id, { ...fields, revision: record.revision }) : mode === 'link' ? await linkAthlete({ athleteId: originId, teamId: fields.teamId, season: DATA_SEASON, number: fields.number, position: fields.position }) : await createAthlete({ ...fields, season: DATA_SEASON })
      await refresh(); selectSeason(saved.season); onClose(); navigate(`/atletas/${saved.id}`)
    } catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }
  return <Modal title={record ? 'Editar atleta' : 'Adicionar atleta'} onClose={() => { if (!busy) onClose() }}><form className="roster-form" onSubmit={submit}>{record?.identityLocked && <p className="roster-form-hint" role="status">Nome, camisa, posição e equipe estão preservados pelos registros de jogo. Para mudá-los, crie um vínculo em outra temporada.</p>}<p className="roster-form-intro">Cadastro próprio · Temporada {record?.season ?? DATA_SEASON}</p>{!record && <div className="roster-mode" role="group" aria-label="Tipo de cadastro"><button type="button" aria-pressed={mode === 'new'} onClick={() => { setMode('new'); setError('') }}>Novo atleta</button><button type="button" aria-pressed={mode === 'link'} onClick={() => { setMode('link'); setError('') }}>Vincular existente</button></div>}<fieldset disabled={busy}><label>Equipe do elenco<select aria-label="Equipe do elenco" disabled={!!record?.identityLocked} required value={fields.teamId} onChange={(e) => setFields({ ...fields, teamId: e.target.value })}>{teams.map((t) => <option key={t.id} value={t.id}>{t.clubName} · {t.name}</option>)}</select></label>{mode === 'link' && !record ? <><label>Atleta de outra temporada<select required value={originId} onChange={(e) => { setOriginId(e.target.value); const a = candidates.find((a) => a.id === e.target.value); if (a) setFields({ ...fields, number: a.number, position: a.position }) }}><option value="">Selecionar cadastro próprio…</option>{candidates.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.season}</option>)}</select></label><p className="roster-form-hint">O vínculo anterior e seus jogos permanecem intactos. Cada atleta pode ter um vínculo por temporada.</p>{!candidates.length && <p className="roster-form-hint">Ainda não há cadastros próprios de outras temporadas. Use Novo atleta para começar.</p>}</> : <label>Nome completo<input autoFocus required minLength={2} maxLength={150} readOnly={!!record?.identityLocked} value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} /></label>}<div className="roster-form-row"><label>Número da camisa<input type="number" min={0} max={99} readOnly={!!record?.identityLocked} value={fields.number ?? ''} onChange={(e) => setFields({ ...fields, number: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Opcional" /></label><label>Posição<input required minLength={2} maxLength={80} readOnly={!!record?.identityLocked} value={fields.position} onChange={(e) => setFields({ ...fields, position: e.target.value })} placeholder="Ex.: Armadora" list="roster-positions" /><datalist id="roster-positions">{['Armador(a)', 'Ala-armador(a)', 'Ala', 'Ala-pivô', 'Pivô'].map((p) => <option key={p} value={p} />)}</datalist></label></div>{(record || mode === 'new') && <><div className="roster-form-row"><label>Data de nascimento (privada)<input type="date" value={fields.birthDate ?? ''} onChange={(e) => setFields({ ...fields, birthDate: e.target.value || null })} /></label><label>Altura em centímetros<input type="number" min={60} max={250} value={fields.heightCm ?? ''} onChange={(e) => setFields({ ...fields, heightCm: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Opcional" /></label></div><p className="roster-form-hint">Somente a idade fica pública. A data completa é visível para os técnicos responsáveis e o próprio atleta. Campos desconhecidos podem ficar em branco.</p><div className="roster-form-row"><label>No clube desde<input type="month" min="1900-01" max={CURRENT_DATE.slice(0, 7)} value={fields.memberSince ?? ''} onChange={(e) => setFields({ ...fields, memberSince: e.target.value || null })} /></label><label>Situação<select value={fields.status} onChange={(e) => setFields({ ...fields, status: e.target.value as AthleteFields['status'] })}><option value="ativo">Em atividade</option><option value="lesionado">Lesão</option><option value="afastado">Afastamento</option></select></label></div><label>URL da foto<input type="url" value={fields.photoUrl ?? ''} onChange={(e) => setFields({ ...fields, photoUrl: e.target.value || null })} placeholder="https://… (opcional)" /></label></>}</fieldset>{error && <p className="roster-form-error" role="alert">{error}</p>}<div className="roster-form-actions"><button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn btn--accent" disabled={busy || (!record && mode === 'link' && !originId)}>{busy ? 'Salvando…' : record ? 'Salvar atleta' : mode === 'link' ? 'Criar vínculo' : 'Cadastrar atleta'}</button></div></form></Modal>
}
