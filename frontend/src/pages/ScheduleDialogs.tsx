import { useState, type FormEvent } from 'react'
import { listCompetitions } from '../api/public'
import {
  ScheduleError,
  addExtraTraining,
  addTrainingSlot,
  cancelTraining,
  listTrainingSlots,
  removeExtraTraining,
  removeTrainingSlot,
  rescheduleTraining,
  restoreTraining,
  scheduleGame,
} from '../api/schedule'
import { listTeamSummaries } from '../api/teams'
import type { ScheduleEvent } from '../api/types'
import { useApi } from '../api/useApi'
import type { DemoUser } from '../auth/roles'
import Modal from '../components/Modal'

const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
/** Ordem de exibição: segunda a domingo. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** Envio de formulário com estado de carregamento e mensagem de erro de regra. */
function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
      onDone()
    } catch (e) {
      setError(e instanceof ScheduleError ? e.message : 'Não foi possível salvar. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

type Base = { user: DemoUser; onClose: () => void; onChanged: () => void }

/** Horário fixo semanal de treinos da equipe do técnico. */
export function TrainingPlanDialog({ user, onClose, onChanged }: Base) {
  const teamId = user.teamId!
  const [version, setVersion] = useState(0)
  const slots = useApi(() => listTrainingSlots(teamId), `slots:${teamId}:${version}`)
  const [weekday, setWeekday] = useState(1)
  const [time, setTime] = useState('17:00')
  const [venue, setVenue] = useState('')
  const refresh = () => {
    setVersion((v) => v + 1)
    onChanged()
  }
  const { busy, error, setError, run } = useSubmit(refresh)

  function add(e: FormEvent) {
    e.preventDefault()
    if (!time || !venue.trim()) return setError('Preencha o horário e o local.')
    run(async () => {
      await addTrainingSlot(user, { teamId, weekday, time, venue: venue.trim() })
      setVenue('')
    })
  }

  return (
    <Modal title="Horário fixo de treinos" onClose={onClose}>
      <p className="form__hint">Os treinos se repetem toda semana. Para mudar um dia específico, clique no treino na agenda.</p>
      <ul className="slot-list">
        {slots.loading && <li className="muted">Carregando…</li>}
        {slots.data?.length === 0 && <li className="muted">Nenhum treino fixo. Adicione o primeiro abaixo.</li>}
        {slots.data?.map((s) => (
          <li key={s.id}>
            <span>
              <b>{WEEKDAY_NAMES[s.weekday]} · {s.time}</b>
              <small>{s.venue}</small>
            </span>
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => run(() => removeTrainingSlot(user, s.id))}>
              Remover
            </button>
          </li>
        ))}
      </ul>
      <form className="form" onSubmit={add}>
        <div className="form__row">
          <label>
            Dia
            <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEK_ORDER.map((d) => (
                <option key={d} value={d}>{WEEKDAY_NAMES[d]}</option>
              ))}
            </select>
          </label>
          <label>
            Horário
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label>
          Local
          <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ex.: Ginásio Central · Quadra 2" />
        </label>
        {error && <p className="form__error" role="alert">{error}</p>}
        <div className="form__actions">
          <button type="submit" className="btn btn--accent" disabled={busy}>+ Adicionar treino fixo</button>
        </div>
      </form>
    </Modal>
  )
}

