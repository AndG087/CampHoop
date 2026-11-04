import { request, DATA_SEASON } from './client'
import type { AthleteStatus, Category, Gender, TeamProfile } from './types'

export type TeamFields = { name: string; category: Category; gender: Gender; coach: string }
export type ClubFields = { name: string; shortName: string; city: string }
export type ManagedTeam = { id: string; name: string; clubName: string; category: Category; gender: Gender; imported: boolean; editable: boolean; available: boolean; seasons: string[] }
export type ManagementOptions = {
  season: string | null
  teams: ManagedTeam[]
  clubs: (ClubFields & { id: string })[]
  athletes: { id: string; name: string; season: string; teamId: string; number: number | null; position: string }[]
}
export type AthleteFields = { teamId: string; name: string; number: number | null; position: string; birthDate: string | null; heightCm: number | null; memberSince: string | null; photoUrl: string | null; status: Extract<AthleteStatus, 'ativo' | 'lesionado' | 'afastado'> }
export type AthleteEdit = AthleteFields & { id: string; season: string; revision: number; identityLocked: boolean }
export const getManagementOptions = (season = DATA_SEASON) => request<ManagementOptions>(`/management/options?season=${season}`)
export const createTeam = (data: TeamFields & { season: string; clubId?: string; club?: ClubFields }) => request<{ id: string; season: string }>('/management/teams', 'POST', { ...data, makeActive: true })
export const editTeam = (team: TeamProfile, data: TeamFields) => request<{ id: string; season: string }>(`/management/teams/${team.team.id}?season=${DATA_SEASON}`, 'PUT', { ...data, revision: team.team.revision })
export const createTeamSeason = (id: string, data: TeamFields & { sourceSeason: string; targetSeason: string; copyRoster: boolean }) => request<{ id: string; season: string; copiedAthletes: number; skippedAthletes: { id: string; name: string }[] }>(`/management/teams/${id}/seasons`, 'POST', data)
export const getAthleteEdit = (id: string) => request<AthleteEdit>(`/management/athletes/${id}`)
export const createAthlete = (data: AthleteFields & { season: string }) => request<{ id: string; season: string }>('/management/athletes', 'POST', data)
export const editAthlete = (id: string, data: AthleteFields & { revision: number }) => request<{ id: string; season: string }>(`/management/athletes/${id}`, 'PUT', data)
export const linkAthlete = (data: { athleteId: string; teamId: string; season: string; number: number | null; position: string }) => request<{ id: string; season: string }>('/management/roster-links', 'POST', data)
export const activateTeam = (teamId: string) => request('/management/active-team', 'POST', { teamId })

export type TeamAccess = { owner: boolean; coaches: { id: string; name: string; email: string; owner: boolean }[]; authorizations: { id: string; season: string; kind: string; label: string }[] }
export const getTeamAccess = (id: string) => request<TeamAccess>(`/management/teams/${id}/access`)
export const grantCoachAccess = (id: string, email: string) => request(`/management/teams/${id}/access`, 'POST', { email })
export const revokeCoachAccess = (id: string, userId: string) => request(`/management/teams/${id}/access/${userId}`, 'DELETE')
export const authorizeTeam = (id: string, data: { season: string; kind: 'friendly' | 'enroll'; opponentId?: string; date?: string; competitionId?: string }) => request(`/management/teams/${id}/authorizations`, 'POST', data)
export const revokeAuthorization = (id: string, authorizationId: string) => request(`/management/teams/${id}/authorizations/${authorizationId}`, 'DELETE')
export const deleteRosterRecord = (kind: 'athlete' | 'team' | 'season', id: string, season: string, revision: number) => request(kind === 'athlete' ? `/management/athletes/${id}` : kind === 'season' ? `/management/teams/${id}/seasons/${season}` : `/management/teams/${id}?season=${season}`, 'DELETE', { revision })
