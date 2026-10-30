import { Link, useParams } from 'react-router'
import { getAthlete } from '../api/athletes'
import { useApi } from '../api/useApi'
import { canEditAthlete, isOwnAthlete } from '../auth/access'
import { useSession } from '../auth/session'
import Avatar from '../components/Avatar'
import { STATUS_LABEL, formatAverage, formatDate, formatHeight, formatMonthYear, formatShortDate } from '../format'
import './AthletePage.css'

function LockNote({ own }: { own: boolean }) {
  return (
    <p className="lock-note">
      <span aria-hidden="true">🔒</span> {own ? 'Visível só para você e a comissão técnica da sua equipe.' : 'Visível só para a comissão técnica e a própria atleta.'}
    </p>
  )
}

export default function AthletePage() {
  const { athleteId = '' } = useParams()
  const { user } = useSession()
  const { data: athlete, loading, error } = useApi(() => getAthlete(athleteId, user), `athlete:${athleteId}:${user?.id}`)

  if (loading) return <p className="muted">Carregando perfil…</p>
  if (error) return <p className="muted">Não foi possível carregar o perfil. Recarregue a página.</p>
  if (!athlete) {
    return (
      <div className="page-head">
        <div>
          <div className="eyebrow">ATLETAS</div>
          <h1>Atleta não encontrado</h1>
          <p>
            Esse perfil não existe ou foi removido. <Link to="/atletas" style={{ fontWeight: 700 }}>Ver todos os atletas →</Link>
          </p>
        </div>
      </div>
    )
  }

  const ref = { id: athlete.id, teamId: athlete.team.id }
  const own = isOwnAthlete(user, ref)
  const statusClass = athlete.status === 'ativo' ? '' : athlete.status === 'lesionado' ? ' pill--warn' : ' pill--muted'

  return (
    <>
      <Link to="/atletas" className="back-link">← Atletas</Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">{own ? 'SEU PERFIL' : 'PERFIL DE ATLETA'}</div>
          <h1>{athlete.name}</h1>
          <p>
            {athlete.team.club.name} · {athlete.team.name} · #{athlete.number}
          </p>
        </div>
        {canEditAthlete(user, ref) && (
          <button type="button" className="btn btn--ghost" title="Edição chega com o backend.">
            Editar perfil
          </button>
        )}
      </div>

      <div className="athlete-layout">
        <aside className="card athlete-card">
          <Avatar name={athlete.name} photoUrl={athlete.photoUrl} size="lg" />
          <h2>{athlete.name}</h2>
          <p className="muted">{athlete.position} · #{athlete.number}</p>
          <span className={`pill${statusClass}`}>{STATUS_LABEL[athlete.status]}</span>
          <dl className="facts">
            <div><dt>Idade</dt><dd>{athlete.age} anos</dd></div>
            <div><dt>Altura</dt><dd>{formatHeight(athlete.heightCm)}</dd></div>
            <div><dt>Equipe</dt><dd><Link to={`/times/${athlete.team.id}`} className="facts__link">{athlete.team.name}</Link></dd></div>
            <div><dt>Clube</dt><dd>{athlete.team.club.name}</dd></div>
            <div><dt>No clube desde</dt><dd>{formatMonthYear(athlete.memberSince)}</dd></div>
            {athlete.private && (
              <div className="facts__private"><dt>Nascimento 🔒</dt><dd>{formatDate(athlete.private.birthDate)}</dd></div>
            )}
          </dl>
        </aside>

        <div className="athlete-main">
          <div className="stat-grid">
            <div className="card stat">
              <span className="stat__label">Pontos por jogo</span>
              <strong>{formatAverage(athlete.pointsPerGame)}</strong>
            </div>
            <div className="card stat">
              <span className="stat__label">Rebotes por jogo</span>
              <strong>{formatAverage(athlete.reboundsPerGame)}</strong>
            </div>
            <div className="card stat">
              <span className="stat__label">Assistências por jogo</span>
              <strong>{formatAverage(athlete.assistsPerGame)}</strong>
            </div>
          </div>
          <p className="stat-foot muted">
            Médias de {athlete.games} {athlete.games === 1 ? 'jogo' : 'jogos'} na temporada 2025/26.
          </p>

          <h2 className="section-title">Desempenho recente</h2>
          <div className="card">
            {athlete.recentGames.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>Ainda sem jogos registrados nesta temporada.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Jogo</th>
                      <th className="num">PTS</th>
                      <th className="num">REB</th>
                      <th className="num">AST</th>
                      <th className="num">MIN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {athlete.recentGames.map((g) => (
                      <tr key={g.matchId}>
                        <td className="nowrap">{formatShortDate(g.date)}</td>
                        <td className="nowrap">{g.home ? 'vs' : '@'} {g.opponent.name}</td>
                        <td className="num"><b>{g.points}</b></td>
                        <td className="num">{g.rebounds}</td>
                        <td className="num">{g.assists}</td>
                        <td className="num">{g.minutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {athlete.private && (
        <>
          <h2 className="section-title">Desenvolvimento</h2>
          <div className="card development">
            {athlete.private.development ? (
              <>
                <div className="eyebrow">OBJETIVO DE TREINO</div>
                <p className="development__goal">{athlete.private.development.goal}</p>
                <div className="progress" role="progressbar" aria-valuenow={athlete.private.development.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do objetivo">
                  <div style={{ width: `${athlete.private.development.progress}%` }} />
                </div>
                <p className="muted development__meta">
                  Progresso {athlete.private.development.progress}% · revisão em {formatDate(athlete.private.development.reviewDate)}
                </p>
              </>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>Nenhum objetivo de treino definido ainda.</p>
            )}
            <LockNote own={own} />
          </div>
        </>
      )}
    </>
  )
}
