import type { PublicGame } from './types'

export type MatchAction = 'two' | 'three' | 'free' | 'miss-two' | 'miss-three' | 'miss-free' | 'off-rebound' | 'def-rebound' | 'assist' | 'steal' | 'block' | 'turnover' | 'foul' | 'substitution'
export type MatchEvent = {
  id: string
  action: MatchAction
  teamId: string
  athleteId: string
  outAthleteId: string | null
  period: number
  seconds: number
}
export type MatchState = {
  matchId: string
  revision: number
  status: PublicGame['status']
  period: number
  remainingSeconds: number
  runningSince: number | null
  events: MatchEvent[]
}
export type BoxLine = {
  athleteId: string
  teamId: string
  name: string
  number: number
  position: string
  eligible: boolean
  played: boolean
  onCourt: boolean
  points: number
  offensiveRebounds: number
  defensiveRebounds: number
  assists: number
  steals: number
  blocks: number
  turnovers: number
  fouls: number
  fieldMade: number
  fieldAttempts: number
  freeMade: number
  freeAttempts: number
}
export type MatchProjection = {
  homeScore: number
  awayScore: number
  box: BoxLine[]
  quarters: { home: number; away: number }[]
}
export type LiveMatch = MatchProjection & {
  game: PublicGame
  state: MatchState
  historical: boolean
}

export const ACTION_LABEL: Record<MatchAction, string> = {
  two: 'Cesta de 2 pontos', three: 'Cesta de 3 pontos', free: 'Lance livre convertido',
  'miss-two': 'Arremesso de 2 errado', 'miss-three': 'Arremesso de 3 errado', 'miss-free': 'Lance livre errado',
  'off-rebound': 'Rebote ofensivo', 'def-rebound': 'Rebote defensivo', assist: 'Assistência',
  steal: 'Roubo de bola', block: 'Toco', turnover: 'Erro de ataque', foul: 'Falta pessoal', substitution: 'Substituição',
}
export const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
export const periodLabel = (period: number) => period <= 4 ? `${period}º período` : `${period - 4}ª prorrogação`
export const periodLength = (period: number) => period <= 4 ? 600 : 300
export function clockSeconds(state: MatchState, now = Date.now()) {
  return Math.max(0, state.remainingSeconds - (state.runningSince === null ? 0 : Math.max(0, Math.floor((now - state.runningSince) / 1000))))
}
