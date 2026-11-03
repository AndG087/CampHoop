import { Link, useSearchParams } from 'react-router'
import { DEMO_TODAY } from '../api/mock/data'
import { listSchedule } from '../api/schedule'
import type { ScheduleEvent } from '../api/types'
import { useApi } from '../api/useApi'
import { Can } from '../auth/guards'
import type { DemoUser } from '../auth/roles'
import { useSession } from '../auth/session'
import { formatGameDay } from '../format'
import './SchedulePage.css'

const WEEKDAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const pad = (n: number) => String(n).padStart(2, '0')

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function involvesTeam(e: ScheduleEvent, teamId: string): boolean {
  return e.kind === 'treino' ? e.team.id === teamId : e.game.home.id === teamId || e.game.away.id === teamId
}

function applyFilters(events: ScheduleEvent[], type: string, mine: boolean, user: DemoUser | null): ScheduleEvent[] {
  return events.filter((e) => (!type || e.kind === type) && (!mine || !user?.teamId || involvesTeam(e, user.teamId)))
}

function EventItem({ event }: { event: ScheduleEvent }) {
  if (event.kind === 'treino') {
    return (
      <article className="event event--treino">
        <span className="event__time">{event.time}</span>
        <div className="event__body">
          <span className="event__tag">TREINO</span>
          <b>
            <Link to={`/times/${event.team.id}`}>{event.team.club.name} · {event.team.name}</Link>
          </b>
          <span className="muted">{event.venue}</span>
        </div>
      </article>
    )
  }
  const g = event.game
  const tag = g.status === 'ao-vivo' ? 'AO VIVO' : g.status === 'encerrado' ? 'ENCERRADO' : 'JOGO'
  return (
    <article className={`event event--jogo${g.status === 'ao-vivo' ? ' event--live' : ''}`}>
      <span className="event__time">{g.time ?? '—'}</span>
      <div className="event__body">
        <span className="event__tag">{tag}{g.competition ? ` · ${g.competition}` : ''}</span>
        <b>
          <Link to={`/times/${g.home.id}`}>{g.home.club.name}</Link> × <Link to={`/times/${g.away.id}`}>{g.away.club.name}</Link>
          <span className="event__cat"> · {g.home.name}</span>
        </b>
        {g.venue && <span className="muted">{g.venue}</span>}
      </div>
      {g.homeScore !== null && (
        <span className="event__score">
          {g.homeScore}–{g.awayScore}
        </span>
      )}
    </article>
  )
}

