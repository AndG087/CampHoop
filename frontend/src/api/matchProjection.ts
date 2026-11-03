/** Projeção pura: placar, box score e escalação são reconstruídos pelos mesmos lances. */
import { athletes } from './mock/data'
import type { UpcomingMatch } from './mock/store'
import { clockSeconds, formatClock, periodLabel, type BoxLine, type MatchProjection, type MatchState } from './liveTypes'

export function initialMatchState(match: UpcomingMatch): MatchState {
  return {
    matchId: match.id, revision: 0, status: match.live ? 'ao-vivo' : 'agendado',
    period: match.live ? 3 : 1, remainingSeconds: match.live ? 272 : 600, runningSince: null, events: [],
  }
}

export function matchPeriod(state: MatchState) {
  return `${periodLabel(state.period)} · ${formatClock(clockSeconds(state))}`
}

export function projectMatch(match: UpcomingMatch, state: MatchState): MatchProjection {
  const box: BoxLine[] = athletes.filter((a) => a.teamId === match.homeTeamId || a.teamId === match.awayTeamId).map((a) => ({
    athleteId: a.id, teamId: a.teamId, name: a.name, number: a.number, position: a.position,
    eligible: a.status === 'ativo', played: false, onCourt: false,
    points: 0, offensiveRebounds: 0, defensiveRebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
    fieldMade: 0, fieldAttempts: 0, freeMade: 0, freeAttempts: 0,
  }))
  for (const teamId of [match.homeTeamId, match.awayTeamId]) {
    box.filter((a) => a.teamId === teamId && a.eligible).slice(0, 5).forEach((a) => { a.onCourt = true; a.played = state.status !== 'agendado' })
  }
  // Snapshot fictício da partida já em andamento, consistente com o placar 42–38.
  if (match.id === 'm-110') {
    const snapshot: Record<string, Partial<BoxLine>> = {
      'luiza-martins': { points: 18, defensiveRebounds: 3, assists: 4, steals: 2, turnovers: 1, fouls: 1, fieldMade: 7, fieldAttempts: 12, freeMade: 1, freeAttempts: 2 },
      'ana-ribeiro': { points: 10, defensiveRebounds: 2, assists: 3, fouls: 2, fieldMade: 4, fieldAttempts: 8, freeMade: 1, freeAttempts: 2 },
      'bia-costa': { points: 6, offensiveRebounds: 2, defensiveRebounds: 3, assists: 1, fieldMade: 2, fieldAttempts: 5, freeMade: 1, freeAttempts: 1 },
      'clara-souza': { points: 4, offensiveRebounds: 2, defensiveRebounds: 5, blocks: 2, fouls: 2, fieldMade: 2, fieldAttempts: 4 },
      'nina-lima': { points: 4, defensiveRebounds: 3, assists: 1, fieldMade: 2, fieldAttempts: 3 },
      'isabela-prado': { points: 22, defensiveRebounds: 4, assists: 5, steals: 1, fouls: 2, fieldMade: 8, fieldAttempts: 15, freeMade: 3, freeAttempts: 4 },
      'julia-teixeira': { points: 16, offensiveRebounds: 3, defensiveRebounds: 6, assists: 2, blocks: 1, fouls: 3, fieldMade: 7, fieldAttempts: 12, freeMade: 2, freeAttempts: 3 },
    }
    box.forEach((a) => Object.assign(a, snapshot[a.athleteId] ?? {}))
  }
  const result: MatchProjection = {
    homeScore: match.live?.homeScore ?? 0, awayScore: match.live?.awayScore ?? 0, box,
    quarters: match.id === 'm-110' ? [{ home: 18, away: 16 }, { home: 16, away: 14 }, { home: 8, away: 8 }] : [{ home: 0, away: 0 }],
  }
  for (const event of state.events) {
    const athlete = box.find((a) => a.athleteId === event.athleteId)
    if (!athlete || athlete.teamId !== event.teamId) continue
    if (event.action === 'substitution') {
      const out = box.find((a) => a.athleteId === event.outAthleteId)
      if (out) out.onCourt = false
      athlete.onCourt = true
      athlete.played = true
      continue
    }
    const points = event.action === 'two' ? 2 : event.action === 'three' ? 3 : event.action === 'free' ? 1 : 0
    athlete.points += points
    if (['two', 'three', 'miss-two', 'miss-three'].includes(event.action)) athlete.fieldAttempts++
    if (['two', 'three'].includes(event.action)) athlete.fieldMade++
    if (['free', 'miss-free'].includes(event.action)) athlete.freeAttempts++
    if (event.action === 'free') athlete.freeMade++
    if (event.action === 'off-rebound') athlete.offensiveRebounds++
    if (event.action === 'def-rebound') athlete.defensiveRebounds++
    if (event.action === 'assist') athlete.assists++
    if (event.action === 'steal') athlete.steals++
    if (event.action === 'block') athlete.blocks++
    if (event.action === 'turnover') athlete.turnovers++
    if (event.action === 'foul') { athlete.fouls++; if (athlete.fouls >= 5) athlete.onCourt = false }
    while (result.quarters.length < event.period) result.quarters.push({ home: 0, away: 0 })
    if (event.teamId === match.homeTeamId) { result.homeScore += points; result.quarters[event.period - 1].home += points }
    else { result.awayScore += points; result.quarters[event.period - 1].away += points }
  }
  while (result.quarters.length < state.period) result.quarters.push({ home: 0, away: 0 })
  return result
}
