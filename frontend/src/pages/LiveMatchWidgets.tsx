import { Link } from 'react-router'
import { ACTION_LABEL, formatClock, periodLabel, type BoxLine, type LiveMatch } from '../api/liveTypes'
import type { PublicGame } from '../api/types'
import Avatar from '../components/Avatar'
import { Crest } from './HomeWidgets'

export function LiveScoreboard({ match, seconds }: { match: LiveMatch; seconds: number }) {
  const { game, state } = match
  return (
    <section className="match-scoreboard" aria-label="Placar da partida">
      <div className="match-scoreboard__top"><span className={`match-status match-status--${game.status}`}>{game.status === 'ao-vivo' ? 'AO VIVO' : game.status === 'encerrado' ? 'ENCERRADO' : game.status === 'adiado' ? 'ADIADO' : 'AGENDADO'}</span><span>{game.competition} · {game.home.name}</span><span className="match-scoreboard__venue">⌖ {game.venue ?? 'Local não informado'}</span></div>
      <div className="match-scoreboard__main">
        <Link to={`/times/${game.home.id}`} className="match-scoreboard__team"><Crest team={game.home} large /><b>{game.home.club.name}</b><small>MANDANTE · {game.home.club.city}</small></Link>
        <div className="match-scoreboard__center"><span className="match-scoreboard__label">{['agendado', 'adiado'].includes(game.status) ? 'A BOLA VAI SUBIR' : game.status === 'encerrado' ? 'PLACAR FINAL' : periodLabel(state.period, state.regulationPeriods).toUpperCase()}</span><div className="match-scoreboard__score">{['agendado', 'adiado'].includes(game.status) ? <strong>VS</strong> : <><strong>{match.homeScore.toString().padStart(2, '0')}</strong><i>:</i><strong>{match.awayScore.toString().padStart(2, '0')}</strong></>}</div>{game.status === 'ao-vivo' ? <div className="match-clock"><b>{formatClock(seconds)}</b><span>{seconds === 0 ? 'FIM DO PERÍODO' : state.runningSince === null ? 'RELÓGIO PAUSADO' : 'EM JOGO'}</span></div> : <span className="match-scoreboard__date">{['agendado', 'adiado'].includes(game.status) ? `${game.date.split('-').reverse().join('/')} · ${game.time ?? 'Horário a definir'}` : 'Cada ponto conta. Cada jogo, uma história.'}</span>}</div>
        <Link to={`/times/${game.away.id}`} className="match-scoreboard__team"><Crest team={game.away} large /><b>{game.away.club.name}</b><small>VISITANTE · {game.away.club.city}</small></Link>
      </div>
      {match.quarters.length > 0 && game.status !== 'agendado' && <div className="match-quarters"><div className="table-wrap"><table><caption>Pontuação por período</caption><thead><tr><th scope="col">PARCIAIS</th>{match.quarters.map((_, i) => <th key={i} scope="col">{i < (state.regulationPeriods ?? 4) ? `${i + 1}º` : `PR ${i + 1 - (state.regulationPeriods ?? 4)}`}</th>)}<th scope="col">TOTAL</th></tr></thead><tbody><tr><th scope="row">{game.home.club.shortName}</th>{match.quarters.map((q, i) => <td key={i}>{q.home}</td>)}<td>{match.homeScore}</td></tr><tr><th scope="row">{game.away.club.shortName}</th>{match.quarters.map((q, i) => <td key={i}>{q.away}</td>)}<td>{match.awayScore}</td></tr></tbody></table></div></div>}
    </section>
  )
}

