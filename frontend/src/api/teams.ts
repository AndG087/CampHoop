/**
 * Camada de acesso às equipes. Depois vira GET /teams e GET /teams/{id}.
 * Campanha e médias são calculadas das partidas encerradas, as mesmas que
 * alimentam o perfil dos atletas, para os números baterem entre as telas.
 */
import { delay, round1, teamById, toSummary } from './athletes'
import { athletes, competitionTeams, competitions, matches, teams, upcomingMatches } from './mock/data'
import { finishedGame, scheduledGame } from './public'
import type { TeamProfile, TeamSummary } from './types'

function teamMatches(teamId: string) {
  return matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
}

/** Pontos feitos e sofridos pela equipe numa partida. */
function scoreFor(m: (typeof matches)[number], teamId: string) {
  const home = m.homeTeamId === teamId
  return { scored: home ? m.homeScore : m.awayScore, allowed: home ? m.awayScore : m.homeScore }
}

function summarize(row: (typeof teams)[number]): TeamSummary {
  const played = teamMatches(row.id)
  const wins = played.filter((m) => {
    const { scored, allowed } = scoreFor(m, row.id)
    return scored > allowed
  }).length
  return {
    team: teamById(row.id),
    coach: row.coach,
    athletes: athletes.filter((a) => a.teamId === row.id).length,
    games: played.length,
    wins,
    losses: played.length - wins,
    competitions: competitions
      .filter((c) => competitionTeams[c.id]?.includes(row.id))
      .map(({ id, name, status }) => ({ id, name, status })),
  }
}

export async function listTeamSummaries(): Promise<TeamSummary[]> {
  await delay()
  return teams.map(summarize)
}

export async function getTeam(id: string): Promise<TeamProfile | null> {
  await delay()
  const row = teams.find((t) => t.id === id)
  if (!row) return null
  const summary = summarize(row)
  const played = teamMatches(id)
  const scores = played.map((m) => scoreFor(m, id))
  const avg = (key: 'scored' | 'allowed') => (scores.length ? round1(scores.reduce((sum, s) => sum + s[key], 0) / scores.length) : 0)
  const next = upcomingMatches
    .filter((m) => m.homeTeamId === id || m.awayTeamId === id)
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  return {
    ...summary,
    pointsFor: avg('scored'),
    pointsAgainst: avg('allowed'),
    pointDiff: scores.length ? round1(scores.reduce((sum, s) => sum + s.scored - s.allowed, 0) / scores.length) : 0,
    winRate: summary.games ? Math.round((summary.wins / summary.games) * 100) : 0,
    roster: athletes
      .filter((a) => a.teamId === id)
      .map(toSummary)
      .sort((a, b) => a.number - b.number),
    recentGames: [...played].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(finishedGame),
    nextGame: next ? scheduledGame(next) : null,
  }
}
