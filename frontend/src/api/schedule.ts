/**
 * Agenda: jogos e treinos num intervalo de datas. Depois vira GET /schedule.
 * Jogos são públicos; treinos só aparecem para quem é da equipe (técnico ou
 * atleta), regra que o backend também vai aplicar.
 */
import type { DemoUser } from '../auth/roles'
import { delay, teamById } from './athletes'
import { matches, trainingSlots, upcomingMatches } from './mock/data'
import { finishedGame, scheduledGame } from './public'
import type { ScheduleEvent } from './types'

/** Datas AAAA-MM-DD entre `from` e `to`, inclusive, com o dia da semana (0 = domingo). */
function eachDay(from: string, to: string): { date: string; weekday: number }[] {
  const days = []
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const end = Date.UTC(ty, tm - 1, td)
  for (let t = Date.UTC(fy, fm - 1, fd); t <= end; t += 86_400_000) {
    const d = new Date(t)
    days.push({ date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() })
  }
  return days
}

export async function listSchedule(from: string, to: string, viewer: DemoUser | null): Promise<ScheduleEvent[]> {
  await delay()
  const inRange = (date: string) => date >= from && date <= to

  const games: ScheduleEvent[] = [
    ...matches.filter((m) => inRange(m.date)).map(finishedGame),
    ...upcomingMatches.filter((m) => inRange(m.date)).map(scheduledGame),
  ].map((game) => ({ kind: 'jogo', id: game.id, date: game.date, time: game.time, game }))

  const teamId = viewer?.teamId
  const gameDays = new Set(games.filter((e) => e.kind === 'jogo' && (e.game.home.id === teamId || e.game.away.id === teamId)).map((e) => e.date))
  const trainings: ScheduleEvent[] = teamId
    ? eachDay(from, to).flatMap(({ date, weekday }) =>
        trainingSlots
          // Em dia de jogo da equipe não há treino.
          .filter((s) => s.teamId === teamId && s.weekday === weekday && !gameDays.has(date))
          .map((s) => ({ kind: 'treino' as const, id: `t-${s.teamId}-${date}`, date, time: s.time, team: teamById(s.teamId), venue: s.venue })),
      )
    : []

  return [...games, ...trainings].sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
}
