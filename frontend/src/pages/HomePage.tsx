import { DATA_SEASON } from '../api/client'
import { useState } from 'react'
import { Link } from 'react-router'
import { getHomeSummary, type HomeScope } from '../api/home'
import { CURRENT_DATE as DEMO_TODAY } from '../api/client'
import { useApi } from '../api/useApi'
import { useSession } from '../auth/session'
import { formatAverage, formatDate, formatShortDate } from '../format'
import { agendaLink, Crest, Icon, Leaders, MatchHero, Metric, PerformanceChart, SeasonCard, SectionHeading, UpcomingEvent } from './HomeWidgets'
import './HomePage.css'

export default function HomePage() {
  const { user } = useSession()
  const [scope, setScope] = useState<HomeScope>(user?.teamId ? 'minha' : 'todas')
  const [version, setVersion] = useState(0)
  const { data, loading, error } = useApi(() => getHomeSummary(user!, scope), `home:${user?.id}:${scope}:${version}`)
  if (!user) return null
  const mine = scope === 'minha' && !!user.teamId
  const own = mine ? data?.teams[0] : undefined
  const featured = data?.live[0] ?? data?.upcoming.find((e) => e.kind === 'jogo')?.game ?? data?.results[0]

  return (
    <div className="home-dashboard">
      <header className="home-heading"><div><div className="home-overline"><span className="home-tiny-ball" /> SUA CENTRAL DE BASQUETE</div><h1>Dentro do jogo<span>.</span></h1><p>Olá, {user.name.split(' ')[0]}. {mine ? 'Seu time, seus números, seu próximo desafio.' : 'Tudo o que movimenta a temporada, em um só lugar.'}</p></div><div className="home-heading__right"><span className="home-date">TEMPORADA <b>{DATA_SEASON}</b></span><Link to="/agenda" className="btn btn--accent" aria-label="Abrir minha agenda"><Icon name="calendar" /> Minha agenda <span aria-hidden="true">↗</span></Link></div></header>
      <div className="home-toolbar"><div className="home-segment" role="group" aria-label="Equipes do resumo">{user.teamId && <button type="button" aria-pressed={mine} onClick={() => setScope('minha')}>Minha equipe</button>}<button type="button" aria-pressed={!mine} onClick={() => setScope('todas')}>Todas as equipes</button></div><span>Dados da temporada selecionada · {formatDate(DEMO_TODAY)}</span></div>
      {loading ? <div className="home-skeleton" role="status"><span>Preparando sua central…</span><div /><div /><div /></div> : error || !data ? <div className="card" role="alert"><p>Não foi possível carregar o resumo.</p><button type="button" className="btn btn--ghost" onClick={() => setVersion((v) => v + 1)}>Tentar novamente</button></div> : <>
        <div className="home-feature-grid">
          {featured ? <MatchHero game={featured} /> : <article className="home-match-hero home-match-hero--empty"><span className="home-status">A TEMPORADA CONTINUA</span><h2>O próximo capítulo<br />começa em quadra.</h2><p>Acompanhe a agenda e prepare-se para os próximos desafios.</p><Link to="/agenda" className="btn btn--accent">Explorar agenda ↗</Link></article>}
          <SeasonCard data={data} teamId={mine ? user.teamId : undefined} />
        </div>
        {data.live.length > 1 && <div className="home-other-live">Também em quadra: {data.live.slice(1).map((g) => <Link key={g.id} to={agendaLink(g.date)}>{g.home.club.shortName} {g.homeScore} × {g.awayScore} {g.away.club.shortName} ↗</Link>)}</div>}
        <section className="home-metrics" aria-label="Números da temporada">
          <Metric icon="ball" label="Jogos disputados" value={data.games.toString().padStart(2, '0')}><b>{mine ? `${own?.wins ?? 0} ${(own?.wins ?? 0) === 1 ? 'vitória' : 'vitórias'}` : `${data.teams.length} equipes`}</b> na temporada</Metric>
          <Metric icon="people" label={mine ? 'Atletas da equipe' : 'Atletas cadastrados'} value={data.athletes}><b>{data.activeAthletes} na base</b> no elenco{mine ? '' : ' geral'}</Metric>
          <Metric icon="trophy" label="Pontos por jogo" value={formatAverage(data.pointsPerGame)} accent>{mine ? <><b>{formatAverage(data.pointsAgainst)} sofridos</b> por partida</> : <>Média por equipe · jogos encerrados</>}</Metric>
          <Metric icon="calendar" label="Próximos 7 dias" value={data.weekGames.toString().padStart(2, '0')}><b>{data.weekGames === 1 ? 'jogo agendado' : 'jogos agendados'}</b>{user.teamId ? ` · ${data.weekTrainings} treinos` : ` · ${data.activeCompetitions} campeonato ativo`}</Metric>
        </section>
        <div className="home-analysis-grid">
          <section className="home-panel home-performance"><SectionHeading number="01" title="Ritmo da temporada" /><div className="home-performance__summary"><div><strong>{formatAverage(data.pointsPerGame)}</strong><span>{mine ? 'pontos por jogo da equipe' : 'pontos por jogo, por equipe'}</span></div><span className="home-soft-tag">{mine ? own?.team.name : 'Todas as categorias'}</span></div><PerformanceChart games={data.performance} mine={mine} /></section>
          <Leaders leaders={data.leaders} />
        </div>
        <div className="home-bottom-grid">
          <section className="home-panel"><SectionHeading number="03" title="Marque na agenda" to="/agenda" link="Agenda completa" /><p className="home-panel-intro">Os próximos compromissos. {user.teamId ? 'Treinos exclusivos da sua equipe.' : 'Encontre seu próximo jogo.'}</p>{data.upcoming.length ? <ul className="home-event-list">{data.upcoming.slice(0, 4).map((e) => <UpcomingEvent key={e.id} event={e} />)}</ul> : <p className="home-empty">Nenhum compromisso nos próximos 30 dias.</p>}</section>
          <section className="home-panel"><SectionHeading number="04" title="Em disputa" /><div className="home-competition-list">{data.competitions.map((c, i) => <Link key={c.id} to={`/campeonatos/${c.id}`}><span className={`home-competition-icon home-competition-icon--${i}`}><Icon name="trophy" /></span><span><small className={`home-competition-status home-competition-status--${c.status}`}>{c.status === 'em-andamento' ? 'EM ANDAMENTO' : c.status === 'inscricoes' ? 'INSCRIÇÕES ABERTAS' : 'FINALIZADO'}</small><b>{c.name}</b><small>{c.phase} · {c.categories}</small><em>{c.note}</em></span><span aria-hidden="true">↗</span></Link>)}</div>{!data.competitions.length && <p className="home-empty">Nenhum campeonato vinculado.</p>}<p className="home-panel-note">Selecione um campeonato para ver a classificação e os jogos.</p></section>
        </div>
        <section className="home-results-section"><SectionHeading number="05" title="O que rolou em quadra" to="/agenda?ver=lista" link="Todos os resultados" /><div className="home-results-strip">{data.results.map((g) => <Link key={g.id} to={`/ao-vivo?partida=${g.id}`} className="home-result-card" aria-label={`Ver partida ${g.home.club.name} ${g.homeScore} × ${g.awayScore} ${g.away.club.name}`}><div><span>{formatShortDate(g.date)} · {g.home.category}</span><span>FINAL</span></div><p><span><Crest team={g.home} />{g.home.club.name}</span><b className={g.homeScore! > g.awayScore! ? 'is-winner' : ''}>{g.homeScore}</b></p><p><span><Crest team={g.away} />{g.away.club.name}</span><b className={g.awayScore! > g.homeScore! ? 'is-winner' : ''}>{g.awayScore}</b></p></Link>)}</div>{!data.results.length && <p className="home-empty">Os resultados aparecem após o encerramento das partidas.</p>}</section>
        <footer className="home-footer"><span><span className="home-tiny-ball" /> CAMPHOOP <b>GAME ON. GROW TOGETHER.</b></span><span>Estatísticas de jogos encerrados · Temporada {DATA_SEASON}</span></footer>
      </>}
    </div>
  )
}