export function BoxScore({ match }: { match: LiveMatch }) {
  if (match.historical && match.game.status !== 'encerrado') return <section className="match-panel"><h2>Estatísticas ainda não publicadas.</h2><p className="match-footnote">Esta partida faz parte do calendário importado. O box score será exibido quando os dados do jogo estiverem disponíveis na fonte.</p></section>
  return <div className="match-box-grid">{[match.game.home, match.game.away].map((team) => {
    const rows = match.box.filter((a) => a.teamId === team.id)
    const sum = (key: keyof Pick<BoxLine, 'points' | 'assists' | 'steals' | 'blocks' | 'turnovers' | 'fouls'>) => rows.reduce((n, a) => n + a[key], 0)
    return <section className="match-panel" key={team.id}><div className="match-panel-heading"><h2><Crest team={team} /> {team.club.name}</h2><span>{team.name}</span></div><div className="table-wrap"><table className="table match-box"><caption>Estatísticas de {team.club.name}</caption><thead><tr><th scope="col">Atleta</th>{['PTS', 'REB', 'AST', 'ROB', 'TOC', 'ERR', 'FAL'].map((h) => <th scope="col" key={h} className="num">{h}</th>)}</tr></thead><tbody>{rows.map((a) => <tr key={a.athleteId}><th scope="row"><Link to={`/atletas/${a.athleteId}`}><span className="match-box-number">{a.number ?? '—'}</span><span>{a.name}<small>{match.historical ? a.played ? 'Estatísticas registradas' : 'Sem estatísticas' : a.fouls >= 5 ? 'Limite de faltas' : !a.eligible ? 'Indisponível' : a.onCourt ? 'Em quadra' : 'Reserva'}</small></span></Link></th><td className="num match-box-points">{a.points}</td><td className="num">{a.offensiveRebounds + a.defensiveRebounds}</td><td className="num">{a.assists}</td><td className="num">{match.historical && match.statsComplete === undefined ? '—' : a.steals}</td><td className="num">{match.historical && match.statsComplete === undefined ? '—' : a.blocks}</td><td className="num">{match.historical && match.statsComplete === undefined ? '—' : a.turnovers}</td><td className="num">{match.historical && match.statsComplete === undefined ? '—' : a.fouls}</td></tr>)}</tbody><tfoot><tr><th scope="row">TOTAL REGISTRADO</th><td className="num">{sum('points')}</td><td className="num">{rows.reduce((n, a) => n + a.offensiveRebounds + a.defensiveRebounds, 0)}</td><td className="num">{sum('assists')}</td><td className="num">{match.historical && match.statsComplete === undefined ? '—' : sum('steals')}</td><td className="num">{match.historical && match.statsComplete === undefined ? '—' : sum('blocks')}</td><td className="num">{match.historical && match.statsComplete === undefined ? '—' : sum('turnovers')}</td><td className="num">{match.historical && match.statsComplete === undefined ? '—' : sum('fouls')}</td></tr></tfoot></table></div></section>
  })}<p className="match-footnote">PTS: pontos · REB: rebotes · AST: assistências · ROB: roubos · TOC: tocos · ERR: erros · FAL: faltas. {match.historical ? match.statsComplete === false ? 'A fonte apresenta divergência entre pontos individuais e placar oficial nesta partida. O placar oficial foi preservado.' : 'Estatísticas individuais importadas da fonte da temporada.' : 'O placar e as estatísticas são atualizados pelo mesmo registro de lances.'}</p></div>
}

export function MatchHighlights({ match }: { match: LiveMatch }) {
  const leaders = [...match.box].filter((a) => a.played).sort((a, b) => b.points - a.points || b.assists - a.assists || a.name.localeCompare(b.name, 'pt-BR')).slice(0, 4)
  const first = leaders[0]
  const club = (teamId: string) => teamId === match.game.home.id ? match.game.home.club : match.game.away.club
  return <section className="match-panel match-highlights"><div className="match-panel-heading"><h2>Quem faz a diferença</h2><span>DESTAQUES</span></div>{first ? <><Link to={`/atletas/${first.athleteId}`} className="match-star"><span className="match-star__number" aria-hidden="true">{String(first.number ?? '—').padStart(2, '0')}</span><span className="match-star__tag">MAIOR PONTUAÇÃO</span><Avatar name={first.name} size="lg" /><b>{first.name}</b><span>{club(first.teamId).name} · {first.position}</span><div><strong>{first.points}<small>PTS</small></strong><strong>{first.offensiveRebounds + first.defensiveRebounds}<small>REB</small></strong><strong>{first.assists}<small>AST</small></strong></div></Link><ol className="match-highlight-list">{leaders.slice(1).map((a, i) => <li key={a.athleteId}><span>{String(i + 2).padStart(2, '0')}</span><Avatar name={a.name} /><Link to={`/atletas/${a.athleteId}`}><b>{a.name}</b><small>{club(a.teamId).name}</small></Link><strong>{a.points}<small>PTS</small></strong></li>)}</ol></> : <p className="match-empty">Os destaques aparecem com as primeiras estatísticas.</p>}</section>
}

