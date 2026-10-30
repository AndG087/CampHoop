import { Link, useSearchParams } from 'react-router'
import { listCompetitions } from '../api/public'
import { listTeamSummaries } from '../api/teams'
import type { Category, Gender, TeamSummary } from '../api/types'
import { useApi } from '../api/useApi'
import { Can } from '../auth/guards'
import { useSession } from '../auth/session'
import './TeamsPage.css'

const GENDERS: Gender[] = ['Feminino', 'Masculino', 'Misto']
/** Ordem das seções: da categoria mais velha para a mais nova. */
const CATEGORIES: Category[] = ['Sub-17', 'Sub-15', 'Sub-13']

function TeamCard({ summary, mine }: { summary: TeamSummary; mine: boolean }) {
  const { team } = summary
  return (
    <Link to={`/times/${team.id}`} className={`card team-card${mine ? ' team-card--mine' : ''}`}>
      <div className="team-card__cover">
        <span className="team-card__crest" aria-hidden="true">{team.club.shortName}</span>
        {mine && <span className="pill">SUA EQUIPE</span>}
      </div>
      <div className="team-card__info">
        <h3>{team.club.name}</h3>
        <p>{team.name} · {team.club.city}</p>
        <div className="team-card__meta">
          <span>{summary.athletes} {summary.athletes === 1 ? 'atleta' : 'atletas'}</span>
          <span>Campanha <b>{summary.wins}–{summary.losses}</b></span>
        </div>
        {summary.competitions.length > 0 && (
          <p className="team-card__comps">{summary.competitions.map((c) => c.name).join(' · ')}</p>
        )}
        <span className="team-card__open">Abrir equipe →</span>
      </div>
    </Link>
  )
}

export default function TeamsPage() {
  const { user } = useSession()
  const [params, setParams] = useSearchParams()
  const competitionId = params.get('campeonato') ?? ''
  const gender = params.get('genero') ?? ''
  const clubId = params.get('clube') ?? ''
  const { data, loading, error } = useApi(listTeamSummaries, 'teams:summaries')
  const competitions = useApi(listCompetitions, 'public:competitions')

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const clubs = [...new Map((data ?? []).map((s) => [s.team.club.id, s.team.club])).values()]
  const visible = (data ?? [])
    .filter(
      (s) =>
        (!competitionId || s.competitions.some((c) => c.id === competitionId)) &&
        (!gender || s.team.gender === gender) &&
        (!clubId || s.team.club.id === clubId),
    )
    // Dentro de cada seção, a equipe do usuário vem primeiro.
    .sort((a, b) => Number(b.team.id === user?.teamId) - Number(a.team.id === user?.teamId))
  const sections = CATEGORIES.map((category) => ({ category, teams: visible.filter((s) => s.team.category === category) })).filter(
    (section) => section.teams.length > 0,
  )
  const selected = competitions.data?.find((c) => c.id === competitionId)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">CENTRAL DE OPERAÇÕES · 2025/26</div>
          <h1>Times</h1>
          <p>Equipes por campeonato e categoria, com elenco e desempenho.</p>
        </div>
        <Can permission="team.manage">
          <button type="button" className="btn btn--accent" title="Cadastro de equipes chega com o backend.">
            + Criar equipe
          </button>
        </Can>
      </div>

      <nav className="comp-tabs" aria-label="Campeonato">
        <button type="button" aria-pressed={!competitionId} onClick={() => setFilter('campeonato', '')}>
          Todos os campeonatos
        </button>
        {competitions.data?.map((c) => (
          <button key={c.id} type="button" aria-pressed={competitionId === c.id} onClick={() => setFilter('campeonato', c.id)}>
            {c.name}
          </button>
        ))}
      </nav>
      {selected && (
        <p className="comp-note muted">
          {selected.phase} · {selected.categories} · {selected.note}
        </p>
      )}

      <div className="team-filters">
        <div className="chips" role="group" aria-label="Gênero">
          <button type="button" className="chip" aria-pressed={!gender} onClick={() => setFilter('genero', '')}>
            Todos
          </button>
          {GENDERS.map((g) => (
            <button key={g} type="button" className="chip" aria-pressed={gender === g} onClick={() => setFilter('genero', g)}>
              {g}
            </button>
          ))}
        </div>
        <select className="team-filters__club" aria-label="Clube" value={clubId} onChange={(e) => setFilter('clube', e.target.value)}>
          <option value="">Todos os clubes</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {loading && <p className="muted">Carregando equipes…</p>}
      {error && <p className="muted">Não foi possível carregar as equipes. Recarregue a página.</p>}
      {data && sections.length === 0 && <p className="muted">Nenhuma equipe com esses filtros.</p>}

      {sections.map((section) => (
        <section key={section.category} className="team-section" aria-labelledby={`cat-${section.category}`}>
          <h2 id={`cat-${section.category}`} className="team-section__title">
            {section.category}
            <span>{section.teams.length} {section.teams.length === 1 ? 'equipe' : 'equipes'}</span>
          </h2>
          <div className="team-grid">
            {section.teams.map((s) => (
              <TeamCard key={s.team.id} summary={s} mine={s.team.id === user?.teamId} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
