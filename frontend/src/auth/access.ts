import { roleCan, type DemoUser } from './roles'

/**
 * Regras de acesso que dependem de quem é o dono do dado, não só do perfil.
 * O técnico só mexe na própria equipe; o atleta só vê os próprios dados privados.
 */

type AthleteRef = { id: string; teamId: string }

export function isOwnAthlete(user: DemoUser | null, athlete: AthleteRef): boolean {
  return !!user && user.athleteId === athlete.id
}

export function coachesTeam(user: DemoUser | null, teamId: string): boolean {
  return !!user && user.role === 'tecnico' && user.teamId === teamId
}

/** Data de nascimento completa e objetivo de treino (decisão #5: só técnico da equipe e o próprio atleta). */
export function canViewAthletePrivate(user: DemoUser | null, athlete: AthleteRef): boolean {
  return isOwnAthlete(user, athlete) || coachesTeam(user, athlete.teamId)
}

export function canEditAthlete(user: DemoUser | null, athlete: AthleteRef): boolean {
  return !!user && roleCan(user.role, 'athlete.manage') && coachesTeam(user, athlete.teamId)
}