/** Treino específico: cancelar, reativar, remarcar ou remover (se avulso). */
export function TrainingDialog({ user, event, onClose, onChanged }: Base & { event: Extract<ScheduleEvent, { kind: 'treino' }> }) {
  const teamId = event.team.id
  const [mode, setMode] = useState<'menu' | 'remarcar'>('menu')
  const [date, setDate] = useState(event.date)
  const [time, setTime] = useState(event.time)
  const [venue, setVenue] = useState(event.venue)
  const { busy, error, setError, run } = useSubmit(() => {
    onChanged()
    onClose()
  })

  function reschedule(e: FormEvent) {
    e.preventDefault()
    if (date === event.date) return setError('Escolha uma data diferente da original.')
    if (!time || !venue.trim()) return setError('Preencha o horário e o local.')
    run(() => rescheduleTraining(user, { teamId, slotId: event.slotId!, fromDate: event.date, date, time, venue: venue.trim() }))
  }

  return (
    <Modal title={`Treino · ${event.date.split('-').reverse().join('/')} · ${event.time}`} onClose={onClose}>
      <p className="form__hint">
        {event.venue}
        {event.note && ` · ${event.note}`}
        {event.cancelled && ' · CANCELADO'}
      </p>
      {mode === 'menu' && (
        <div className="form__actions">
          {event.slotId === null && (
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => run(() => removeExtraTraining(user, teamId, event.id))}>
              Remover treino
            </button>
          )}
          {event.slotId !== null && event.cancelled && (
            <button type="button" className="btn btn--accent" disabled={busy} onClick={() => run(() => restoreTraining(user, teamId, event.slotId!, event.date))}>
              Reativar treino
            </button>
          )}
          {event.slotId !== null && !event.cancelled && (
            <>
              <button type="button" className="btn btn--danger" disabled={busy} onClick={() => run(() => cancelTraining(user, teamId, event.slotId!, event.date))}>
                Cancelar este treino
              </button>
              <button type="button" className="btn btn--accent" onClick={() => setMode('remarcar')}>Remarcar</button>
            </>
          )}
        </div>
      )}
      {mode === 'remarcar' && (
        <form className="form" onSubmit={reschedule}>
          <div className="form__row">
            <label>
              Nova data
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Horário
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
          <label>
            Local
            <input value={venue} onChange={(e) => setVenue(e.target.value)} />
          </label>
          <p className="form__hint">O treino original fica cancelado e um treino avulso é criado na nova data.</p>
          {error && <p className="form__error" role="alert">{error}</p>}
          <div className="form__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setMode('menu')}>Voltar</button>
            <button type="submit" className="btn btn--accent" disabled={busy}>Remarcar</button>
          </div>
        </form>
      )}
      {mode === 'menu' && error && <p className="form__error" role="alert">{error}</p>}
    </Modal>
  )
}

