import LoadMore from '../components/LoadMore'
import { DATA_SEASON } from '../api/client'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { divisionKey, divisionLabel, getCompetition } from '../api/competitions'
import { CURRENT_DATE as DEMO_TODAY } from '../api/client'
import type { PublicGame, Standing } from '../api/types'
import { useApi } from '../api/useApi'
import { canManageCompetition } from '../auth/access'
import { useSession } from '../auth/session'
import { formatGameDay } from '../format'
import { EnrollTeamsDialog } from './CompetitionDialogs'
import { COMPETITION_STATUS, TrophyArt } from './CompetitionsPage'
import { Crest, Icon } from './HomeWidgets'
import { GameDialog } from './ScheduleDialogs'
import './CompetitionsPage.css'

function StandingsTable({ rows, ownTeamId, winRate = false }: { rows: Standing[]; ownTeamId?: string; winRate?: boolean }) {
  return (
    <div className="table-wrap competition-standings">
      <table className="table">
        <caption>Classificação da divisão selecionada</caption>
        <thead><tr><th scope="col">#</th><th scope="col">Equipe</th><th scope="col" className="num">{winRate ? 'APROV.' : 'PTS'}</th><th scope="col" className="num">J</th><th scope="col" className="num">V</th><th scope="col" className="num">D</th><th scope="col" className="num">PF</th><th scope="col" className="num">PC</th><th scope="col" className="num">Saldo</th><th scope="col">Últimos jogos</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.team.id} className={`${r.team.id === ownTeamId ? 'competition-row--mine' : ''}${i === 0 && r.played ? ' competition-row--first' : ''}`}>
          <td><span className="competition-rank">{i + 1}</span></td>
          <th scope="row"><Link to={`/times/${r.team.id}`} className="competition-team-name"><Crest team={r.team} /><span>{r.team.club.name}{r.team.id === ownTeamId && <small>SUA EQUIPE</small>}</span></Link></th>
          <td className="num competition-standing-points">{winRate ? `${r.winRate ?? 0}%` : r.points}</td><td className="num">{r.played}</td><td className="num">{r.wins}</td><td className="num">{r.losses}</td><td className="num">{r.pointsFor}</td><td className="num">{r.pointsAgainst}</td><td className={`num ${r.difference > 0 ? 'competition-positive' : ''}`}>{r.difference > 0 ? '+' : ''}{r.difference}</td>
          <td><div className="competition-form">{r.form.length ? r.form.map((f, n) => <span key={n} className={f === 'V' ? 'competition-form--win' : 'competition-form--loss'}>{f}</span>) : <span className="muted">—</span>}</div></td>
        </tr>)}</tbody>
      </table>
    </div>
  )
}

function GameCard({ game }: { game: PublicGame }) {
  return (
    <article className={`competition-game${game.status === 'ao-vivo' ? ' competition-game--live' : ''}`}>
      <div className="competition-game__meta"><b>{formatGameDay(game.date, DEMO_TODAY)}{game.time ? ` · ${game.time}` : ''}</b><span className={`competition-status competition-status--${game.status === 'ao-vivo' ? 'em-andamento' : game.status === 'encerrado' ? 'finalizado' : 'inscricoes'}`}>{game.status === 'ao-vivo' ? 'Ao vivo' : game.status === 'encerrado' ? 'Encerrado' : game.status === 'adiado' ? 'Adiado' : 'Agendado'}</span></div>
      <div className="competition-game__teams"><Link to={`/times/${game.home.id}`}><Crest team={game.home} /><b>{game.home.club.name}</b></Link><strong>{game.status === 'agendado' ? '×' : `${game.homeScore} – ${game.awayScore}`}</strong><Link to={`/times/${game.away.id}`}><Crest team={game.away} /><b>{game.away.club.name}</b></Link></div>
      <div className="competition-game__foot"><span>{game.home.name}{game.venue ? ` · ${game.venue}` : ''}{game.period ? ` · ${game.period}` : ''}</span><Link to={`/ao-vivo?partida=${game.id}`} aria-label={`Ver partida de ${game.home.club.name} contra ${game.away.club.name}`}>Ver partida ↗</Link></div>
    </article>
  )
}

