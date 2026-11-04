/**
 * Alterações feitas na demonstração (treinos e jogos agendados), salvas no
 * navegador por cima dos dados fictícios. Quando houver backend, isto some:
 * as funções em api/ passam a chamar a API, que guarda no banco.
 */
import { competitions, competitionTeams, trainingSlots as defaultSlots, upcomingMatches, matches, statLines } from './data'
import type { Competition } from '../types'
import type { MatchState } from '../liveTypes'
import type { TacticDraft, TacticalPlay } from '../tacticsTypes'
import { matchPeriod, projectMatch } from '../matchProjection'

const STORAGE_KEY = 'camphoop.demoData.v1'

export type TrainingSlot = { id: string; teamId: string; weekday: number; time: string; venue: string }

/** Exceção numa data: treino cancelado ou treino avulso (remarcar = cancelar + avulso). */
export type TrainingChange =
  | { id: string; kind: 'cancelado'; teamId: string; slotId: string; date: string }
  | { id: string; kind: 'avulso'; teamId: string; date: string; time: string; venue: string; note: string | null }

export type UpcomingMatch = {
  id: string
  date: string
  time: string
  homeTeamId: string
  awayTeamId: string
  /** `null` = amistoso. */
  competitionId: string | null
  venue: string
  live: { homeScore: number; awayScore: number; period: string } | null
}

type DemoData = {
  slots: TrainingSlot[]; changes: TrainingChange[]; matches: UpcomingMatch[]
  competitions: Competition[]
  registrations: { competitionId: string; teamId: string }[]
  liveMatches: Record<string, MatchState>
  tacticalPlays: TacticalPlay[]
  tacticsDrafts: Record<string, TacticDraft>
}

function defaults(): DemoData {
  return {
    slots: defaultSlots.map((s) => ({ id: `${s.teamId}-${s.weekday}-${s.time}`, ...s })),
    changes: [],
    matches: [],
    competitions: [],
    registrations: [],
    liveMatches: {},
    tacticalPlays: [],
    tacticsDrafts: {},
  }
}

function load(): DemoData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaults(), ...JSON.parse(raw) }
  } catch {
    // Sem armazenamento ou dado corrompido: volta ao padrão.
  }
  return defaults()
}

let data = load()
let revision = 0
const listeners = new Set<() => void>()
function notify() { revision++; listeners.forEach((listener) => listener()) }
export function subscribeDemoData(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export const demoRevision = () => revision
if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY || event.key === null) { data = load(); notify() }
})

export function demoData(): Readonly<DemoData> {
  return data
}

export function changeDemoData(fn: (draft: DemoData) => void) {
  fn(data)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Sem armazenamento: a alteração vale até recarregar a página.
  }
  notify()
}

export function resetDemoData() {
  data = defaults()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignorado
  }
  notify()
}

/** Jogos agendados: os fictícios e os criados na demonstração. */
export function allUpcomingMatches(): UpcomingMatch[] {
  return allScheduledMatches().filter((m) => data.liveMatches[m.id]?.status !== 'encerrado').map((m) => {
    const state = data.liveMatches[m.id]
    if (!state || state.status === 'agendado') return m
    const projected = projectMatch(m, state)
    return { ...m, live: { homeScore: projected.homeScore, awayScore: projected.awayScore, period: matchPeriod(state) } }
  })
}

export function allScheduledMatches(): UpcomingMatch[] { return [...upcomingMatches, ...data.matches] }

export type FinishedMatch = (typeof matches)[number] & { time?: string; venue?: string }
export function allFinishedMatches(): FinishedMatch[] {
  return [...matches, ...allScheduledMatches().filter((m) => data.liveMatches[m.id]?.status === 'encerrado').map((m) => {
    const projected = projectMatch(m, data.liveMatches[m.id])
    return { ...m, homeScore: projected.homeScore, awayScore: projected.awayScore }
  })]
}

export type MatchStatRow = [string, string, number, number, number, number | null]
export function allStatLines(): MatchStatRow[] {
  return [...statLines, ...allScheduledMatches().filter((m) => data.liveMatches[m.id]?.status === 'encerrado').flatMap((m) =>
    projectMatch(m, data.liveMatches[m.id]).box.filter((a) => a.played).map((a): MatchStatRow => [m.id, a.athleteId, a.points, a.offensiveRebounds + a.defensiveRebounds, a.assists, null]),
  )]
}

export function competitionTeamIds(id: string): string[] {
  return [...new Set([...(competitionTeams[id] ?? []), ...data.registrations.filter((r) => r.competitionId === id).map((r) => r.teamId)])]
}

/** Leitura compartilhada: agenda, equipes, início e páginas públicas usam os mesmos cadastros. */
export function allCompetitions(): Competition[] {
  return [...competitions, ...data.competitions].map((c) => ({ ...c, teams: competitionTeamIds(c.id).length }))
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