/** Treino avulso numa data, fora do horário fixo. */
export function ExtraTrainingDialog({ user, defaultDate, onClose, onChanged }: Base & { defaultDate: string }) {
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('17:00')
  const [venue, setVenue] = useState('')
  const { busy, error, setError, run } = useSubmit(() => {
    onChanged()
    onClose()
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!date || !time || !venue.trim()) return setError('Preencha data, horário e local.')
    run(() => addExtraTraining(user, { teamId: user.teamId!, date, time, venue: venue.trim() }))
  }

  return (
    <Modal title="Treino avulso" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form__row">
          <label>
            Data
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Horário
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label>
          Local
          <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ex.: Centro de Treinamento" />
        </label>
        {error && <p className="form__error" role="alert">{error}</p>}
        <div className="form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--accent" disabled={busy}>Adicionar treino</button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Agendar jogo. Organizador: jogo oficial entre equipes inscritas no campeonato.
 * Técnico: amistoso da própria equipe contra outra da mesma categoria.
 */
export function GameDialog({ user, kind, defaultDate, onClose, onChanged }: Base & { kind: 'oficial' | 'amistoso'; defaultDate: string }) {
  const teams = useApi(listTeamSummaries, 'teams:summaries')
  const competitions = useApi(listCompetitions, 'public:competitions')
  const myCompetitions = (competitions.data ?? []).filter((c) => user.competitionIds?.includes(c.id))
  const [competitionId, setCompetitionId] = useState(user.competitionIds?.[0] ?? '')
  const [homeTeamId, setHomeTeamId] = useState('')
  const [awayTeamId, setAwayTeamId] = useState('')
  const [atHome, setAtHome] = useState(true)
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('10:00')
  const [venue, setVenue] = useState('')
  const { busy, error, setError, run } = useSubmit(() => {
    onChanged()
    onClose()
  })

  const all = teams.data ?? []
  const own = all.find((s) => s.team.id === user.teamId)
  const label = (id: string) => {
    const t = all.find((s) => s.team.id === id)?.team
    return t ? `${t.club.name} · ${t.name}` : ''
  }
  // Oficial: equipes do campeonato; o visitante tem de ser da mesma categoria do mandante.
  const inCompetition = all.filter((s) => s.competitions.some((c) => c.id === competitionId))
  const homeCategory = all.find((s) => s.team.id === homeTeamId)?.team.category
  const awayOptions = inCompetition.filter((s) => s.team.id !== homeTeamId && (!homeCategory || s.team.category === homeCategory))
  // Amistoso: adversários de outros clubes na mesma categoria da equipe do técnico.
  const opponents = all.filter((s) => own && s.team.category === own.team.category && s.team.club.id !== own.team.club.id)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!date || !time || !venue.trim()) return setError('Preencha data, horário e local.')
    if (kind === 'oficial') {
      if (!homeTeamId || !awayTeamId) return setError('Escolha as duas equipes.')
      run(() => scheduleGame(user, { competitionId, homeTeamId, awayTeamId, date, time, venue: venue.trim() }))
    } else {
      if (!awayTeamId) return setError('Escolha o adversário.')
      const [home, away] = atHome ? [user.teamId!, awayTeamId] : [awayTeamId, user.teamId!]
      run(() => scheduleGame(user, { competitionId: null, homeTeamId: home, awayTeamId: away, date, time, venue: venue.trim() }))
    }
  }

  return (
    <Modal title={kind === 'oficial' ? 'Agendar jogo oficial' : 'Agendar amistoso'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {kind === 'oficial' ? (
          <>
            <label>
              Campeonato
              <select
                value={competitionId}
                onChange={(e) => {
                  setCompetitionId(e.target.value)
                  setHomeTeamId('')
                  setAwayTeamId('')
                }}
              >
                {myCompetitions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <div className="form__row">
              <label>
                Mandante
                <select
                  value={homeTeamId}
                  onChange={(e) => {
                    setHomeTeamId(e.target.value)
                    setAwayTeamId('')
                  }}
                >
                  <option value="">Escolha…</option>
                  {inCompetition.map((s) => (
                    <option key={s.team.id} value={s.team.id}>{label(s.team.id)}</option>
                  ))}
                </select>
              </label>
              <label>
                Visitante
                <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)} disabled={!homeTeamId}>
                  <option value="">Escolha…</option>
                  {awayOptions.map((s) => (
                    <option key={s.team.id} value={s.team.id}>{label(s.team.id)}</option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : (
          <>
            <p className="form__hint">Equipe: <b>{own ? label(own.team.id) : '…'}</b></p>
            <div className="form__row">
              <label>
                Adversário
                <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
                  <option value="">Escolha…</option>
                  {opponents.map((s) => (
                    <option key={s.team.id} value={s.team.id}>{label(s.team.id)}</option>
                  ))}
                </select>
              </label>
              <label>
                Mando
                <select value={atHome ? 'casa' : 'fora'} onChange={(e) => setAtHome(e.target.value === 'casa')}>
                  <option value="casa">Em casa</option>
                  <option value="fora">Fora</option>
                </select>
              </label>
            </div>
          </>
        )}
        <div className="form__row">
          <label>
            Data
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Horário
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label>
          Local
          <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ex.: Ginásio Central · Quadra 1" />
        </label>
        {error && <p className="form__error" role="alert">{error}</p>}
        <div className="form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--accent" disabled={busy}>Agendar</button>
        </div>
      </form>
    </Modal>
  )
}
