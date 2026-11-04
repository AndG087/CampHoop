import { request } from './client'
import type { DemoUser, Role } from '../auth/roles'

export type ClubMembership = { id: string; name: string; shortName: string; city: string; role: string; teamId: string | null; athleteId: string | null }
export type Invitation = { id: string; email: string; role: Role; teamId: string | null; athleteId: string | null; expiresAt: string; status: 'pending' | 'accepted' | 'revoked' | 'expired'; club?: string }
export type Member = { id: string; name: string; email: string; role: string; teamId: string | null; athleteId: string | null }
export type ClubDetail = ClubMembership & { owner: boolean; teams: { id: string; name: string }[]; members: Member[]; athletes: { id: string; name: string; teamId: string; season: string }[]; invitations: Invitation[] }
export type Account = DemoUser & { googleLinked: boolean; mail: { transport: string; gmailConnected: boolean }; canConnectGmail: boolean }
export const getProviders = () => request<{ google: boolean; gmail: boolean; localDelivery: boolean }>('/auth/providers')
export const registerAccount = (data: { name: string; email: string; password: string }) => request<DemoUser>('/auth/register', 'POST', data)
export const verifyEmail = (token: string) => request('/auth/verify', 'POST', { token })
export const resendVerification = () => request('/auth/verification', 'POST')
export const forgotPassword = (email: string) => request<{ message: string }>('/auth/password/forgot', 'POST', { email })
export const resetPassword = (token: string, password: string) => request('/auth/password/reset', 'POST', { token, password })
export const getAccount = () => request<Account>('/account')
export const savePreferences = (emailNotifications: boolean) => request('/account/preferences', 'PUT', { emailNotifications })
export const disconnectGmail = () => request('/auth/gmail', 'DELETE')
export const listClubs = () => request<ClubMembership[]>('/clubs')
export const createClub = (data: { name: string; shortName: string; city: string }) => request<ClubMembership>('/clubs', 'POST', data)
export const getClub = (id: string) => request<ClubDetail>(`/clubs/${id}`)
export const activateClub = (id: string) => request(`/clubs/${id}/active`, 'POST')
export const inviteMember = (id: string, data: { email: string; role: Role; teamId: string | null; athleteId: string | null }) => request<Invitation>(`/clubs/${id}/invitations`, 'POST', data)
export const revokeInvitation = (clubId: string, id: string) => request(`/clubs/${clubId}/invitations/${id}`, 'DELETE')
export const removeMember = (clubId: string, id: string) => request(`/clubs/${clubId}/members/${id}`, 'DELETE')
export const updateMemberTeam = (clubId: string, id: string, teamId: string | null, athleteId: string | null) => request(`/clubs/${clubId}/members/${id}`, 'PUT', { teamId, athleteId })
export const listInvitations = () => request<Invitation[]>('/invitations')
export const previewInvitation = (token: string) => request<{ club: string; role: Role; expiresAt: string }>('/invitations/preview', 'POST', { token })
export const acceptInvitation = (data: { token?: string; invitationId?: string }) => request<{ clubId: string; user: DemoUser }>('/invitations/accept', 'POST', data)
export function pendingInvitation() { try { return sessionStorage.getItem('camphoop.pendingInvite') ?? '' } catch { return '' } }
export function storeInvitation(token: string) { try { if (token) sessionStorage.setItem('camphoop.pendingInvite', token); else sessionStorage.removeItem('camphoop.pendingInvite') } catch { /* Optional browser storage. */ } }