export function MatchComparison({ match }: { match: LiveMatch }) {
  if (match.game.status === 'agendado' || match.game.status === 'adiado') return <section className="match-panel"><h2>{match.game.status === 'adiado' ? 'Partida adiada.' : 'Aguardando a bola subir.'}</h2><p className="match-footnote">O placar e as estatísticas aparecem após o início da partida. {match.historical ? 'O calendário NCAA é uma captura importada; os resultados dependem de nova publicação e atualização da base.' : 'O estatístico pode iniciar e registrar esta partida no CampHoop.'}</p></section>
  const home = match.box.filter((a) => a.teamId === match.game.home.id)
  const away = match.box.filter((a) => a.teamId === match.game.away.id)
  const sum = (rows: BoxLine[], key: 'assists' | 'turnovers' | 'steals' | 'blocks') => rows.reduce((n, a) => n + a[key], 0)
  const rows = [
    ['Pontos', match.homeScore, match.awayScore],
    ['Rebotes', home.reduce((n, a) => n + a.offensiveRebounds + a.defensiveRebounds, 0), away.reduce((n, a) => n + a.offensiveRebounds + a.defensiveRebounds, 0)],
    ['Assistências', sum(home, 'assists'), sum(away, 'assists')],
    ...(!match.historical || match.statsComplete !== undefined ? [['Roubos de bola', sum(home, 'steals'), sum(away, 'steals')], ['Tocos', sum(home, 'blocks'), sum(away, 'blocks')], ['Erros de ataque', sum(home, 'turnovers'), sum(away, 'turnovers')]] : []),
  ] as [string, number, number][]
  return <section className="match-panel"><div className="match-panel-heading"><h2>O jogo em números</h2><span>COMPARATIVO</span></div><div className="match-comparison__teams"><span><Crest team={match.game.home} />{match.game.home.club.name}</span><span>{match.game.away.club.name}<Crest team={match.game.away} /></span></div><div className="match-comparison">{rows.map(([label, a, b]) => <div key={label}><div><b>{a}</b><span>{label}</span><b>{b}</b></div><div className="match-comparison__bars"><span><i style={{ width: `${a + b ? a / (a + b) * 100 : 0}%` }} /></span><span><i style={{ width: `${a + b ? b / (a + b) * 100 : 0}%` }} /></span></div></div>)}</div></section>
}

export function MatchFeed({ match, compact = false }: { match: LiveMatch; compact?: boolean }) {
  const events = [...match.state.events].reverse().slice(0, compact ? 5 : undefined)
  return <section className="match-panel"><div className="match-panel-heading"><h2>{compact ? 'Acabou de acontecer' : 'A história, lance a lance'}</h2><span>{match.state.events.length} AÇÕES</span></div>{!events.length ? <p className="match-empty">{match.historical ? 'O histórico desta partida não possui lances detalhados.' : match.game.id === 'm-110' ? 'Este é o placar inicial da demonstração. Os lances que você registrar aparecerão aqui.' : 'Aguardando o primeiro lance registrado pelo estatístico.'}</p> : <ol className="match-feed">{events.map((e) => {
    const a = match.box.find((p) => p.athleteId === e.athleteId)!
    const out = match.box.find((p) => p.athleteId === e.outAthleteId)
    const home = e.teamId === match.game.home.id
    return <li key={e.id}><div className="match-feed__time"><b>{formatClock(e.seconds)}</b><small>{periodLabel(e.period, match.state.regulationPeriods)}</small></div><span className={`match-feed__mark${home ? '' : ' match-feed__mark--away'}`} /><div><span>{home ? match.game.home.club.name : match.game.away.club.name}</span><b>{ACTION_LABEL[e.action]}</b><small>{a.name}{e.action === 'substitution' ? ` entrou${out ? ` · ${out.name} saiu` : ' em uma vaga em quadra'}` : ` · #${a.number ?? '—'}`}</small></div>{['two', 'three', 'free'].includes(e.action) && <strong className="match-feed__points">+{e.action === 'two' ? 2 : e.action === 'three' ? 3 : 1}</strong>}</li>
  })}</ol>}</section>
}

export function MatchLineups({ match, onSubstitute }: { match: LiveMatch; onSubstitute?: (teamId: string) => void }) {
  return <div className="match-lineup-grid">{[match.game.home, match.game.away].map((team) => {
    const roster = match.box.filter((a) => a.teamId === team.id)
    return <section className="match-panel" key={team.id}><div className="match-panel-heading"><h2><Crest team={team} />{team.club.name}</h2>{onSubstitute && <button type="button" className="btn btn--ghost" onClick={() => onSubstitute(team.id)}>Substituir ↔</button>}</div>{(!match.historical ? [true, false] : [false]).map((court) => <div className="match-lineup-group" key={String(court)}><h3>{match.historical ? 'ELENCO REGISTRADO' : court ? 'EM QUADRA' : 'BANCO E INDISPONÍVEIS'}</h3>{roster.filter((a) => match.historical || a.onCourt === court).map((a) => <div className="match-lineup-player" key={a.athleteId}><span className="match-jersey">{String(a.number ?? '—').padStart(2, '0')}</span><Link to={`/atletas/${a.athleteId}`}><b>{a.name}</b><small>{a.position}</small></Link><span>{a.points} PTS · {match.historical && match.statsComplete === undefined ? '—' : a.fouls} FAL</span>{!match.historical && (a.fouls >= 5 || !a.eligible) && <small className="match-unavailable">{a.fouls >= 5 ? '5 faltas' : 'Indisponível'}</small>}</div>)}</div>)}{!match.historical && roster.filter((a) => a.eligible).length < 5 && <p className="match-footnote">Elenco reduzido na demonstração: são exibidos apenas os atletas cadastrados.</p>}</section>
  })}</div>
}

export function matchTitle(game: PublicGame) { return `${game.home.club.name} × ${game.away.club.name}` }