export default function CompetitionPage() {
  const { competitionId = '' } = useParams()
  const { user } = useSession()
  const [params, setParams] = useSearchParams()
  const [version, setVersion] = useState(0)
  const [shown, setShown] = useState(60)
  const [dialog, setDialog] = useState<'inscricao' | 'jogo' | null>(null)
  const { data, loading, error } = useApi(() => getCompetition(competitionId), `competition:${competitionId}:${version}`)
  const refresh = () => setVersion((v) => v + 1)
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  if (loading) return <p className="muted" role="status">Carregando campeonato…</p>
  if (error) return <div className="card" role="alert"><p>Não foi possível carregar o campeonato.</p><button type="button" className="btn btn--ghost" onClick={refresh}>Tentar novamente</button></div>
  if (!data) return <div className="competition-empty"><h1>Campeonato não encontrado</h1><p>Confira os campeonatos disponíveis nesta temporada.</p><Link to="/campeonatos" className="btn">Ver campeonatos</Link></div>

  const manager = canManageCompetition(user, data)
  const tab = ['jogos', 'equipes'].includes(params.get('aba') ?? '') ? params.get('aba')! : 'classificacao'
  const own = data.enrolled.find((t) => t.id === user?.teamId)
  const selected = data.standings.find((s) => divisionKey(s.division) === params.get('divisao')) ?? data.standings.find((s) => s.division.category === own?.category && s.division.gender === own?.gender) ?? data.standings[0]
  const divisionGames = data.games.filter((g) => g.home.category === selected?.division.category && g.home.gender === selected?.division.gender)
  const finished = divisionGames.filter((g) => g.status === 'encerrado')
  const nextGame = divisionGames.find((g) => g.status === 'ao-vivo') ?? divisionGames.find((g) => g.status === 'agendado')
  const gameStatus = params.get('jogos') ?? ''
  const visibleGames = divisionGames.filter((g) => !gameStatus || g.status === gameStatus).sort((a, b) => gameStatus === 'encerrado' ? b.date.localeCompare(a.date) : (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
  const canPair = data.standings.some((s) => s.rows.length >= 2)

  return (
    <div className="competitions-page competition-detail">
      <Link to="/campeonatos" className="back-link">← Campeonatos</Link>
      <section className="competition-detail-hero">
        <div><div className="competition-detail-hero__meta"><span className={`competition-status competition-status--${data.status}`}>{COMPETITION_STATUS[data.status]}</span>{manager && <span className="competition-organizer-tag">VOCÊ ORGANIZA</span>}</div><h1>{data.name}</h1><p>{data.phase} · Temporada {data.season ?? DATA_SEASON}</p><span className="competition-detail-hero__note">{data.note}</span></div>
        <TrophyArt />
        <div className="competition-detail-hero__stats"><div><b>{data.teams.toString().padStart(2, '0')}</b><span>equipes</span></div><div><b>{data.divisions.length.toString().padStart(2, '0')}</b><span>divisões</span></div><div><b>{data.games.filter((g) => g.status === 'encerrado').length.toString().padStart(2, '0')}</b><span>jogos encerrados</span></div></div>
      </section>

      {manager && <div className="competition-management"><p><Icon name="trophy" /> Central do organizador <span>As alterações são salvas no banco de dados.</span></p><div>{data.status === 'inscricoes' && <button type="button" className="btn btn--ghost" onClick={() => setDialog('inscricao')}>+ Inscrever equipes</button>}{data.status !== 'finalizado' && <button type="button" className="btn btn--accent" disabled={!canPair} title={!canPair ? 'Inscreva duas equipes da mesma divisão para agendar.' : undefined} onClick={() => setDialog('jogo')}>+ Agendar jogo</button>}</div>{!canPair && data.status !== 'finalizado' && <small>Inscreva pelo menos duas equipes da mesma divisão para começar a tabela.</small>}</div>}

      <div className="competition-division-bar"><span>EM DISPUTA</span><div role="group" aria-label="Divisão do campeonato">{data.standings.map((s) => <button type="button" key={divisionKey(s.division)} aria-pressed={s === selected} onClick={() => filter('divisao', divisionKey(s.division))}>{divisionLabel(s.division)}</button>)}</div></div>

      <div className="competition-detail-stats"><div><span>Divisão selecionada</span><b>{selected ? divisionLabel(selected.division) : 'Nenhuma divisão'}</b></div><div><span>Equipes inscritas</span><b>{selected?.rows.length ?? 0}</b></div><div><span>Partidas encerradas</span><b>{finished.length}</b></div><div><span>Em quadra / agendadas</span><b>{divisionGames.length - finished.length}</b></div></div>

      <nav className="competition-detail-tabs" aria-label="Informações do campeonato">{[['classificacao', 'Classificação'], ['jogos', 'Tabela de jogos'], ['equipes', 'Equipes inscritas']].map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => filter('aba', key)}>{label}</button>)}</nav>

      {tab === 'classificacao' && <div className="competition-classification-grid"><section className="competition-panel"><div className="competition-panel-heading"><h2>O caminho até o título.</h2><span>{selected && divisionLabel(selected.division)}</span></div><p className="competition-panel-intro">A campanha de cada equipe, atualizada pelos jogos encerrados.</p>{selected?.rows.length ? <StandingsTable winRate={data.standingsMode === 'win-rate'} rows={selected.rows} ownTeamId={user?.teamId} /> : <div className="competition-empty"><h3>A disputa começa com as equipes.</h3><p>Nenhuma equipe inscrita nesta divisão.</p></div>}<div className="competition-rules">{data.standingsMode === 'win-rate' ? <><b>Campanha na temporada selecionada</b><p>Percentual de vitórias nos jogos importados desta temporada. Não representa ranking, chaveamento ou critério oficial da NCAA. Desempates de exibição: vitórias, saldo e pontos feitos.</p></> : <><b>Como funciona a classificação</b><p>Vitória: 2 pontos · Derrota: 1 ponto. Apenas jogos encerrados deste campeonato.</p><p>Desempates: vitórias, saldo e pontos feitos. J = jogos · V = vitórias · D = derrotas · PF/PC = pontos feitos/contra.</p></>}</div></section><aside className="competition-division-aside"><div className="competition-next-game"><span className="eyebrow">{nextGame?.status === 'ao-vivo' ? 'A BOLA ESTÁ EM JOGO' : 'PRÓXIMA BOLA AO ALTO'}</span>{nextGame ? <><div className="competition-next-game__teams"><Crest team={nextGame.home} large /><span>{nextGame.status === 'ao-vivo' ? `${nextGame.homeScore} – ${nextGame.awayScore}` : 'VS'}</span><Crest team={nextGame.away} large /></div><h3>{nextGame.home.club.name}<small>× {nextGame.away.club.name}</small></h3><p>{formatGameDay(nextGame.date, DEMO_TODAY)} · {nextGame.time}</p><p>{nextGame.venue}</p><button type="button" className="btn" onClick={() => filter('aba', 'jogos')}>Ver tabela de jogos ↗</button></> : <><Icon name="calendar" /><h3>{data.status === 'finalizado' ? 'Disputa encerrada.' : 'O próximo jogo vem aí.'}</h3><p>{data.status === 'finalizado' ? 'Confira os resultados registrados na tabela de jogos.' : 'Aguardando jogos agendados para esta divisão.'}</p></>}</div><div className="competition-aside-note"><b>Cada categoria tem sua disputa.</b><p>As equipes são classificadas apenas dentro da mesma categoria e gênero.</p></div></aside></div>}

      {tab === 'jogos' && <section className="competition-panel"><div className="competition-panel-heading"><h2>Cada jogo conta.</h2><span>{divisionGames.length} partidas na divisão</span></div><div className="competition-game-filters" role="group" aria-label="Situação dos jogos">{[['', 'Todos'], ['agendado', 'Agendados'], ['ao-vivo', 'Ao vivo'], ['encerrado', 'Encerrados'], ['adiado', 'Adiados']].map(([key, label]) => <button type="button" className="chip" key={key} aria-pressed={gameStatus === key} onClick={() => filter('jogos', key)}>{label}</button>)}</div><div className="competition-games-grid">{visibleGames.slice(0, shown).map((g) => <GameCard key={g.id} game={g} />)}</div><LoadMore shown={shown} total={visibleGames.length} onMore={() => setShown((n) => n + 60)} />{!visibleGames.length && <div className="competition-empty"><Icon name="calendar" /><h3>Nenhum jogo nesta seleção.</h3><p>{data.status === 'finalizado' ? 'Não há partidas registradas para este filtro no histórico da demonstração.' : 'Os jogos aparecem aqui assim que o organizador preparar a tabela.'}</p></div>}</section>}

      {tab === 'equipes' && <section className="competition-panel"><div className="competition-panel-heading"><h2>Quem entra em quadra.</h2><span>{selected?.rows.length ?? 0} equipes nesta divisão</span></div><div className="competition-enrolled-grid">{selected?.rows.map(({ team, played, wins, losses }) => <Link to={`/times/${team.id}`} key={team.id} className="competition-enrolled-card"><Crest team={team} large /><div><h3>{team.club.name}</h3><p>{team.name}</p><small>{team.club.city}</small></div><div className="competition-enrolled-record"><b>{wins}–{losses}</b><small>{played} jogos neste campeonato</small></div><span aria-hidden="true">↗</span></Link>)}</div>{!selected?.rows.length && <div className="competition-empty"><h3>Seu campeonato está tomando forma.</h3><p>{manager && data.status === 'inscricoes' ? 'Use “Inscrever equipes” para adicionar participantes desta divisão.' : 'Aguardando inscrições nesta divisão.'}</p></div>}</section>}

      <p className="competition-demo-note">Base {data.season ?? DATA_SEASON} · Classificação calculada apenas com resultados deste campeonato.</p>
      {user && dialog === 'inscricao' && <EnrollTeamsDialog user={user} competition={data} onClose={() => setDialog(null)} onChanged={refresh} />}
      {user && dialog === 'jogo' && <GameDialog user={user} kind="oficial" defaultDate={DEMO_TODAY} defaultCompetitionId={data.id} onClose={() => setDialog(null)} onChanged={refresh} />}
    </div>
  )
}
