import { roleCan, type DemoUser } from '../auth/roles'
import { delay } from './athletes'
import { ACTION_LABEL, clockSeconds, periodLength, type LiveMatch, type MatchAction, type MatchProjection, type MatchState } from './liveTypes'
import { initialMatchState, matchPeriod, projectMatch } from './matchProjection'
import { allFinishedMatches, allScheduledMatches, allStatLines, changeDemoData, demoData, newId, type UpcomingMatch } from './mock/store'
import { finishedGame, listPublicGames, scheduledGame } from './public'
import type { PublicGame } from './types'

export class MatchError extends Error {}

export async function listMatches(): Promise<PublicGame[]> {
  const games = await listPublicGames()
  return [...games.live, ...games.upcoming, ...allFinishedMatches().sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).map(finishedGame)]
}

export async function getMatch(id: string): Promise<LiveMatch | null> {
  await delay()
  const original = allScheduledMatches().find((m) => m.id === id)
  if (original) {
    const state = structuredClone(demoData().liveMatches[id] ?? initialMatchState(original))
    const projection = projectMatch(original, state)
    const game = scheduledGame(original)
    return {
      ...projection, state, historical: false,
      game: { ...game, status: state.status, homeScore: state.status === 'agendado' ? null : projection.homeScore, awayScore: state.status === 'agendado' ? null : projection.awayScore, period: state.status === 'ao-vivo' ? matchPeriod(state) : null },
    }
  }
  const historical = allFinishedMatches().find((m) => m.id === id)
  if (!historical) return null
  const placeholder: UpcomingMatch = { ...historical, time: historical.time ?? '', venue: historical.venue ?? '', live: null }
  const state: MatchState = { ...initialMatchState(placeholder), status: 'encerrado', period: 4, remainingSeconds: 0 }
  const box = projectMatch(placeholder, state).box.map((a) => {
    const line = allStatLines().find(([matchId, athleteId]) => matchId === id && athleteId === a.athleteId)
    return { ...a, onCourt: false, played: !!line, points: line?.[2] ?? 0, defensiveRebounds: line?.[3] ?? 0, assists: line?.[4] ?? 0 }
  })
  return { state, historical: true, game: finishedGame(historical), box, homeScore: historical.homeScore, awayScore: historical.awayScore, quarters: [] }
}

async function mutate(viewer: DemoUser | null, id: string, revision: number, fn: (state: MatchState, match: UpcomingMatch, projection: MatchProjection) => void) {
  await delay()
  if (!viewer || !roleCan(viewer.role, 'match.record')) throw new MatchError('Só o estatístico pode operar a partida.')
  const original = allScheduledMatches().find((m) => m.id === id)
  if (!original) throw new MatchError('Esta partida não pode ser alterada.')
  const state = structuredClone(demoData().liveMatches[id] ?? initialMatchState(original))
  if (state.revision !== revision) throw new MatchError('A partida foi atualizada em outra tela. Confira os dados e tente novamente.')
  if (state.status === 'encerrado') throw new MatchError('Esta partida já foi encerrada.')
  fn(state, original, projectMatch(original, state))
  state.revision++
  changeDemoData((d) => { d.liveMatches[id] = state })
}

export async function startMatch(viewer: DemoUser | null, id: string, revision: number) {
  return mutate(viewer, id, revision, (state, _match, projection) => {
    if (state.status !== 'agendado') throw new MatchError('Esta partida já foi iniciada.')
    if (!projection.box.some((a) => a.teamId === _match.homeTeamId && a.onCourt) || !projection.box.some((a) => a.teamId === _match.awayTeamId && a.onCourt)) throw new MatchError('As duas equipes precisam de atletas disponíveis no elenco.')
    state.status = 'ao-vivo'
  })
}