export default function SchedulePage() {
  const { user } = useSession()
  const [params, setParams] = useSearchParams()
  const month = params.get('mes') ?? DEMO_TODAY.slice(0, 7)
  const view = params.get('ver') === 'lista' ? 'lista' : 'calendario'
  const type = params.get('tipo') ?? ''
  const mine = params.get('equipe') === 'minha'
  const lastDay = daysInMonth(month)
  const selectedDay = params.get('dia') ?? (DEMO_TODAY.startsWith(month) ? DEMO_TODAY : `${month}-01`)

  const monthEvents = useApi(() => listSchedule(`${month}-01`, `${month}-${pad(lastDay)}`, user), `schedule:${month}:${user?.id}`)
  const upcoming = useApi(() => listSchedule(DEMO_TODAY, addDays(DEMO_TODAY, 30), user), `schedule:next:${user?.id}`)

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // Ao trocar de mês, o dia selecionado volta ao padrão daquele mês.
    if (key === 'mes') next.delete('dia')
    setParams(next, { replace: true })
  }

  const events = applyFilters(monthEvents.data ?? [], type, mine, user)
  const byDay = new Map<string, ScheduleEvent[]>()
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  const nextEvents = applyFilters(upcoming.data ?? [], type, mine, user)
    .filter((e) => !(e.kind === 'jogo' && e.game.status === 'encerrado'))
    .slice(0, 5)

  const [y, m] = month.split('-').map(Number)
  // Segunda-feira como primeiro dia da semana.
  const leading = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const cells = [...Array(leading).fill(null), ...Array.from({ length: lastDay }, (_, i) => `${month}-${pad(i + 1)}`)]
  const selectedEvents = byDay.get(selectedDay) ?? []
  const [, sm, sd] = selectedDay.split('-').map(Number)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">CENTRAL DE OPERAÇÕES · 2025/26</div>
          <h1>Agenda</h1>
          <p>{user?.teamId ? 'Jogos de todas as equipes e os treinos da sua.' : 'Jogos de todas as equipes.'}</p>
        </div>
        <Can permission="schedule.manage">
          <button type="button" className="btn btn--accent" title="Agendamento chega com o backend.">
            + Agendar jogo
          </button>
        </Can>
      </div>

      <div className="schedule-controls">
        <nav className="comp-tabs schedule-tabs" aria-label="Visualização">
          <button type="button" aria-pressed={view === 'calendario'} onClick={() => setParam('ver', '')}>Calendário</button>
          <button type="button" aria-pressed={view === 'lista'} onClick={() => setParam('ver', 'lista')}>Lista</button>
        </nav>
        {/* Sem equipe não há treinos: os filtros de tipo e de equipe não teriam efeito. */}
        {user?.teamId && (
          <div className="chips" role="group" aria-label="Tipo">
            <button type="button" className="chip" aria-pressed={!type} onClick={() => setParam('tipo', '')}>Tudo</button>
            <button type="button" className="chip" aria-pressed={type === 'jogo'} onClick={() => setParam('tipo', 'jogo')}>Jogos</button>
            <button type="button" className="chip" aria-pressed={type === 'treino'} onClick={() => setParam('tipo', 'treino')}>Treinos</button>
          </div>
        )}
        {user?.teamId && (
          <div className="chips" role="group" aria-label="Equipes">
            <button type="button" className="chip" aria-pressed={!mine} onClick={() => setParam('equipe', '')}>Todas as equipes</button>
            <button type="button" className="chip" aria-pressed={mine} onClick={() => setParam('equipe', 'minha')}>Minha equipe</button>
          </div>
        )}
      </div>

      <div className="card month">
        <div className="month__head">
          <button type="button" className="chip" onClick={() => setParam('mes', shiftMonth(month, -1))} aria-label="Mês anterior">← Anterior</button>
          <b>{MONTHS[m - 1]} de {y}</b>
          <button type="button" className="chip" onClick={() => setParam('mes', shiftMonth(month, 1))} aria-label="Próximo mês">Próximo →</button>
        </div>

        {monthEvents.loading && <p className="muted month__state">Carregando agenda…</p>}
        {monthEvents.error && <p className="muted month__state">Não foi possível carregar a agenda. Recarregue a página.</p>}

        {monthEvents.data && view === 'calendario' && (
          <>
            <div className="calendar" role="grid" aria-label={`${MONTHS[m - 1]} de ${y}`}>
              {WEEKDAYS.map((d) => (
                <div key={d} className="calendar__head" role="columnheader">{d}</div>
              ))}
              {cells.map((date, i) => {
                if (!date) return <div key={`vazio-${i}`} className="day day--empty" />
                const dayEvents = byDay.get(date) ?? []
                const classes = ['day', date === DEMO_TODAY && 'day--today', date === selectedDay && 'day--selected'].filter(Boolean).join(' ')
                return (
                  <button key={date} type="button" className={classes} onClick={() => setParam('dia', date)} aria-label={`${Number(date.slice(8))} de ${MONTHS[m - 1]}: ${dayEvents.length} compromissos`}>
                    <span className="day__num">{Number(date.slice(8))}</span>
                    {dayEvents.slice(0, 2).map((e) => (
                      <span key={e.id} className={`day__event day__event--${e.kind}${e.kind === 'jogo' && e.game.status === 'ao-vivo' ? ' day__event--live' : ''}`}>
                        {e.kind === 'treino' ? `${e.time} · Treino` : `${e.time ?? ''} ${e.game.home.club.shortName}×${e.game.away.club.shortName}`.trim()}
                      </span>
                    ))}
                    {dayEvents.length > 2 && <span className="day__more">+{dayEvents.length - 2}</span>}
                  </button>
                )
              })}
            </div>

            <div className="day-detail">
              <h2 className="day-detail__title">
                {sd} de {MONTHS[sm - 1].toLowerCase()}
                {selectedDay === DEMO_TODAY && <span className="pill">HOJE</span>}
              </h2>
              {selectedEvents.length === 0 ? (
                <p className="muted">Nenhum compromisso neste dia.</p>
              ) : (
                selectedEvents.map((e) => <EventItem key={e.id} event={e} />)
              )}
            </div>
          </>
        )}

        {monthEvents.data && view === 'lista' && (
          <div className="schedule-list">
            {byDay.size === 0 && <p className="muted month__state">Nenhum compromisso neste mês com esses filtros.</p>}
            {[...byDay.entries()].map(([date, list]) => (
              <section key={date} className="schedule-list__day">
                <h3>{formatGameDay(date, DEMO_TODAY)}</h3>
                {list.map((e) => <EventItem key={e.id} event={e} />)}
              </section>
            ))}
          </div>
        )}
      </div>

      <h2 className="section-title">Próximos compromissos</h2>
      <div className="card">
        {upcoming.loading && <p className="muted" style={{ margin: 0 }}>Carregando…</p>}
        {upcoming.data && nextEvents.length === 0 && <p className="muted" style={{ margin: 0 }}>Nada agendado nos próximos 30 dias.</p>}
        {nextEvents.map((e) => (
          <div key={e.id} className="next-item">
            <span className="next-item__day">{formatGameDay(e.date, DEMO_TODAY)}</span>
            <EventItem event={e} />
          </div>
        ))}
      </div>
    </>
  )
}
