import { Link, useNavigate, useSearchParams } from 'react-router'
import { listAthletes, listTeams } from '../api/athletes'
import type { AthleteSummary, Category } from '../api/types'
import { useApi } from '../api/useApi'
import { isOwnAthlete } from '../auth/access'
import { Can } from '../auth/guards'
import { useSession } from '../auth/session'
import Avatar from '../components/Avatar'
import { STATUS_LABEL, formatAverage } from '../format'
import './AthletesPage.css'

const CATEGORIES: Category[] = ['Sub-13', 'Sub-15', 'Sub-17']

/** Busca sem diferenciar maiúsculas nem acentos: "julia" encontra "Júlia". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export default function AthletesPage() {
  const { user } = useSession()
  const navigate = useNavigate()
  // Filtros ficam no endereço: voltar do perfil mantém a busca.
  const [params, setParams] = useSearchParams()
  const query = params.get('busca') ?? ''
  const category = params.get('categoria') ?? ''
  const teamId = params.get('equipe') ?? ''

  const athletes = useApi(listAthletes, 'athletes')
  const teams = useApi(listTeams, 'teams')

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // Equipe de outra categoria não combina com a categoria escolhida.
    if (key === 'categoria') next.delete('equipe')
    setParams(next, { replace: true })
  }

  const teamOptions = (teams.data ?? []).filter((t) => !category || t.category === category)
  const needle = normalize(query.trim())
  const visible = (athletes.data ?? []).filter(
    (a: AthleteSummary) =>
      (!needle || normalize(a.name).includes(needle)) &&
      (!category || a.team.category === category) &&
      (!teamId || a.team.id === teamId),
  )
  const hasFilters = !!(query || category || teamId)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">CENTRAL DE OPERAÇÕES · 2025/26</div>
          <h1>Atletas</h1>
          <p>Elenco, desenvolvimento e desempenho individual.</p>
        </div>
        <Can permission="athlete.manage">
          <button type="button" className="btn btn--accent" title="Cadastro de atletas chega com o backend.">
            + Adicionar atleta
          </button>
        </Can>
      </div>

      {user?.athleteId && (
        <Link to={`/atletas/${user.athleteId}`} className="card own-profile">
          <span>
            <b>Seu perfil de atleta</b>
            <span className="muted"> · estatísticas, dados pessoais e objetivo de treino</span>
          </span>
          <span className="own-profile__go">Ver meu perfil →</span>
        </Link>
      )}

      <div className="athlete-filters" role="search">
        <input
          className="athlete-filters__search"
          type="search"
          placeholder="Buscar atleta pelo nome"
          aria-label="Buscar atleta pelo nome"
          value={query}
          onChange={(e) => setFilter('busca', e.target.value)}
        />
        <div className="chips" role="group" aria-label="Categoria">
          <button type="button" className="chip" aria-pressed={!category} onClick={() => setFilter('categoria', '')}>
            Todas
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setFilter('categoria', c)}>
              {c}
            </button>
          ))}
        </div>
        <select className="athlete-filters__team" aria-label="Equipe" value={teamId} onChange={(e) => setFilter('equipe', e.target.value)}>
          <option value="">Todas as equipes</option>
          {teamOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.club.name} · {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card athlete-table">
        {athletes.loading && <p className="table-state">Carregando atletas…</p>}
        {athletes.error && <p className="table-state">Não foi possível carregar os atletas. Recarregue a página.</p>}
        {athletes.data && (
          <>
            <p className="table-count muted">
              {visible.length} {visible.length === 1 ? 'atleta' : 'atletas'}
              {hasFilters && (
                <>
                  {' · '}
                  <button type="button" className="link-button" onClick={() => setParams({}, { replace: true })}>
                    Limpar filtros
                  </button>
                </>
              )}
            </p>
            {visible.length === 0 ? (
              <p className="table-state">Nenhum atleta encontrado com esses filtros.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Atleta</th>
                      <th>Equipe</th>
                      <th className="hide-sm">Posição</th>
                      <th className="num hide-sm">Nº</th>
                      <th className="num">Idade</th>
                      <th className="num hide-sm">J</th>
                      <th className="num">PTS/J</th>
                      <th className="hide-sm">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((a) => (
                      <tr key={a.id} className="athlete-row" onClick={() => navigate(`/atletas/${a.id}`)}>
                        <td>
                          <span className="athlete-cell">
                            <Avatar name={a.name} photoUrl={a.photoUrl} />
                            <Link to={`/atletas/${a.id}`} onClick={(e) => e.stopPropagation()}>
                              {a.name}
                            </Link>
                            {isOwnAthlete(user, { id: a.id, teamId: a.team.id }) && <span className="pill">VOCÊ</span>}
                          </span>
                        </td>
                        <td className="nowrap">
                          {a.team.name}
                          <small className="club-name">{a.team.club.name}</small>
                        </td>
                        <td className="nowrap hide-sm">{a.position}</td>
                        <td className="num hide-sm">{a.number}</td>
                        <td className="num">{a.age}</td>
                        <td className="num hide-sm">{a.games}</td>
                        <td className="num">
                          <b>{a.games ? formatAverage(a.pointsPerGame) : '–'}</b>
                        </td>
                        <td className="hide-sm">
                          <span className={`pill${a.status === 'ativo' ? '' : a.status === 'lesionado' ? ' pill--warn' : ' pill--muted'}`}>
                            {STATUS_LABEL[a.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
