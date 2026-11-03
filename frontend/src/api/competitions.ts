import { remoteApi, request } from './client'
import { canManageCompetition } from '../auth/access'
import { roleCan, type DemoUser } from '../auth/roles'
import { delay, teamById } from './athletes'
import { allCompetitions, allFinishedMatches, allUpcomingMatches, changeDemoData, competitionTeamIds, newId } from './mock/store'
import { finishedGame, scheduledGame } from './public'
import type { Competition, CompetitionDivision, CompetitionProfile, PublicGame, Standing, Team } from './types'

export const DIVISIONS: CompetitionDivision[] = [
  { category: 'Universitário', gender: 'Feminino' },
  { category: 'Universitário', gender: 'Masculino' },
  { category: 'Sub-17', gender: 'Feminino' },
  { category: 'Sub-15', gender: 'Masculino' },
  { category: 'Sub-13', gender: 'Misto' },
]
export const divisionKey = (d: CompetitionDivision) => `${d.category}-${d.gender}`
export const divisionLabel = (d: CompetitionDivision) => `${d.category} ${d.gender}`
export class CompetitionError extends Error {}

/** Regra da demonstração: 2 por vitória, 1 por derrota; desempate por saldo e pontos feitos. */
export function buildStandings(teams: Team[], games: PublicGame[]): Standing[] {
  const rows = new Map(teams.map((team) => [team.id, {
    team, played: 0, wins: 0, losses: 0, points: 0, pointsFor: 0, pointsAgainst: 0, difference: 0, form: [] as ('V' | 'D')[],
  }]))
  for (const g of [...games].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    if (g.status !== 'encerrado' || g.homeScore === null || g.awayScore === null) continue
    const home = rows.get(g.home.id)
    const away = rows.get(g.away.id)
    if (!home || !away || g.homeScore === g.awayScore) continue
    for (const [row, scored, allowed] of [[home, g.homeScore, g.awayScore], [away, g.awayScore, g.homeScore]] as const) {
      const won = scored > allowed
      row.played++
      row.wins += Number(won)
      row.losses += Number(!won)
      row.points += won ? 2 : 1
      row.pointsFor += scored
      row.pointsAgainst += allowed
      row.difference = row.pointsFor - row.pointsAgainst
      row.form.push(won ? 'V' : 'D')
      row.form = row.form.slice(-5)
    }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.difference - a.difference || b.pointsFor - a.pointsFor || a.team.club.name.localeCompare(b.team.club.name, 'pt-BR') || a.team.id.localeCompare(b.team.id))
}

export async function getCompetition(id: string): Promise<CompetitionProfile | null> {
  if (remoteApi) return request(`/competitions/${encodeURIComponent(id)}`)

  await delay()
  const competition = allCompetitions().find((c) => c.id === id)
  if (!competition) return null
  const enrolled = competitionTeamIds(id).map(teamById)
  const games = [
    ...allFinishedMatches().filter((m) => m.competitionId === id).map(finishedGame),
    ...allUpcomingMatches().filter((m) => m.competitionId === id).map(scheduledGame),
  ].sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
  return {
    ...competition, enrolled, games,
    standings: competition.divisions.map((division) => ({
      division,
      rows: buildStandings(enrolled.filter((t) => t.category === division.category && t.gender === division.gender), games),
    })),
  }
}

export async function createCompetition(viewer: DemoUser | null, input: { name: string; divisions: CompetitionDivision[] }): Promise<string> {
  if (remoteApi) return request('/competitions', 'POST', input)

  await delay()
  if (!viewer || !roleCan(viewer.role, 'competition.manage')) throw new CompetitionError('Só o organizador pode criar campeonatos.')
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (name.length < 3 || name.length > 80) throw new CompetitionError('Use um nome entre 3 e 80 caracteres.')
  if (allCompetitions().some((c) => c.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) throw new CompetitionError('Já existe um campeonato com esse nome.')
  const divisions = [...new Map(input.divisions.map((d) => [divisionKey(d), d])).values()]
  if (!divisions.length || divisions.some((d) => !DIVISIONS.some((allowed) => divisionKey(allowed) === divisionKey(d)))) throw new CompetitionError('Escolha pelo menos uma divisão disponível.')
  const competition: Competition = {
    id: newId('campeonato'), name, divisions, organizerId: viewer.id,
    status: 'inscricoes', phase: 'Inscrições abertas', note: 'Inscreva as equipes para preparar a tabela.',
    categories: divisions.map(divisionLabel).join(' · '), teams: 0,
  }
  changeDemoData((d) => d.competitions.push(competition))
  return competition.id
}

export async function enrollTeams(viewer: DemoUser | null, competitionId: string, ids: string[]): Promise<void> {
  if (remoteApi) return request(`/competitions/${competitionId}/enroll`, 'POST', { ids })

  await delay()
  const competition = allCompetitions().find((c) => c.id === competitionId)
  if (!competition) throw new CompetitionError('Campeonato não encontrado.')
  if (!canManageCompetition(viewer, competition)) throw new CompetitionError('Só o organizador deste campeonato pode inscrever equipes.')
  if (competition.status !== 'inscricoes') throw new CompetitionError('As inscrições deste campeonato estão fechadas.')
  if (!ids.length) throw new CompetitionError('Selecione pelo menos uma equipe.')
  const unique = [...new Set(ids)]
  const enrolled = competitionTeamIds(competitionId)
  if (unique.some((id) => enrolled.includes(id))) throw new CompetitionError('Uma das equipes já está inscrita. Atualize a lista.')
  let teams: Team[]
  try { teams = unique.map(teamById) } catch { throw new CompetitionError('Uma das equipes não existe.') }
  if (teams.some((t) => !competition.divisions.some((d) => d.category === t.category && d.gender === t.gender))) throw new CompetitionError('A categoria e o gênero da equipe precisam pertencer a uma divisão do campeonato.')
  changeDemoData((d) => d.registrations.push(...unique.map((teamId) => ({ competitionId, teamId }))))
}
