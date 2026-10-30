/**
 * Dados abertos a qualquer pessoa, sem login (issue #19): torneios e jogos.
 * Depois viram GET /public/competitions e GET /public/games no backend.
 */
import { delay, teamById } from './athletes'
import { competitions, matches, upcomingMatches } from './mock/data'
import type { Competition, PublicGame } from './types'

export async function listCompetitions(): Promise<Competition[]> {
  await delay()
  return competitions
}

export type PublicGames = {
  live: PublicGame[]
  upcoming: PublicGame[]
  results: PublicGame[]
}

/** Jogo agendado ou em andamento, no formato público. */
export function scheduledGame(m: (typeof upcomingMatches)[number]): PublicGame {
  return {
    id: m.id,
    date: m.date,
    time: m.time,
    status: m.live ? 'ao-vivo' : 'agendado',
    home: teamById(m.homeTeamId),
    away: teamById(m.awayTeamId),
    homeScore: m.live?.homeScore ?? null,
    awayScore: m.live?.awayScore ?? null,
    period: m.live?.period ?? null,
    venue: m.venue,
    competition: competitions.find((c) => c.id === m.competitionId)?.name ?? null,
  }
}

/** Jogo encerrado, no formato público. */
export function finishedGame(m: (typeof matches)[number]): PublicGame {
  return {
    id: m.id,
    date: m.date,
    time: null,
    status: 'encerrado',
    home: teamById(m.homeTeamId),
    away: teamById(m.awayTeamId),
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    period: null,
    venue: null,
    competition: null,
  }
}

export async function listPublicGames(): Promise<PublicGames> {
  await delay()
  const scheduled = upcomingMatches.map(scheduledGame)
  return {
    live: scheduled.filter((g) => g.status === 'ao-vivo'),
    upcoming: scheduled.filter((g) => g.status === 'agendado'),
    results: [...matches]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4)
      .map(finishedGame),
  }
}
