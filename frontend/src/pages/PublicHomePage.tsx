import { Link } from 'react-router'
import { DEMO_TODAY } from '../api/mock/data'
import { listCompetitions, listPublicGames } from '../api/public'
import type { Competition, PublicGame, Team } from '../api/types'
import { useApi } from '../api/useApi'
import { Brand } from '../layout/AppShell'
import { formatGameDay, formatShortDate } from '../format'
import './PublicHomePage.css'

const STATUS_LABEL: Record<Competition['status'], string> = {
  'em-andamento': 'EM ANDAMENTO',
  inscricoes: 'INSCRIÇÕES ABERTAS',
  finalizado: 'FINALIZADO',
}

function TeamLine({ team, score, winner }: { team: Team; score: number | null; winner?: boolean }) {
  return (
    <div className={`game__team${winner === false ? ' game__team--lost' : ''}`}>
      <span className="crest" aria-hidden="true">{team.club.shortName}</span>
      <span className="game__name">
        {team.club.name}
        <small>{team.name}</small>
      </span>
      {score !== null && <b className="game__score">{score}</b>}
    </div>
  )
}

function LiveGame({ game }: { game: PublicGame }) {
  return (
    <article className="live">
      <div className="live__meta">
        <span className="live__badge">AO VIVO</span>
        <span>{game.competition} · {game.venue}</span>
      </div>
      <div className="live__board">
        <div className="live__side">
          <span className="crest crest--on-dark" aria-hidden="true">{game.home.club.shortName}</span>
          <b>{game.home.club.name}</b>
          <small>{game.home.name}</small>
        </div>
        <div className="live__score">
          <div>{game.homeScore} <span>—</span> {game.awayScore}</div>
          <small>{game.period?.toUpperCase()}</small>
        </div>
        <div className="live__side">
          <span className="crest crest--on-dark" aria-hidden="true">{game.away.club.shortName}</span>
          <b>{game.away.club.name}</b>
          <small>{game.away.name}</small>
        </div>
      </div>
    </article>
  )
}

export default function PublicHomePage() {
  const competitions = useApi(listCompetitions, 'public:competitions')
  const games = useApi(listPublicGames, 'public:games')
  const running = (competitions.data ?? []).filter((c) => c.status !== 'finalizado')
  const finished = (competitions.data ?? []).filter((c) => c.status === 'finalizado')

  return (
    <div className="public">
      <header className="public__bar">
        <div className="public__inner public__bar-inner">
          <Link to="/" aria-label="CampHoop, início">
            <Brand />
          </Link>
          <Link to="/login" className="btn btn--accent public__login">Login</Link>
        </div>
      </header>

      <main className="public__inner public__main">
        <section className="public__intro">
          <div className="eyebrow">BASQUETE ESCOLAR E DE BASE</div>
          <h1>Torneios e jogos, abertos a todos.</h1>
          <p>Acompanhe placares, próximos jogos e resultados das equipes, sem precisar de conta.</p>
        </section>

        {games.data?.live.map((g) => <LiveGame key={g.id} game={g} />)}

        <section aria-labelledby="torneios">
          <h2 id="torneios" className="public__title">Torneios</h2>
          {competitions.loading && <p className="muted">Carregando torneios…</p>}
          <div className="tournaments">
            {[...running, ...finished].map((c) => (
              <article key={c.id} className={`card tournament${c.status === 'finalizado' ? ' tournament--done' : ''}`}>
                <span className={`pill${c.status === 'finalizado' ? ' pill--muted' : ''}`}>{STATUS_LABEL[c.status]}</span>
                <h3>{c.name}</h3>
                <p className="muted">{c.phase} · {c.categories}</p>
                <div className="tournament__foot">
                  <span>{c.teams} equipes</span>
                  <b>{c.note}</b>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="games-cols">
          <section aria-labelledby="proximos">
            <h2 id="proximos" className="public__title">Próximos jogos</h2>
            <div className="card games">
              {games.loading && <p className="muted">Carregando jogos…</p>}
              {games.data?.upcoming.map((g) => (
                <article key={g.id} className="game">
                  <div className="game__when">
                    <b>{formatGameDay(g.date, DEMO_TODAY)} · {g.time}</b>
                    <span>{g.competition} · {g.venue}</span>
                  </div>
                  <TeamLine team={g.home} score={null} />
                  <TeamLine team={g.away} score={null} />
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="resultados">
            <h2 id="resultados" className="public__title">Resultados recentes</h2>
            <div className="card games">
              {games.loading && <p className="muted">Carregando resultados…</p>}
              {games.data?.results.map((g) => {
                const homeWon = (g.homeScore ?? 0) > (g.awayScore ?? 0)
                return (
                  <article key={g.id} className="game">
                    <div className="game__when">
                      <b>{formatShortDate(g.date)}</b>
                      <span>Encerrado</span>
                    </div>
                    <TeamLine team={g.home} score={g.homeScore} winner={homeWon} />
                    <TeamLine team={g.away} score={g.awayScore} winner={!homeWon} />
                  </article>
                )
              })}
            </div>
          </section>
        </div>
      </main>

      <footer className="public__inner public__foot">© 2025 CampHoop · Protótipo demonstrativo com dados fictícios</footer>
    </div>
  )
}