export type ClockCommand = { type: 'play' | 'pause' | 'next-period' | 'finish' } | { type: 'set'; seconds: number }
export async function controlMatch(viewer: DemoUser | null, id: string, revision: number, command: ClockCommand) {
  return mutate(viewer, id, revision, (state, _match, projection) => {
    if (state.status !== 'ao-vivo') throw new MatchError('Inicie a partida antes de operar o relógio.')
    const now = Date.now()
    const seconds = clockSeconds(state, now)
    if (command.type === 'play') {
      if (state.runningSince !== null && seconds > 0) throw new MatchError('O relógio já está correndo.')
      if (!seconds) throw new MatchError('O período terminou. Avance ou ajuste o relógio.')
      state.remainingSeconds = seconds
      state.runningSince = now
    } else if (command.type === 'pause') {
      state.remainingSeconds = seconds
      state.runningSince = null
    } else if (command.type === 'set') {
      if (state.runningSince !== null && seconds > 0) throw new MatchError('Pause o relógio antes de ajustar.')
      if (!Number.isInteger(command.seconds) || command.seconds < 0 || command.seconds > periodLength(state.period)) throw new MatchError('Informe um tempo válido para este período.')
      state.remainingSeconds = command.seconds
      state.runningSince = null
    } else if (command.type === 'next-period') {
      if (seconds !== 0) throw new MatchError('O relógio precisa estar zerado para avançar o período.')
      if (state.period >= 4 && projection.homeScore !== projection.awayScore) throw new MatchError('A partida tem um vencedor. Encerre o jogo.')
      state.period++
      state.remainingSeconds = periodLength(state.period)
      state.runningSince = null
    } else if (command.type === 'finish') {
      if (state.period < 4 || seconds !== 0) throw new MatchError('Encerre apenas após o último período, com o relógio zerado.')
      if (projection.homeScore === projection.awayScore) throw new MatchError('O placar está empatado. Inicie uma prorrogação.')
      state.status = 'encerrado'
      state.remainingSeconds = 0
      state.runningSince = null
    }
  })
}

export async function recordMatchAction(viewer: DemoUser | null, id: string, revision: number, input: { action: MatchAction; teamId: string; athleteId: string; outAthleteId?: string | null }) {
  return mutate(viewer, id, revision, (state, match, projection) => {
    if (state.status !== 'ao-vivo') throw new MatchError('Inicie a partida para registrar ações.')
    if (!Object.hasOwn(ACTION_LABEL, input.action)) throw new MatchError('Ação desconhecida.')
    if (![match.homeTeamId, match.awayTeamId].includes(input.teamId)) throw new MatchError('Escolha uma equipe desta partida.')
    const athlete = projection.box.find((a) => a.athleteId === input.athleteId && a.teamId === input.teamId)
    if (!athlete || !athlete.eligible) throw new MatchError('Escolha um atleta disponível desta equipe.')
    if (athlete.fouls >= 5) throw new MatchError('Este atleta atingiu o limite de faltas.')
    if (input.action === 'substitution') {
      if (athlete.onCourt) throw new MatchError('O atleta que entra já está em quadra.')
      const out = projection.box.find((a) => a.athleteId === input.outAthleteId && a.teamId === input.teamId && a.onCourt)
      const count = projection.box.filter((a) => a.teamId === input.teamId && a.onCourt).length
      if (input.outAthleteId && !out) throw new MatchError('Escolha um atleta em quadra para sair.')
      if (count >= 5 && !out) throw new MatchError('Retire um atleta antes de colocar outro em quadra.')
    } else if (!athlete.onCourt) throw new MatchError('O atleta precisa estar em quadra para registrar a ação.')
    state.events.push({ id: newId('lance'), action: input.action, teamId: input.teamId, athleteId: input.athleteId, outAthleteId: input.action === 'substitution' ? input.outAthleteId ?? null : null, period: state.period, seconds: clockSeconds(state) })
  })
}

export async function undoMatchAction(viewer: DemoUser | null, id: string, revision: number) {
  return mutate(viewer, id, revision, (state) => {
    if (state.status !== 'ao-vivo' || !state.events.length) throw new MatchError('Não há ação registrada para desfazer.')
    state.events.pop()
  })
}
