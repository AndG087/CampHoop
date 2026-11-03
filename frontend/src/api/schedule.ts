import { remoteApi, request } from './client'
/**
 * Agenda: jogos e treinos num intervalo de datas, e as ações de agendamento.
 * Depois vira GET /schedule e os POST/DELETE de treinos e jogos.
 *
 * Regras (o backend vai aplicar as mesmas):
 * - jogos são públicos; treinos só aparecem para quem é da equipe;
 * - o técnico define os treinos e agenda amistosos da própria equipe;
 * - o organizador agenda jogos oficiais dos campeonatos que administra.
 */
import { canManageTraining, canScheduleFriendly, canScheduleOfficial } from '../auth/access'
import type { DemoUser } from '../auth/roles'
import { delay, teamById } from './athletes'
import { allCompetitions, allFinishedMatches, allUpcomingMatches, changeDemoData, competitionTeamIds, demoData, newId } from './mock/store'
import { finishedGame, scheduledGame } from './public'
import type { ScheduleEvent } from './types'

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** "2025-11-03" → "seg, 3 nov" */
function shortLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${WEEKDAYS[weekdayOf(date)]}, ${d} ${MONTHS[m - 1]}`
}

/** Datas AAAA-MM-DD entre `from` e `to`, inclusive. */
function eachDay(from: string, to: string): string[] {
  const days = []
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const end = Date.UTC(ty, tm - 1, td)
  for (let t = Date.UTC(fy, fm - 1, fd); t <= end; t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10))
  return days
}

/** Jogos (encerrados e agendados) de uma equipe numa data. */
function teamHasGame(teamId: string, date: string): boolean {
  return [...allFinishedMatches(), ...allUpcomingMatches()].some((m) => m.date === date && (m.homeTeamId === teamId || m.awayTeamId === teamId))
}

export async function listSchedule(from: string, to: string, viewer: DemoUser | null): Promise<ScheduleEvent[]> {
  if (remoteApi) return request(`/schedule?start=${from}&end=${to}`)

  await delay()
  const inRange = (date: string) => date >= from && date <= to

  const games: ScheduleEvent[] = [
    ...allFinishedMatches().filter((m) => inRange(m.date)).map(finishedGame),
    ...allUpcomingMatches().filter((m) => inRange(m.date)).map(scheduledGame),
  ].map((game) => ({ kind: 'jogo', id: game.id, date: game.date, time: game.time, game }))

  const teamId = viewer?.teamId
  const trainings: ScheduleEvent[] = []
  if (teamId) {
    const { slots, changes } = demoData()
    const team = teamById(teamId)
    for (const date of eachDay(from, to)) {
      // Em dia de jogo da equipe não há treino do horário fixo.
      if (teamHasGame(teamId, date)) continue
      for (const slot of slots.filter((s) => s.teamId === teamId && s.weekday === weekdayOf(date))) {
        const cancelled = changes.some((c) => c.kind === 'cancelado' && c.slotId === slot.id && c.date === date)
        trainings.push({ kind: 'treino', id: `t-${slot.id}-${date}`, date, time: slot.time, team, venue: slot.venue, slotId: slot.id, cancelled, note: null })
      }
    }
    for (const c of changes) {
      if (c.kind === 'avulso' && c.teamId === teamId && inRange(c.date)) {
        trainings.push({ kind: 'treino', id: c.id, date: c.date, time: c.time, team, venue: c.venue, slotId: null, cancelled: false, note: c.note })
      }
    }
  }

  return [...games, ...trainings].sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
}

/** Erro de regra de negócio, com mensagem pronta para mostrar na tela. */
export class ScheduleError extends Error {}

function requireTraining(viewer: DemoUser | null, teamId: string) {
  if (!canManageTraining(viewer, teamId)) throw new ScheduleError('Só o técnico da equipe pode alterar os treinos.')
}

export async function listTrainingSlots(teamId: string) {
  if (remoteApi) return request(`/training/slots?teamId=${encodeURIComponent(teamId)}`)

  await delay()
  return demoData()
    .slots.filter((s) => s.teamId === teamId)
    .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time))
}

export async function addTrainingSlot(viewer: DemoUser | null, slot: { teamId: string; weekday: number; time: string; venue: string }) {
  if (remoteApi) return request('/training/slots', 'POST', slot)

  await delay()
  requireTraining(viewer, slot.teamId)
  const clash = demoData().slots.some((s) => s.teamId === slot.teamId && s.weekday === slot.weekday && s.time === slot.time)
  if (clash) throw new ScheduleError('Já existe um treino nesse dia e horário.')
  changeDemoData((d) => d.slots.push({ id: newId('slot'), ...slot }))
}

export async function removeTrainingSlot(viewer: DemoUser | null, slotId: string) {
  if (remoteApi) return request(`/training/slots/${slotId}`, 'DELETE')

  await delay()
  const slot = demoData().slots.find((s) => s.id === slotId)
  if (!slot) return
  requireTraining(viewer, slot.teamId)
  changeDemoData((d) => {
    d.slots = d.slots.filter((s) => s.id !== slotId)
    d.changes = d.changes.filter((c) => !(c.kind === 'cancelado' && c.slotId === slotId))
  })
}

export async function cancelTraining(viewer: DemoUser | null, teamId: string, slotId: string, date: string) {
  if (remoteApi) return request('/training/cancel', 'POST', { teamId, slotId, date })

  await delay()
  requireTraining(viewer, teamId)
  changeDemoData((d) => d.changes.push({ id: newId('cancel'), kind: 'cancelado', teamId, slotId, date }))
}

/** Desfaz o cancelamento de um treino do horário fixo. */
export async function restoreTraining(viewer: DemoUser | null, teamId: string, slotId: string, date: string) {
  if (remoteApi) return request('/training/restore', 'POST', { teamId, slotId, date })

  await delay()
  requireTraining(viewer, teamId)
  changeDemoData((d) => {
    d.changes = d.changes.filter((c) => !(c.kind === 'cancelado' && c.slotId === slotId && c.date === date))
  })
}

export async function addExtraTraining(viewer: DemoUser | null, input: { teamId: string; date: string; time: string; venue: string; note?: string }) {
  if (remoteApi) return request('/training/extra', 'POST', input)

  await delay()
  requireTraining(viewer, input.teamId)
  if (teamHasGame(input.teamId, input.date)) throw new ScheduleError('A equipe tem jogo nesse dia. Escolha outra data.')
  changeDemoData((d) => d.changes.push({ id: newId('avulso'), kind: 'avulso', ...input, note: input.note ?? null }))
}

export async function removeExtraTraining(viewer: DemoUser | null, teamId: string, id: string) {
  if (remoteApi) return request(`/training/extra/${id}`, 'DELETE')

  await delay()
  requireTraining(viewer, teamId)
  changeDemoData((d) => {
    d.changes = d.changes.filter((c) => c.id !== id)
  })
}

/** Remarcar = cancelar o treino da data original e criar um avulso na nova data. */
export async function rescheduleTraining(
  viewer: DemoUser | null,
  input: { teamId: string; slotId: string; fromDate: string; date: string; time: string; venue: string },
) {
  if (remoteApi) return request('/training/reschedule', 'POST', input)

  await addExtraTraining(viewer, { teamId: input.teamId, date: input.date, time: input.time, venue: input.venue, note: `Remarcado de ${shortLabel(input.fromDate)}` })
  await cancelTraining(viewer, input.teamId, input.slotId, input.fromDate)
}

export type NewGame = {
  /** `null` = amistoso. */
  competitionId: string | null
  homeTeamId: string
  awayTeamId: string
  date: string
  time: string
  venue: string
}

export async function scheduleGame(viewer: DemoUser | null, game: NewGame) {
  if (remoteApi) return request('/games', 'POST', game)

  await delay()
  const teams = [game.homeTeamId, game.awayTeamId]
  if (game.competitionId) {
    const competition = allCompetitions().find((c) => c.id === game.competitionId)
    if (!competition) throw new ScheduleError('Campeonato não encontrado.')
    if (!canScheduleOfficial(viewer, competition.id, competition.organizerId)) throw new ScheduleError('Só o organizador do campeonato agenda jogos oficiais.')
    if (competition.status === 'finalizado') throw new ScheduleError('Este campeonato já foi finalizado.')
    if (!teams.every((id) => competitionTeamIds(competition.id).includes(id))) throw new ScheduleError('As duas equipes precisam estar inscritas no campeonato.')
  } else if (!canScheduleFriendly(viewer, teams)) {
    throw new ScheduleError('O técnico só agenda amistosos da própria equipe.')
  }
  if (game.homeTeamId === game.awayTeamId) throw new ScheduleError('Escolha duas equipes diferentes.')
  if (teamById(game.homeTeamId).category !== teamById(game.awayTeamId).category) throw new ScheduleError('As equipes precisam ser da mesma categoria.')
  if (teamById(game.homeTeamId).gender !== teamById(game.awayTeamId).gender) throw new ScheduleError('As equipes precisam ser do mesmo gênero.')
  const parsed = new Date(`${game.date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(game.date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== game.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(game.time) || !game.venue.trim()) throw new ScheduleError('Preencha data, horário e local válidos.')
  const busy = teams.find((id) => teamHasGame(id, game.date))
  if (busy) throw new ScheduleError(`${teamById(busy).club.name} · ${teamById(busy).name} já tem jogo nesse dia.`)
  changeDemoData((d) => d.matches.push({ id: newId('m'), ...game, live: null }))
}
