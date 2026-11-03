import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { HomeLeader, HomePerformance, HomeSummary } from '../api/home'
import { CURRENT_DATE as DEMO_TODAY } from '../api/client'
import type { PublicGame, ScheduleEvent, Team } from '../api/types'
import Avatar from '../components/Avatar'
import { formatAverage, formatDate, formatGameDay, formatShortDate } from '../format'

export const agendaLink = (date: string) => `/agenda?mes=${date.slice(0, 7)}&dia=${date}`

export function Icon({ name }: { name: 'ball' | 'people' | 'calendar' | 'arrow' | 'trophy' }) {
  const paths = {
    ball: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18M5.5 5.5c8 3 5 8 13 13M18.5 5.5c-8 3-5 8-13 13" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2" /></>,
    arrow: <path d="M5 19 19 5M5 5h14v14" />,
    trophy: <><path d="M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H3v3a5 5 0 0 0 5 5M17 5h4v3a5 5 0 0 1-5 5M12 15v6M8 21h8" /></>,
  }
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function Crest({ team, large = false }: { team: Team; large?: boolean }) {
  return <span className={`home-crest home-crest--${team.club.id}${large ? ' home-crest--large' : ''}`} aria-hidden="true"><span>{team.club.shortName}</span><small>BSKT</small></span>
}

export function SectionHeading({ number, title, link, to }: { number: string; title: string; link?: string; to?: string }) {
  return <div className="home-section-heading"><h2><span>{number}</span>{title}</h2>{to && <Link to={to} className="home-text-link">{link} <span aria-hidden="true">↗</span></Link>}</div>
}

export function MatchHero({ game }: { game: PublicGame }) {
  const live = game.status === 'ao-vivo'
  const finished = game.status === 'encerrado'
  return (
    <article className="home-match-hero">
      <svg className="home-court-art" viewBox="0 0 640 340" fill="none" aria-hidden="true"><path d="M20 20h600v300H20zM320 20v300" /><circle cx="320" cy="170" r="48" /><path d="M20 105h100v130H20M620 105H520v130h100M20 45a133 133 0 0 1 0 250M620 45a133 133 0 0 0 0 250" /><circle cx="75" cy="170" r="12" /><circle cx="565" cy="170" r="12" /></svg>
      <div className="home-match-hero__top"><span className={`home-status${live ? ' home-status--live' : ''}`}>{live ? 'AO VIVO AGORA' : finished ? 'RESULTADO EM DESTAQUE' : 'PRÓXIMO CONFRONTO'}</span><span>{game.competition}</span></div>
      <div className="home-match-hero__title"><span>O basquete não para.</span><h2>{live ? 'É dia de jogo.' : finished ? 'Um jogo para rever.' : 'O próximo desafio.'}</h2></div>
      <div className="home-matchup">
        <Link to={`/times/${game.home.id}`} className="home-matchup__team"><Crest team={game.home} large /><span><b>{game.home.club.name}</b><small>{game.home.name}</small></span></Link>
        <div className="home-matchup__middle">{live || finished ? <strong>{game.homeScore}<i>:</i>{game.awayScore}</strong> : <strong className="home-matchup__vs">VS</strong>}<span>{live ? game.period : finished ? `${formatDate(game.date)} · PLACAR FINAL` : `${formatGameDay(game.date, DEMO_TODAY)} · ${game.time}`}</span></div>
        <Link to={`/times/${game.away.id}`} className="home-matchup__team"><Crest team={game.away} large /><span><b>{game.away.club.name}</b><small>{game.away.name}</small></span></Link>
      </div>
      <div className="home-match-hero__foot"><span>⌖ {game.venue ?? 'Local a definir'}</span><Link to={`/ao-vivo?partida=${game.id}`}>Ver partida <Icon name="arrow" /></Link></div>
    </article>
  )
}

export function SeasonCard({ data, teamId }: { data: HomeSummary; teamId?: string }) {
  const own = teamId ? data.teams.find((s) => s.team.id === teamId) : undefined
  const rate = own?.games ? Math.round(own.wins / own.games * 100) : 0
  return (
    <aside className="home-season-card">
      <div className="home-overline">{own ? 'SUA EQUIPE, EM FOCO' : 'POR DENTRO DA TEMPORADA'}<Icon name="trophy" /></div>
      <h2>{own ? own.team.club.name : 'O jogo ganha força.'}</h2>
      <p>{own ? own.team.name : `${data.teams.length} equipes · ${data.activeCompetitions} campeonato em andamento`}</p>
      {own ? <><div className="home-record"><strong>{own.wins}<small>V</small><span>/</span>{own.losses}<small>D</small></strong><b>{rate}%<small>aproveitamento</small></b></div><div className="home-progress" role="img" aria-label={`${rate}% de aproveitamento`}><span style={{ width: `${rate}%` }} /></div><div className="home-form"><span>Últimos jogos</span><div>{[...data.results].reverse().map((g) => {
        const won = g.home.id === teamId ? g.homeScore! > g.awayScore! : g.awayScore! > g.homeScore!
        return <span key={g.id} className={won ? 'home-form__win' : 'home-form__loss'} title={`${formatShortDate(g.date)}: ${g.home.club.name} ${g.homeScore} × ${g.awayScore} ${g.away.club.name}`}>{won ? 'V' : 'D'}</span>
      })}{!data.results.length && <small>Sem partidas encerradas</small>}</div></div></> : <div className="home-season-card__total"><strong>{data.games.toString().padStart(2, '0')}</strong><span>partidas encerradas<br />muitas histórias em quadra.</span></div>}
      <Link to={own ? `/times/${own.team.id}` : '/times'}>{own ? 'Conhecer minha equipe' : 'Explorar as equipes'} <span aria-hidden="true">↗</span></Link>
    </aside>
  )
}

export function Metric({ icon, label, value, children, accent = false }: { icon: 'ball' | 'people' | 'calendar' | 'trophy'; label: string; value: ReactNode; children: ReactNode; accent?: boolean }) {
  return <article className={`home-metric${accent ? ' home-metric--accent' : ''}`}><div><span>{label}</span><Icon name={icon} /></div><strong>{value}</strong><p>{children}</p></article>
}

export function PerformanceChart({ games, mine }: { games: HomePerformance[]; mine: boolean }) {
  const gradientId = useId()
  const [activeId, setActiveId] = useState<string | null>(null)
  const selected = games.find((g) => g.id === activeId) ?? games[games.length - 1]
  const max = Math.ceil(Math.max(20, ...games.flatMap((g) => [g.scored, g.allowed])) / 20) * 20
  const x = (i: number) => games.length === 1 ? 300 : 38 + i * 524 / (games.length - 1)
  const y = (score: number) => 156 - score / max * 128
  const points = (key: 'scored' | 'allowed') => games.map((g, i) => `${x(i)},${y(g[key])}`).join(' ')
  if (!games.length) return <p className="home-empty">Os gráficos aparecem depois da primeira partida encerrada.</p>
  return (
    <figure className="home-chart">
      <svg viewBox="0 0 600 200" role="img" aria-label={`${mine ? 'Pontos feitos e sofridos' : 'Pontos de mandantes e visitantes'} nos últimos ${games.length} jogos. Valores detalhados abaixo.`}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ee8839" stopOpacity=".23" /><stop offset="1" stopColor="#ee8839" stopOpacity="0" /></linearGradient></defs>
        {[0, 1, 2, 3, 4].map((n) => <g key={n}><line x1="38" x2="562" y1={y(max * n / 4)} y2={y(max * n / 4)} stroke="#eae4da" strokeDasharray="3 5" /><text x="23" y={y(max * n / 4) + 4} textAnchor="end">{max * n / 4}</text></g>)}
        <polygon points={`${x(0)},156 ${points('scored')} ${x(games.length - 1)},156`} fill={`url(#${gradientId})`} />
        <polyline points={points('allowed')} fill="none" stroke="#8f9eab" strokeWidth="2" strokeDasharray="5 5" />
        <polyline points={points('scored')} fill="none" stroke="#e77d2d" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {games.map((g, i) => <g key={g.id}><circle cx={x(i)} cy={y(g.scored)} r={selected.id === g.id ? 7 : 5} fill={selected.id === g.id ? '#e77d2d' : '#fffdf8'} stroke="#e77d2d" strokeWidth="2.5" /><text x={x(i)} y={y(g.scored) - 14} textAnchor="middle" className="home-chart__value">{g.scored}</text><text x={x(i)} y="184" textAnchor="middle">{formatShortDate(g.date)}</text></g>)}
      </svg>
      <figcaption><span><i />{mine ? 'Pontos feitos' : 'Mandantes'}</span><span><i />{mine ? 'Pontos sofridos' : 'Visitantes'}</span><small>{games.length === 1 ? 'Último jogo encerrado' : `Últimos ${games.length} jogos encerrados`}</small></figcaption>
      <div className="home-chart-games" role="group" aria-label="Selecionar partida do gráfico">{games.map((g) => <button key={g.id} type="button" aria-pressed={selected.id === g.id} onClick={() => setActiveId(g.id)}>{formatShortDate(g.date)}</button>)}</div>
      <div className="home-chart-detail" aria-live="polite"><span>{mine ? 'vs ' : ''}{selected.label}<small>{formatShortDate(selected.date)}</small></span><b>{selected.scored}<span> × </span>{selected.allowed}</b><Link to={agendaLink(selected.date)} aria-label={`Ver jogo de ${formatDate(selected.date)} na agenda`}>↗</Link></div>
      <details className="home-chart-data"><summary>Consultar valores dos jogos</summary><div className="table-wrap"><table className="table"><thead><tr><th>Data</th><th>{mine ? 'Adversário' : 'Confronto'}</th><th>{mine ? 'Feitos' : 'Mandante'}</th><th>{mine ? 'Sofridos' : 'Visitante'}</th></tr></thead><tbody>{games.map((g) => <tr key={g.id}><td>{formatShortDate(g.date)}</td><td>{g.label}</td><td>{g.scored}</td><td>{g.allowed}</td></tr>)}</tbody></table></div></details>
    </figure>
  )
}

export function Leaders({ leaders }: { leaders: HomeLeader[] }) {
  const [metric, setMetric] = useState<'points' | 'rebounds' | 'assists'>('points')
  const sorted = [...leaders].sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name, 'pt-BR')).slice(0, 4)
  const unit = { points: 'PTS/J', rebounds: 'REB/J', assists: 'AST/J' }[metric]
  return <section className="home-panel home-leaders"><SectionHeading number="02" title="Quem faz acontecer" to="/atletas" link="Atletas" /><div className="home-segment" role="group" aria-label="Estatística dos destaques">{([['points', 'Pontos'], ['rebounds', 'Rebotes'], ['assists', 'Assistências']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>)}</div><ol className="home-leader-list">{sorted.map((a, i) => <li key={a.id}><Link to={`/atletas/${a.id}`}><span className="home-leader-rank">{String(i + 1).padStart(2, '0')}</span><Avatar name={a.name} /><span className="home-leader-name"><b>{a.name}</b><small>#{a.number ?? '—'} · {a.team.club.shortName} · {a.team.category}</small></span><span className="home-leader-stat"><b>{formatAverage(a[metric])}</b><small>{unit}</small></span></Link></li>)}</ol>{!sorted.length && <p className="home-empty">Ainda não há estatísticas registradas.</p>}<p className="home-panel-note">Médias por partida com estatística registrada.</p></section>
}

export function UpcomingEvent({ event }: { event: ScheduleEvent }) {
  const training = event.kind === 'treino'
  return <li className="home-event"><div className={`home-event__date${training ? ' home-event__date--training' : ''}`}><b>{event.date.slice(-2)}</b><span>{formatShortDate(event.date).split(' ')[1]}</span></div><div className="home-event__body"><span className="home-event__tag">{training ? 'TREINO' : event.game.competition ?? 'JOGO'} <i /> {event.time ?? 'A definir'}</span><b>{training ? `${event.team.club.name} · ${event.team.name}` : `${event.game.home.club.name} × ${event.game.away.club.name}`}</b><small>{training ? event.venue : `${event.game.home.name} · ${event.game.venue ?? 'Local a definir'}`}</small></div><Link to={agendaLink(event.date)} className="home-event__link" aria-label={`Ver na agenda: ${formatDate(event.date)}`}><Icon name="arrow" /></Link></li>
}
