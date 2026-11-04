import { DATA_SEASON } from '../api/client'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { getMatch, listMatches, recordMatchAction, startMatch, undoMatchAction, controlMatch } from '../api/live'
import { ACTION_LABEL, clockSeconds, type MatchAction } from '../api/liveTypes'
import { useApi } from '../api/useApi'
import { useSession } from '../auth/session'
import { formatShortDate } from '../format'
import { Icon } from './HomeWidgets'
import { ClockDialog, FinishMatchDialog, SubstitutionDialog } from './LiveMatchDialogs'
import { BoxScore, LiveScoreboard, MatchComparison, MatchFeed, MatchHighlights, MatchLineups, matchTitle } from './LiveMatchWidgets'
import './LiveMatchPage.css'

const SCORING: { action: MatchAction; label: string; description: string }[] = [
  { action: 'two', label: '+2', description: 'Cesta de 2' }, { action: 'three', label: '+3', description: 'Cesta de 3' }, { action: 'free', label: '+1', description: 'Lance livre' },
]
const ACTIONS: { action: MatchAction; label: string; description: string }[] = [
  { action: 'off-rebound', label: 'RO', description: 'Rebote ofensivo' }, { action: 'def-rebound', label: 'RD', description: 'Rebote defensivo' }, { action: 'assist', label: 'AST', description: 'Assistência' },
  { action: 'steal', label: 'ROB', description: 'Roubo de bola' }, { action: 'block', label: 'TOC', description: 'Toco' }, { action: 'turnover', label: 'ERR', description: 'Erro de ataque' }, { action: 'foul', label: 'FAL', description: 'Falta pessoal' },
]

