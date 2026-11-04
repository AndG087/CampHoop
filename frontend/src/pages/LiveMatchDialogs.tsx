import { useState, type FormEvent } from 'react'
import { controlMatch, recordMatchAction } from '../api/live'
import { formatClock, periodLength, type LiveMatch } from '../api/liveTypes'
import type { DemoUser } from '../auth/roles'
import Modal from '../components/Modal'

export type RunMatchAction = (action: () => Promise<void>, message: string) => Promise<boolean>

export function ClockDialog({ match, seconds, user, run, busy, onClose }: { match: LiveMatch; seconds: number; user: DemoUser; run: RunMatchAction; busy: boolean; onClose: () => void }) {
  const [time, setTime] = useState(formatClock(seconds))
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{1,2}:[0-5]\d$/.test(time)) { setError('Use o formato MM:SS.'); return }
    const [m, s] = time.split(':').map(Number)
    if (m * 60 + s > periodLength(match.state.period, match.state.regulationPeriods, match.state.periodSeconds)) { setError('O tempo excede a duração deste período.'); return }
    if (await run(() => controlMatch(user, match.game.id, match.state.revision, { type: 'set', seconds: m * 60 + s }), 'Relógio ajustado.')) onClose()
  }
  return <Modal title="Ajustar relógio" onClose={onClose}><form className="form" onSubmit={submit}><p className="form__hint">Use o relógio oficial da quadra como referência. O ajuste não altera os lances já registrados.</p><label>Tempo restante (MM:SS)<input autoFocus value={time} onChange={(e) => setTime(e.target.value)} placeholder="04:32" required /></label>{error && <p className="form__error" role="alert">{error}</p>}<div className="form__actions"><button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn--accent" disabled={busy}>Salvar horário</button></div></form></Modal>
}

export function SubstitutionDialog({ match, teamId, user, run, busy, onClose }: { match: LiveMatch; teamId: string; user: DemoUser; run: RunMatchAction; busy: boolean; onClose: () => void }) {
  const court = match.box.filter((a) => a.teamId === teamId && a.onCourt)
  const bench = match.box.filter((a) => a.teamId === teamId && a.eligible && !a.onCourt && a.fouls < 5)
  const [outId, setOutId] = useState(court.length < 5 ? '' : court[0]?.athleteId ?? '')
  const [inId, setInId] = useState(bench[0]?.athleteId ?? '')
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (await run(() => recordMatchAction(user, match.game.id, match.state.revision, { action: 'substitution', teamId, athleteId: inId, outAthleteId: outId || null }), 'Substituição registrada.')) onClose()
  }
  return <Modal title="Registrar substituição" onClose={onClose}><form className="form" onSubmit={submit}><p className="form__hint">{teamId === match.game.home.id ? match.game.home.club.name : match.game.away.club.name} · {court.length} atletas em quadra</p><label>Sai<select value={outId} onChange={(e) => setOutId(e.target.value)}>{court.length < 5 && <option value="">Preencher vaga em quadra</option>}{court.map((a) => <option key={a.athleteId} value={a.athleteId}>#{a.number ?? '—'} · {a.name}</option>)}</select></label><label>Entra<select value={inId} onChange={(e) => setInId(e.target.value)} required disabled={!bench.length}>{!bench.length && <option value="">Sem reservas disponíveis</option>}{bench.map((a) => <option key={a.athleteId} value={a.athleteId}>#{a.number ?? '—'} · {a.name}</option>)}</select></label>{!bench.length && <p className="form__hint">Não há reservas elegíveis para entrar nesta equipe.</p>}<div className="form__actions"><button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn--accent" disabled={busy || !bench.length || !inId}>Confirmar substituição</button></div></form></Modal>
}

export function FinishMatchDialog({ match, user, run, busy, onClose }: { match: LiveMatch; user: DemoUser; run: RunMatchAction; busy: boolean; onClose: () => void }) {
  return <Modal title="Encerrar partida" onClose={onClose}><div className="match-final-preview"><b>{match.game.home.club.name} {match.homeScore} × {match.awayScore} {match.game.away.club.name}</b><p>Este será o resultado final. Ele atualizará a classificação, a campanha das equipes e as estatísticas da temporada.</p></div><div className="form__actions"><button type="button" className="btn btn--ghost" onClick={onClose}>Voltar à partida</button><button type="button" className="btn btn--accent" disabled={busy} onClick={async () => { if (await run(() => controlMatch(user, match.game.id, match.state.revision, { type: 'finish' }), 'Partida encerrada. Resultado atualizado.')) onClose() }}>Confirmar resultado final</button></div></Modal>
}
