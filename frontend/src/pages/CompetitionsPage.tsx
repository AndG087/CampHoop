import { DATA_SEASON } from '../api/client'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { listCompetitions } from '../api/public'
import type { CompetitionStatus } from '../api/types'
import { useApi } from '../api/useApi'
import { canManageCompetition } from '../auth/access'
import { useSession } from '../auth/session'
import { CreateCompetitionDialog } from './CompetitionDialogs'
import { Icon } from './HomeWidgets'
import './CompetitionsPage.css'

export const COMPETITION_STATUS: Record<CompetitionStatus, string> = {
  'em-andamento': 'Em andamento', inscricoes: 'Inscrições abertas', finalizado: 'Finalizado',
}

export function TrophyArt() {
  return (
    <svg className="competition-trophy-art" viewBox="0 0 260 260" fill="none" aria-hidden="true">
      <circle cx="130" cy="130" r="112" stroke="currentColor" strokeOpacity=".12" />
      <circle cx="130" cy="130" r="87" stroke="currentColor" strokeOpacity=".15" strokeDasharray="2 8" />
      <path d="M87 65h86v60a43 43 0 0 1-86 0V65Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="3" />
      <path d="M87 80H63v18a36 36 0 0 0 31 36M173 80h24v18a36 36 0 0 1-31 36M130 168v34M104 204h52M98 216h64" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="m130 86 6 13 15 2-11 10 3 15-13-7-13 7 3-15-11-10 15-2 6-13Z" fill="currentColor" />
      <path d="M38 151h14M45 144v14M202 45h14M209 38v14M194 180l8 8M202 180l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function CompetitionsPage() {
  const { user, can } = useSession()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [retry, setRetry] = useState(0)
  const { data, loading, error } = useApi(listCompetitions, `competitions:${retry}`)
  const query = params.get('busca') ?? ''
  const status = params.get('status') ?? ''
  const category = params.get('categoria') ?? ''
  const mine = params.get('organizo') === 'sim'
  const competitions = data ?? []
  const visible = competitions.filter((c) => c.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')) && (!status || c.status === status) && (!category || c.divisions.some((d) => d.category === category)) && (!mine || canManageCompetition(user, c)))
  const featured = competitions.find((c) => c.status === 'em-andamento') ?? competitions[0]

  function filter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <div className="competitions-page">
      <header className="competition-page-heading">
        <div><div className="eyebrow">A TEMPORADA ACONTECE AQUI · {DATA_SEASON}</div><h1>Mais que um jogo<span>.</span></h1><p>Os campeonatos, as equipes e cada passo até o título.</p></div>
        {can('competition.manage') && <button type="button" className="btn btn--accent" onClick={() => setCreating(true)}>+ Criar campeonato</button>}
      </header>

      {featured && (
        <section className="competition-feature" aria-label="Campeonato em destaque">
          <div><span className={`competition-status competition-status--${featured.status}`}>{COMPETITION_STATUS[featured.status]}</span><div className="eyebrow">BASQUETE DE BASE · DESTAQUE DA TEMPORADA</div><h2>{featured.name}</h2><p>{featured.phase} · {featured.categories}</p><Link to={`/campeonatos/${featured.id}`} className="btn btn--accent">Explorar campeonato <Icon name="arrow" /></Link></div>
          <TrophyArt />
          <div className="competition-feature__numbers"><div><strong>{featured.teams.toString().padStart(2, '0')}</strong><span>equipes inscritas</span></div><div><strong>{featured.divisions.length.toString().padStart(2, '0')}</strong><span>divisões em disputa</span></div><p>{featured.note}</p></div>
        </section>
      )}

      <div className="competition-summary" aria-label="Resumo dos campeonatos">
        {(['em-andamento', 'inscricoes', 'finalizado'] as const).map((s) => <button type="button" key={s} aria-pressed={status === s} onClick={() => filter('status', status === s ? '' : s)}><span className={`competition-dot competition-dot--${s}`} /><strong>{competitions.filter((c) => c.status === s).length.toString().padStart(2, '0')}</strong><span>{COMPETITION_STATUS[s]}</span><Icon name="arrow" /></button>)}
      </div>

      <div className="competition-list-heading"><h2>Explore os campeonatos <span>{visible.length}</span></h2>{can('competition.manage') && <label className="competition-mine"><input type="checkbox" checked={mine} onChange={(e) => filter('organizo', e.target.checked ? 'sim' : '')} /> Que eu organizo</label>}</div>
      <div className="competition-filters">
        <input type="search" aria-label="Buscar campeonato" placeholder="Buscar campeonato…" value={query} onChange={(e) => filter('busca', e.target.value)} />
        <select aria-label="Situação do campeonato" value={status} onChange={(e) => filter('status', e.target.value)}><option value="">Todas as situações</option>{Object.entries(COMPETITION_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select aria-label="Categoria do campeonato" value={category} onChange={(e) => filter('categoria', e.target.value)}><option value="">Todas as categorias</option>{['Universitário', 'Sub-17', 'Sub-15', 'Sub-13'].map((c) => <option key={c}>{c}</option>)}</select>
      </div>

      {loading && <p className="muted" role="status">Carregando campeonatos…</p>}
      {error && <div className="card" role="alert"><p>Não foi possível carregar os campeonatos.</p><button type="button" className="btn btn--ghost" onClick={() => setRetry((v) => v + 1)}>Tentar novamente</button></div>}
      {!loading && !error && !visible.length && <div className="competition-empty"><Icon name="trophy" /><h3>Nenhum campeonato por aqui.</h3><p>Tente outros filtros para encontrar seu próximo desafio.</p><button type="button" className="btn btn--ghost" onClick={() => setParams({})}>Limpar filtros</button></div>}
      <div className="competition-grid">
        {visible.map((c) => <Link to={`/campeonatos/${c.id}`} className={`competition-card competition-card--${c.status}`} key={c.id}>
          <div className="competition-card__cover"><span className={`competition-status competition-status--${c.status}`}>{COMPETITION_STATUS[c.status]}</span><Icon name="trophy" /><span className="competition-card__season">CAMPHOOP · {c.season ?? DATA_SEASON}</span></div>
          <div className="competition-card__body"><div className="eyebrow">{c.phase}</div><h3>{c.name}</h3><p>{c.categories}</p><div className="competition-card__stats"><span><b>{c.teams}</b> equipes inscritas</span><span><b>{c.divisions.length}</b> divisões</span></div><p className="competition-card__note">{c.note}</p><div className="competition-card__open"><span>{canManageCompetition(user, c) ? 'Gerenciar campeonato' : 'Classificação e jogos'}</span><Icon name="arrow" /></div></div>
        </Link>)}
      </div>
      <p className="competition-demo-note">Histórico NCAA importado · Novos campeonatos salvos no banco.</p>
      {user && creating && <CreateCompetitionDialog user={user} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); navigate(`/campeonatos/${id}`) }} />}
    </div>
  )
}
