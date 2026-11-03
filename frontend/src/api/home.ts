/** Resumo do início; depois vira GET /home, preservando o contrato da tela. */
import type { DemoUser } from '../auth/roles'
import { round1, teamById } from './athletes'
import { DEMO_TODAY, athletes, competitions, matches, statLines } from './mock/data'
import { finishedGame } from './public'
import { listSchedule } from './schedule'
import { listTeamSummaries } from './teams'
import type { Competition, PublicGame, ScheduleEvent, Team, TeamSummary } from './types'

export type HomeScope = 'minha' | 'todas'
export type HomeLeader = {
  id: string; name: string; number: number; position: string; team: Team
  games: number; points: number; rebounds: number; assists: number
}
export type HomePerformance = {
  id: string; date: string; scored: number; allowed: number; label: string
}
export type HomeSummary = {
  teams: TeamSummary[]
  athletes: number
  games: number
  activeCompetitions: number
  live: PublicGame[]
  upcoming: ScheduleEvent[]
  results: PublicGame[]
  leaders: HomeLeader[]
  competitions: Competition[]
  performance: HomePerformance[]
  pointsPerGame: number
  pointsAgainst: number
  weekGames: number
  weekTrainings: number
  activeAthletes: number
}

export async function getHomeSummary(viewer: DemoUser, scope: HomeScope, today = DEMO_TODAY): Promise<HomeSummary> {
  const [y, m, d] = today.split('-').map(Number)
  const until = new Date(Date.UTC(y, m - 1, d + 30)).toISOString().slice(0, 10)
  const [summaries, schedule] = await Promise.all([listTeamSummaries(), listSchedule(today, until, viewer)])
  const teamId = scope === 'minha' ? viewer.teamId : undefined
  const involves = (homeId: string, awayId: string) => !teamId || homeId === teamId || awayId === teamId
  const teams = summaries.filter((s) => !teamId || s.team.id === teamId)
  const played = matches.filter((g) => g.date <= today && involves(g.homeTeamId, g.awayTeamId))
  const visible = schedule.filter((e) => e.kind === 'treino' ? !e.cancelled : involves(e.game.home.id, e.game.away.id))
  const playedIds = new Set(played.map((g) => g.id))
  const roster = athletes.filter((a) => !teamId || a.teamId === teamId)
  const leaders = roster.flatMap((a): HomeLeader[] => {
    const lines = statLines.filter(([gameId, athleteId]) => athleteId === a.id && playedIds.has(gameId))
    if (!lines.length) return []
    const avg = (index: 2 | 3 | 4) => round1(lines.reduce((sum, l) => sum + l[index], 0) / lines.length)
    return [{ id: a.id, name: a.name, number: a.number, position: a.position, team: teamById(a.teamId), games: lines.length, points: avg(2), rebounds: avg(3), assists: avg(4) }]
  })
  const performance = [...played].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map((g) => {
    const home = !teamId || g.homeTeamId === teamId
    return { id: g.id, date: g.date, scored: home ? g.homeScore : g.awayScore, allowed: home ? g.awayScore : g.homeScore, label: teamId ? teamById(home ? g.awayTeamId : g.homeTeamId).club.name : `${teamById(g.homeTeamId).club.shortName} × ${teamById(g.awayTeamId).club.shortName}` }
  })
  const weekEnd = new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10)
  const week = visible.filter((e) => e.date < weekEnd)
  const competitionIds = new Set(teams.flatMap((s) => s.competitions.map((c) => c.id)))

  return {
    teams,
    athletes: teams.reduce((sum, s) => sum + s.athletes, 0),
    // Conta partidas únicas: somar os totais das equipes contaria cada jogo duas vezes.
    games: played.length,
    activeCompetitions: new Set(teams.flatMap((s) => s.competitions.filter((c) => c.status === 'em-andamento').map((c) => c.id))).size,
    live: visible.flatMap((e) => e.kind === 'jogo' && e.game.status === 'ao-vivo' ? [e.game] : []),
    upcoming: visible.filter((e) => e.kind === 'treino' || e.game.status === 'agendado').slice(0, 5),
    results: [...played].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).slice(0, 5).map(finishedGame),
    leaders,
    competitions: competitions.filter((c) => competitionIds.has(c.id)),
    performance: performance.slice(-6),
    pointsPerGame: played.length ? round1(performance.reduce((sum, g) => sum + (teamId ? g.scored : (g.scored + g.allowed) / 2), 0) / played.length) : 0,
    pointsAgainst: played.length ? round1(performance.reduce((sum, g) => sum + g.allowed, 0) / played.length) : 0,
    weekGames: week.filter((e) => e.kind === 'jogo' && e.game.status === 'agendado').length,
    weekTrainings: week.filter((e) => e.kind === 'treino').length,
    activeAthletes: roster.filter((a) => a.status === 'ativo').length,
  }
}
