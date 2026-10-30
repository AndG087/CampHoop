import { Link, useParams } from 'react-router'
import { DEMO_TODAY } from '../api/mock/data'
import { getTeam } from '../api/teams'
import type { PublicGame } from '../api/types'
import { useApi } from '../api/useApi'
import { canEditTeam } from '../auth/access'
import { useSession } from '../auth/session'
import Avatar from '../components/Avatar'
import { formatAverage, formatGameDay, formatShortDate } from '../format'
import './TeamPage.css'

/** Resultado do ponto de vista da equipe: adversário, mando, V/D e placar. */
function ResultRow({ game, teamId }: { game: PublicGame; teamId: string }) {
  const home = game.home.id === teamId
  const opponent = home ? game.away : game.home
  const scored = (home ? game.homeScore : game.awayScore) ?? 0
  const allowed = (home ? game.awayScore : game.homeScore) ?? 0
  const won = scored > allowed
  return (
    <li className="result">
      <span className="result__date">{formatShortDate(game.date)}</span>
      <span className="result__opp">
        {home ? 'vs' : '@'} {opponent.club.name}
      </span>
      <span className={`pill${won ? '' : ' pill--muted'}`}>
        {scored}–{allowed} · {won ? 'V' : 'D'}
      </span>
    </li>
  )
}

export default function TeamPage() {
  const { teamId = '' } = useParams()
  const { user } = useSession()
  const { data: team, loading, error } = useApi(() => getTeam(teamId), `team:${teamId}`)

  if (loading) return <p className="muted">Carregando equipe…</p>
  if (error) return <p className="muted">Não foi possível carregar a equipe. Recarregue a página.</p>
  if (!team) {
    return (
      <div className="page-head">
        <div>
          <div className="eyebrow">TIMES</div>
          <h1>Equipe não encontrada</h1>
          <p>
            Essa equipe não existe ou foi removida. <Link to="/times" style={{ fontWeight: 700 }}>Ver todas as equipes →</Link>
          </p>
        </div>
      </div>
    )
  }

  const { club } = team.team
  const next = team.nextGame
  const nextOpponent = next ? (next.home.id === team.team.id ? next.away : next.home) : null

  return (
    <>
      <Link to="/times" className="back-link">← Times</Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">{user?.teamId === team.team.id ? 'SUA EQUIPE' : 'PERFIL DA EQUIPE'} · TEMPORADA 2025/26</div>
          <h1>{team.team.name}</h1>
          <p>{club.name} · {club.city}</p>
        </div>
        {canEditTeam(user, team.team.id) && (
          <button type="button" className="btn btn--ghost" title="Edição chega com o backend.">
            Editar equipe
          </button>
        )}
      </div>

      <section className="team-hero">
        <div className="team-hero__id">
          <span className="team-hero__crest" aria-hidden="true">{club.shortName}</span>
          <div>
            <div className="eyebrow team-hero__eyebrow">{club.name.toUpperCase()} · {team.team.category.toUpperCase()}</div>
            <h2>{team.team.name}</h2>
            <p>Técnico(a): {team.coach} · {team.athletes} {team.athletes === 1 ? 'atleta cadastrado' : 'atletas cadastrados'}</p>
            {team.competitions.length > 0 && (
              <p className="team-hero__comps">
                {team.competitions.map((c) => (
                  <Link key={c.id} to={`/times?campeonato=${c.id}`}>{c.name}</Link>
                ))}
              </p>
            )}
          </div>
        </div>
        <div className="team-hero__record">
          <b>{team.wins}–{team.losses}</b>
          <span>CAMPANHA</span>
        </div>
      </section>

      <h2 className="section-title">Resumo da temporada</h2>
      <div className="stat-grid">
        <div className="card stat">
          <span className="stat__label">Pontos por jogo</span>
          <strong>{formatAverage(team.pointsFor)}</strong>
        </div>
        <div className="card stat">
          <span className="stat__label">Pontos sofridos por jogo</span>
          <strong>{formatAverage(team.pointsAgainst)}</strong>
        </div>
        <div className="card stat">
          <span className="stat__label">Saldo por jogo</span>
          <strong>
            {team.pointDiff > 0 ? '+' : ''}
            {formatAverage(team.pointDiff)}
          </strong>
        </div>
        <div className="card stat">
          <span className="stat__label">Aproveitamento</span>
          <strong>{team.winRate}%</strong>
        </div>
      </div>
      <p className="stat-foot muted">
        Calculado de {team.games} {team.games === 1 ? 'jogo encerrado' : 'jogos encerrados'}.
      </p>

      <div className="team-cols">
        <section>
          <h2 className="section-title">Elenco</h2>
          <div className="card roster">
            {team.roster.length === 0 ? (
              <p className="muted roster__empty">Nenhum atleta cadastrado nesta equipe.</p>
            ) : (
              <ul>
                {team.roster.map((a) => (
                  <li key={a.id}>
                    <Link to={`/atletas/${a.id}`} className="roster__row">
                      <Avatar name={a.name} photoUrl={a.photoUrl} />
                      <span className="roster__name">
                        <b>{a.name}</b>
                        <small>#{a.number} · {a.position}</small>
                      </span>
                      <span className="roster__ppg">{a.games ? `${formatAverage(a.pointsPerGame)} PTS/J` : '–'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="section-title">Próximo jogo</h2>
          <div className="card next-game">
            {next && nextOpponent ? (
              <>
                <b>{formatGameDay(next.date, DEMO_TODAY)} · {next.time}</b>
                <span className="next-game__opp">
                  {next.home.id === team.team.id ? 'vs' : '@'} {nextOpponent.club.name} · {nextOpponent.name}
                </span>
                <span className="muted">{next.competition} · {next.venue}</span>
                {next.status === 'ao-vivo' && <span className="pill pill--live">AO VIVO · {next.homeScore}–{next.awayScore}</span>}
              </>
            ) : (
              <span className="muted">Nenhum jogo agendado.</span>
            )}
          </div>

          <h2 className="section-title">Últimos resultados</h2>
          <div className="card">
            {team.recentGames.length === 0 ? (
              <p className="muted roster__empty">Ainda sem jogos encerrados.</p>
            ) : (
              <ul className="results">
                {team.recentGames.map((g) => (
                  <ResultRow key={g.id} game={g} teamId={team.team.id} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
