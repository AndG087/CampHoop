/**
 * Alterações feitas na demonstração (treinos e jogos agendados), salvas no
 * navegador por cima dos dados fictícios. Quando houver backend, isto some:
 * as funções em api/ passam a chamar a API, que guarda no banco.
 */
import { competitions, competitionTeams, trainingSlots as defaultSlots, upcomingMatches } from './data'
import type { Competition } from '../types'

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
}

function defaults(): DemoData {
  return {
    slots: defaultSlots.map((s) => ({ id: `${s.teamId}-${s.weekday}-${s.time}`, ...s })),
    changes: [],
    matches: [],
    competitions: [],
    registrations: [],
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
}

export function resetDemoData() {
  data = defaults()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignorado
  }
}

/** Jogos agendados: os fictícios e os criados na demonstração. */
export function allUpcomingMatches(): UpcomingMatch[] {
  return [...upcomingMatches, ...data.matches]
}

export function competitionTeamIds(id: string): string[] {
  return [...new Set([...(competitionTeams[id] ?? []), ...data.registrations.filter((r) => r.competitionId === id).map((r) => r.teamId)])]
}

/** Leitura compartilhada: agenda, equipes, início e páginas públicas usam os mesmos cadastros. */
export function allCompetitions(): Competition[] {
  return [...competitions, ...data.competitions].map((c) => ({ ...c, teams: competitionTeamIds(c.id).length }))
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
