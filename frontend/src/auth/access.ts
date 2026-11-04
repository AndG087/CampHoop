import { roleCan, type DemoUser } from './roles'

/**
 * Regras de acesso que dependem de quem é o dono do dado, não só do perfil.
 * O técnico só mexe na própria equipe; o atleta só vê os próprios dados privados.
 */

type AthleteRef = { id: string; teamId: string }

export function isOwnAthlete(user: DemoUser | null, athlete: AthleteRef): boolean {
  return !!user && (user.athleteId === athlete.id || !!user.athleteIds?.includes(athlete.id))
}

export function coachesTeam(user: DemoUser | null, teamId: string): boolean {
  return !!user && user.role === 'tecnico' && (user.teamId === teamId || !!user.teamIds?.includes(teamId))
}

/** Data de nascimento completa e objetivo de treino (decisão #5: só técnico da equipe e o próprio atleta). */
export function canViewAthletePrivate(user: DemoUser | null, athlete: AthleteRef): boolean {
  return isOwnAthlete(user, athlete) || coachesTeam(user, athlete.teamId)
}

export function canEditAthlete(user: DemoUser | null, athlete: AthleteRef): boolean {
  return !!user && roleCan(user.role, 'athlete.manage') && (user.managedTeamIds ? user.managedTeamIds.includes(athlete.teamId) : coachesTeam(user, athlete.teamId))
}

export function canEditTeam(user: DemoUser | null, teamId: string): boolean {
  return !!user && roleCan(user.role, 'team.manage') && (user.managedTeamIds ? user.managedTeamIds.includes(teamId) : coachesTeam(user, teamId))
}

/** Horário fixo e exceções de treino: só o técnico da própria equipe. */
export function canManageTraining(user: DemoUser | null, teamId: string): boolean {
  return !!user && roleCan(user.role, 'training.manage') && coachesTeam(user, teamId)
}

/** Amistoso: o técnico agenda quando a equipe dele joga (em casa ou fora). */
export function canScheduleFriendly(user: DemoUser | null, teamIds: string[]): boolean {
  return !!user && roleCan(user.role, 'friendly.schedule') && teamIds.some((id) => coachesTeam(user, id))
}

/** Jogo oficial: só o organizador, nos campeonatos que administra. */
export function canManageCompetition(user: DemoUser | null, competition: { id: string; organizerId: string | null }): boolean {
  return !!user && roleCan(user.role, 'competition.manage') && (competition.organizerId === user.id || !!user.competitionIds?.includes(competition.id))
}

export function canScheduleOfficial(user: DemoUser | null, competitionId: string, organizerId: string | null = null): boolean {
  return !!user && roleCan(user.role, 'match.schedule') && canManageCompetition(user, { id: competitionId, organizerId })
}
