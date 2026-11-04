import { useState, type FormEvent } from 'react'
import { createCompetition, DIVISIONS, divisionKey, divisionLabel, enrollTeams } from '../api/competitions'
import { listTeams } from '../api/athletes'
import type { CompetitionProfile } from '../api/types'
import { useApi } from '../api/useApi'
import type { DemoUser } from '../auth/roles'
import Modal from '../components/Modal'

export function CreateCompetitionDialog({ user, onClose, onCreated }: { user: DemoUser; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const id = await createCompetition(user, { name, divisions: DIVISIONS.filter((d) => selected.includes(divisionKey(d))) })
      onCreated(id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar o campeonato. Tente novamente.') }
    finally { setBusy(false) }
  }
  return (
    <Modal title="Criar campeonato" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="form__hint">Você será o organizador. Depois, inscreva as equipes e prepare a tabela de jogos.</p>
        <label>Nome do campeonato<input required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Copa de Base CampHoop" /></label>
        <fieldset className="competition-options"><legend>Divisões</legend>{DIVISIONS.map((d) => {
          const key = divisionKey(d)
          return <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, key] : s.filter((k) => k !== key))} /><span>{divisionLabel(d)}</span></label>
        })}</fieldset>
        <p className="form__hint">O campeonato começa com inscrições abertas. As alterações são salvas no banco de dados.</p>
        {error && <p className="form__error" role="alert">{error}</p>}
        <div className="form__actions"><button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn--accent" disabled={busy}>{busy ? 'Criando…' : 'Criar campeonato'}</button></div>
      </form>
    </Modal>
  )
}

export function EnrollTeamsDialog({ user, competition, onClose, onChanged }: { user: DemoUser; competition: CompetitionProfile; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error: loadError } = useApi(listTeams, 'enrollment:teams')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const available = (data ?? []).filter((t) => !competition.enrolled.some((e) => e.id === t.id) && competition.divisions.some((d) => d.category === t.category && d.gender === t.gender))
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try { await enrollTeams(user, competition.id, selected); onChanged(); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível inscrever as equipes. Tente novamente.') }
    finally { setBusy(false) }
  }
  return (
    <Modal title="Inscrever equipes" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="form__hint">{competition.name} · Selecione as equipes das divisões deste campeonato.</p>
        {loading && <p role="status">Carregando equipes…</p>}
        {loadError && <p role="alert">Não foi possível carregar as equipes. Feche e tente novamente.</p>}
        {data && !available.length && <p className="form__hint">Todas as equipes disponíveis dessas divisões já estão inscritas.</p>}
        <fieldset className="competition-options"><legend>Equipes disponíveis</legend>{available.map((t) => <label key={t.id}><input type="checkbox" checked={selected.includes(t.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, t.id] : s.filter((id) => id !== t.id))} /><span><b>{t.club.name}</b><small>{t.name} · {t.club.city}</small></span></label>)}</fieldset>
        {error && <p className="form__error" role="alert">{error}</p>}
        <div className="form__actions"><button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn--accent" disabled={busy || !selected.length}>{busy ? 'Inscrevendo…' : `Inscrever${selected.length ? ` (${selected.length})` : ''}`}</button></div>
      </form>
    </Modal>
  )
}
