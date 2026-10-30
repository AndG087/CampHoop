/**
 * Camada de acesso aos atletas. As telas só usam estas funções.
 * Hoje leem dados fictícios; depois viram chamadas ao backend
 * (GET /athletes, GET /athletes/{id}, GET /teams) sem mudar as telas.
 */
import { canViewAthletePrivate } from '../auth/access'
import type { DemoUser } from '../auth/roles'
import { DEMO_TODAY, athletes, clubs, development, matches, statLines, teams } from './mock/data'
import type { AthleteProfile, AthleteSummary, Club, GameLine, Team } from './types'

/** Atraso curto para a interface já lidar com carregamento, como fará com a API real. */
export const delay = () => new Promise((resolve) => setTimeout(resolve, 150))

function clubById(id: string): Club {
  const club = clubs.find((c) => c.id === id)
  if (!club) throw new Error(`Clube desconhecido: ${id}`)
  return club
}

export function teamById(id: string): Team {
  const row = teams.find((t) => t.id === id)
  if (!row) throw new Error(`Equipe desconhecida: ${id}`)
  return { id: row.id, club: clubById(row.clubId), category: row.category, gender: row.gender, name: `${row.category} ${row.gender}` }
}

function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

export const round1 = (n: number) => Math.round(n * 10) / 10

function gameLines(athleteId: string, teamId: string): GameLine[] {
  return statLines
    .filter(([, id]) => id === athleteId)
    .map(([matchId, , points, rebounds, assists, minutes]) => {
      const match = matches.find((m) => m.id === matchId)!
      const home = match.homeTeamId === teamId
      const opponentTeam = teams.find((t) => t.id === (home ? match.awayTeamId : match.homeTeamId))!
      return { matchId, date: match.date, opponent: clubById(opponentTeam.clubId), home, points, rebounds, assists, minutes }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

function average(lines: GameLine[], key: 'points' | 'rebounds' | 'assists'): number {
  return lines.length ? round1(lines.reduce((sum, l) => sum + l[key], 0) / lines.length) : 0
}

export function toSummary(row: (typeof athletes)[number]): AthleteSummary {
  const lines = gameLines(row.id, row.teamId)
  return {
    id: row.id,
    name: row.name,
    number: row.number,
    position: row.position,
    photoUrl: null,
    age: ageOn(row.birthDate, DEMO_TODAY),
    heightCm: row.heightCm,
    memberSince: row.memberSince,
    status: row.status,
    team: teamById(row.teamId),
    games: lines.length,
    pointsPerGame: average(lines, 'points'),
  }
}

export async function listAthletes(): Promise<AthleteSummary[]> {
  await delay()
  return athletes.map(toSummary).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Perfil completo. O bloco `private` só vem para quem pode vê-lo, como o backend fará. */
export async function getAthlete(id: string, viewer: DemoUser | null): Promise<AthleteProfile | null> {
  await delay()
  const row = athletes.find((a) => a.id === id)
  if (!row) return null
  const lines = gameLines(row.id, row.teamId)
  return {
    ...toSummary(row),
    reboundsPerGame: average(lines, 'rebounds'),
    assistsPerGame: average(lines, 'assists'),
    recentGames: lines.slice(0, 5),
    private: canViewAthletePrivate(viewer, { id: row.id, teamId: row.teamId })
      ? { birthDate: row.birthDate, development: development[row.id] ?? null }
      : null,
  }
}

export async function listTeams(): Promise<Team[]> {
  await delay()
  return teams.map((t) => teamById(t.id))
}