export default function LiveMatchPage() {
  const { user, can } = useSession()
  const [params, setParams] = useSearchParams()
  const [now, setNow] = useState(Date.now())
  const [retry, setRetry] = useState(0)
  const games = useApi(listMatches, `live:matches:${retry}`)
  const id = params.get('partida') ?? games.data?.[0]?.id ?? ''
  const matchQuery = useApi(() => id ? getMatch(id) : Promise.resolve(null), `live:match:${id}:${retry}`)
  const match = matchQuery.data?.game.id === id ? matchQuery.data : null
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const [teamChoice, setTeamChoice] = useState('')
  const [athleteChoice, setAthleteChoice] = useState('')
  const [dialog, setDialog] = useState<{ type: 'clock' | 'finish' } | { type: 'sub'; teamId: string } | null>(null)
  const tab = ['box', 'lineup', 'feed'].includes(params.get('aba') ?? '') ? params.get('aba')! : 'summary'

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer) }, [])
  useEffect(() => { setFeedback(null); setDialog(null) }, [id])

  function choose(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.set(key, value)
    setParams(next, { replace: true })
  }
  async function run(action: () => Promise<void>, message: string) {
    setBusy(true)
    setFeedback(null)
    try { await action(); setFeedback({ error: false, text: message }); return true }
    catch (e) { setFeedback({ error: true, text: e instanceof Error ? e.message : 'Não foi possível salvar a ação. Tente novamente.' }); setRetry((v) => v + 1); return false }
    finally { setBusy(false) }
  }

  const seconds = match ? clockSeconds(match.state, now) : 0
  const recorder = can('match.record') && ((user?.isDemo ?? true) || !!(match && user?.operatorTeamIds?.some((teamId) => [match.game.home.id, match.game.away.id].includes(teamId))))
  const operational = recorder && !match?.historical && match?.game.status === 'ao-vivo'
  const locked = busy || matchQuery.loading
  const teamId = match && [match.game.home.id, match.game.away.id].includes(teamChoice) ? teamChoice : match?.game.home.id ?? ''
  const court = match?.box.filter((a) => a.teamId === teamId && a.onCourt && a.eligible && a.fouls < 5) ?? []
  const athlete = court.find((a) => a.athleteId === athleteChoice) ?? court[0]
  const record = (action: MatchAction) => {
    if (!match || !athlete || !user) return
    void run(() => recordMatchAction(user, id, match.state.revision, { action, teamId, athleteId: athlete.athleteId }), `${ACTION_LABEL[action]} · ${athlete.name}`)
  }

  return (
    <div className="match-page">
      <header className="match-page-heading"><div><div className="eyebrow">CENTRAL DE JOGOS · TEMPORADA {match?.game.season ?? DATA_SEASON}</div><h1>A bola está em jogo<span>.</span></h1><p>{recorder ? 'Cada lance nas suas mãos. Registre o jogo dos dois lados da quadra.' : 'O placar, os protagonistas e cada lance que faz a diferença.'}</p></div><span className={`match-viewer-badge${recorder ? ' match-viewer-badge--operator' : ''}`}><Icon name="ball" />{recorder ? 'MESA DO ESTATÍSTICO' : 'ACOMPANHAMENTO PÚBLICO'}</span></header>

      {games.error && <div className="match-feedback match-feedback--error" role="alert">Não foi possível carregar as partidas. <button type="button" onClick={() => setRetry((v) => v + 1)}>Tentar novamente</button></div>}
      {!games.data && games.loading && <p className="muted" role="status">Carregando partidas…</p>}
      {!!games.data?.length && <><div className="match-picker-heading"><h2>Jogos próximos de hoje</h2><select aria-label="Selecionar partida" value={games.data.some((g) => g.id === id) ? id : ''} onChange={(e) => choose('partida', e.target.value)}><option value="" disabled>Selecionar…</option>{games.data.map((g) => <option value={g.id} key={g.id}>{g.status === 'ao-vivo' ? 'AO VIVO · ' : ''}{matchTitle(g)} · {g.home.name} · {formatShortDate(g.date)}</option>)}</select></div><nav className="match-picker" aria-label="Partidas disponíveis">{games.data.slice(0, 16).map((g) => <button type="button" key={g.id} aria-pressed={g.id === id} onClick={() => choose('partida', g.id)}><span className={`match-picker__status match-picker__status--${g.status}`}>{g.status === 'ao-vivo' ? '● AO VIVO' : g.status === 'agendado' ? 'AGENDADO' : g.status === 'adiado' ? 'ADIADO' : 'FINAL'}<small>{formatShortDate(g.date)}</small></span><b>{g.home.club.shortName}<strong>{g.homeScore ?? '—'}</strong></b><b>{g.away.club.shortName}<strong>{g.awayScore ?? '—'}</strong></b><span className="match-picker__category">{g.home.name}</span></button>)}</nav></>}
      {games.data && !games.data.length && <div className="match-panel match-empty"><h2>O próximo jogo vem aí.</h2><p>Nenhuma partida cadastrada nesta temporada.</p><Link to="/campeonatos" className="btn">Explorar campeonatos</Link></div>}
      {id && !match && matchQuery.loading && <p className="muted" role="status">Carregando a partida…</p>}
      {matchQuery.error && <div className="match-feedback match-feedback--error" role="alert">Não foi possível carregar esta partida. <button type="button" onClick={() => setRetry((v) => v + 1)}>Tentar novamente</button></div>}
      {id && !match && !matchQuery.loading && !matchQuery.error && <div className="match-panel match-empty"><h2>Partida não encontrada.</h2><p>Escolha outra partida na lista acima.</p></div>}

      {match && <>
        <LiveScoreboard match={match} seconds={seconds} />
        {recorder && !match.historical && match.game.status === 'agendado' && <div className="match-start"><div><b>Tudo pronto para a bola subir?</b><p>A partida começa com os atletas disponíveis do elenco e o relógio pausado.</p></div><button type="button" className="btn btn--accent" disabled={locked} onClick={() => void run(() => startMatch(user, id, match.state.revision), 'Partida iniciada. Prepare o relógio e registre os lances.')}>Iniciar partida ↗</button></div>}
        {operational && <div className="match-operator-bar"><div><span className="eyebrow">CONTROLE DA MESA</span><span>Relógio da mesa · ajuste conforme a quadra.</span></div><div><button type="button" className="btn btn--accent" disabled={locked || seconds === 0} onClick={() => void run(() => controlMatch(user, id, match.state.revision, { type: match.state.runningSince === null ? 'play' : 'pause' }), match.state.runningSince === null ? 'Relógio iniciado.' : 'Relógio pausado.')}>{match.state.runningSince === null ? '▶ Iniciar relógio' : 'Ⅱ Pausar relógio'}</button><button type="button" className="btn btn--ghost" disabled={locked || (match.state.runningSince !== null && seconds > 0)} onClick={() => setDialog({ type: 'clock' })}>Ajustar tempo</button><button type="button" className="btn btn--ghost" disabled={locked || seconds > 0 || (match.state.period >= (match.state.regulationPeriods ?? 4) && match.homeScore !== match.awayScore)} onClick={() => void run(() => controlMatch(user, id, match.state.revision, { type: 'next-period' }), 'Novo período preparado.')}>{match.state.period >= (match.state.regulationPeriods ?? 4) ? 'Prorrogação' : 'Próximo período'}</button><button type="button" className="btn btn--ghost" disabled={locked || match.state.period < (match.state.regulationPeriods ?? 4) || seconds > 0 || match.homeScore === match.awayScore} onClick={() => setDialog({ type: 'finish' })}>Encerrar partida</button></div>{seconds === 0 && <p>{match.state.period >= (match.state.regulationPeriods ?? 4) ? match.homeScore === match.awayScore ? 'Empate no fim do período: inicie uma prorrogação.' : 'Relógio zerado e vencedor definido. Confira os lances e encerre a partida.' : 'Fim do período. Confira os lances e avance para o próximo.'}</p>}</div>}
        {feedback && <div className={`match-feedback${feedback.error ? ' match-feedback--error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</div>}
        <nav className="match-tabs" aria-label="Informações da partida">{[['summary', 'Central da partida'], ['box', 'Box score'], ['lineup', 'Escalação'], ['feed', 'Lance a lance']].map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => choose('aba', key)}>{label}{key === 'feed' && <span>{match.state.events.length}</span>}</button>)}</nav>
        {tab === 'summary' && <><div className="match-summary-grid">{operational ? <section className="match-panel match-actions"><div className="match-panel-heading"><h2>Registre o próximo lance.</h2><span>AS DUAS EQUIPES</span></div><div className="match-team-switch" role="group" aria-label="Equipe do lance">{[match.game.home, match.game.away].map((t) => <button type="button" key={t.id} aria-pressed={teamId === t.id} onClick={() => setTeamChoice(t.id)}>{t.club.name}<small>{t.id === match.game.home.id ? 'MANDANTE' : 'VISITANTE'}</small></button>)}</div><label className="match-athlete-select">ATLETA EM QUADRA<select value={athlete?.athleteId ?? ''} onChange={(e) => setAthleteChoice(e.target.value)} disabled={!court.length}>{!court.length && <option value="">Sem atletas elegíveis em quadra</option>}{court.map((a) => <option key={a.athleteId} value={a.athleteId}>#{a.number ?? '—'} · {a.name} · {a.position}</option>)}</select></label><div className="match-scoring-actions">{SCORING.map((a) => <button type="button" key={a.action} disabled={locked || !athlete} onClick={() => record(a.action)} aria-label={`Registrar ${a.description} para ${athlete?.name ?? 'atleta'}`}><strong>{a.label}</strong><span>{a.description}</span></button>)}</div><div className="match-miss-actions"><span>Arremesso errado:</span>{[['miss-two', '2 pontos'], ['miss-three', '3 pontos'], ['miss-free', 'Lance livre']].map(([action, label]) => <button type="button" key={action} disabled={locked || !athlete} onClick={() => record(action as MatchAction)}>{label}</button>)}</div><div className="match-other-actions">{ACTIONS.map((a) => <button type="button" key={a.action} disabled={locked || !athlete} onClick={() => record(a.action)}><b>{a.label}</b><span>{a.description}</span></button>)}<button type="button" disabled={locked} onClick={() => setDialog({ type: 'sub', teamId })}><b>↔</b><span>Substituição</span></button></div><div className="match-undo"><p>{match.state.events.length ? 'Um lançamento errado? Desfaça a última ação.' : 'Selecione a equipe e o atleta antes de registrar.'}</p><button type="button" disabled={locked || !match.state.events.length} onClick={() => void run(() => undoMatchAction(user, id, match.state.revision), 'Última ação desfeita. Placar e estatísticas recalculados.')}>↶ Desfazer última</button></div></section> : <MatchComparison match={match} />}<MatchHighlights match={match} /></div><div className="match-secondary-grid">{operational && <MatchComparison match={match} />}<MatchFeed match={match} compact /></div></>}
        {tab === 'box' && <BoxScore match={match} />}
        {tab === 'lineup' && <MatchLineups match={match} onSubstitute={operational && !locked ? (teamId) => setDialog({ type: 'sub', teamId }) : undefined} />}
        {tab === 'feed' && <MatchFeed match={match} />}
        <p className="match-footnote match-demo-note">NCAA: calendário e box scores importados em lote. Novas partidas do CampHoop: registro persistente e atualização por WebSocket.</p>
        {user && dialog?.type === 'clock' && <ClockDialog key={id} match={match} seconds={seconds} user={user} run={run} busy={locked} onClose={() => setDialog(null)} />}
        {user && dialog?.type === 'sub' && <SubstitutionDialog key={`${id}:${dialog.teamId}`} match={match} teamId={dialog.teamId} user={user} run={run} busy={locked} onClose={() => setDialog(null)} />}
        {user && dialog?.type === 'finish' && <FinishMatchDialog match={match} user={user} run={run} busy={locked} onClose={() => setDialog(null)} />}
      </>}
    </div>
  )
}
