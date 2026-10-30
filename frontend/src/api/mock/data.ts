/**
 * Dados fictícios do CampHoop. Imitam as tabelas que o backend terá
 * (clubes, equipes, atletas, partidas, linhas de estatística).
 * Todas as telas leem daqui pela camada api/, nunca direto.
 */
import type { AthleteStatus, Category, Development, Gender } from '../types'

/** "Hoje" da demonstração: mantém idades e datas coerentes com a temporada 2025/26. */
export const DEMO_TODAY = '2025-10-29'

export const clubs = [
  { id: 'quadra-viva', name: 'Quadra Viva', shortName: 'QV', city: 'São Paulo, SP' },
  { id: 'sao-atlas', name: 'São Atlas', shortName: 'SA', city: 'São Paulo, SP' },
  { id: 'vale-basket', name: 'Vale Basket', shortName: 'VB', city: 'São José dos Campos, SP' },
  { id: 'fenix-clube', name: 'Fênix Clube', shortName: 'FC', city: 'Campinas, SP' },
]

type TeamRow = { id: string; clubId: string; category: Category; gender: Gender }

export const teams: TeamRow[] = [
  { id: 'qv-sub17-f', clubId: 'quadra-viva', category: 'Sub-17', gender: 'Feminino' },
  { id: 'qv-sub15-m', clubId: 'quadra-viva', category: 'Sub-15', gender: 'Masculino' },
  { id: 'qv-sub13-x', clubId: 'quadra-viva', category: 'Sub-13', gender: 'Misto' },
  { id: 'sa-sub17-f', clubId: 'sao-atlas', category: 'Sub-17', gender: 'Feminino' },
  { id: 'vb-sub17-f', clubId: 'vale-basket', category: 'Sub-17', gender: 'Feminino' },
  { id: 'vb-sub15-m', clubId: 'vale-basket', category: 'Sub-15', gender: 'Masculino' },
  { id: 'fc-sub17-f', clubId: 'fenix-clube', category: 'Sub-17', gender: 'Feminino' },
  { id: 'fc-sub13-x', clubId: 'fenix-clube', category: 'Sub-13', gender: 'Misto' },
]

type AthleteRow = {
  id: string
  teamId: string
  name: string
  number: number
  position: string
  birthDate: string
  heightCm: number
  memberSince: string
  status: AthleteStatus
}

export const athletes: AthleteRow[] = [
  // Quadra Viva · Sub-17 Feminino (equipe da técnica Marina Costa)
  { id: 'luiza-martins', teamId: 'qv-sub17-f', name: 'Luiza Martins', number: 8, position: 'Armadora', birthDate: '2009-03-14', heightCm: 168, memberSince: '2024-03', status: 'ativo' },
  { id: 'ana-ribeiro', teamId: 'qv-sub17-f', name: 'Ana Ribeiro', number: 12, position: 'Ala-armadora', birthDate: '2009-07-02', heightCm: 171, memberSince: '2023-02', status: 'ativo' },
  { id: 'bia-costa', teamId: 'qv-sub17-f', name: 'Bia Costa', number: 5, position: 'Ala', birthDate: '2010-01-21', heightCm: 174, memberSince: '2024-08', status: 'ativo' },
  { id: 'clara-souza', teamId: 'qv-sub17-f', name: 'Clara Souza', number: 23, position: 'Pivô', birthDate: '2009-11-09', heightCm: 184, memberSince: '2022-05', status: 'ativo' },
  { id: 'nina-lima', teamId: 'qv-sub17-f', name: 'Nina Lima', number: 11, position: 'Ala-pivô', birthDate: '2010-04-30', heightCm: 179, memberSince: '2024-02', status: 'ativo' },
  { id: 'duda-alves', teamId: 'qv-sub17-f', name: 'Duda Alves', number: 3, position: 'Armadora', birthDate: '2010-09-17', heightCm: 163, memberSince: '2025-02', status: 'lesionado' },
  // Quadra Viva · Sub-15 Masculino
  { id: 'rafael-alves', teamId: 'qv-sub15-m', name: 'Rafael Alves', number: 7, position: 'Armador', birthDate: '2011-05-03', heightCm: 170, memberSince: '2025-10', status: 'ativo' },
  { id: 'gabriel-santos', teamId: 'qv-sub15-m', name: 'Gabriel Santos', number: 10, position: 'Ala', birthDate: '2011-08-22', heightCm: 176, memberSince: '2024-03', status: 'ativo' },
  { id: 'theo-oliveira', teamId: 'qv-sub15-m', name: 'Theo Oliveira', number: 14, position: 'Pivô', birthDate: '2012-01-11', heightCm: 185, memberSince: '2024-09', status: 'ativo' },
  { id: 'miguel-rocha', teamId: 'qv-sub15-m', name: 'Miguel Rocha', number: 4, position: 'Ala-armador', birthDate: '2011-12-02', heightCm: 172, memberSince: '2023-08', status: 'afastado' },
  // Quadra Viva · Sub-13 Misto
  { id: 'lara-nunes', teamId: 'qv-sub13-x', name: 'Lara Nunes', number: 9, position: 'Armadora', birthDate: '2013-04-18', heightCm: 152, memberSince: '2025-03', status: 'ativo' },
  { id: 'enzo-ferreira', teamId: 'qv-sub13-x', name: 'Enzo Ferreira', number: 6, position: 'Ala', birthDate: '2013-10-05', heightCm: 155, memberSince: '2025-03', status: 'ativo' },
  { id: 'sofia-melo', teamId: 'qv-sub13-x', name: 'Sofia Melo', number: 15, position: 'Pivô', birthDate: '2014-02-27', heightCm: 160, memberSince: '2025-05', status: 'ativo' },
  // Outros clubes
  { id: 'isabela-prado', teamId: 'sa-sub17-f', name: 'Isabela Prado', number: 10, position: 'Armadora', birthDate: '2009-06-11', heightCm: 167, memberSince: '2023-01', status: 'ativo' },
  { id: 'julia-teixeira', teamId: 'sa-sub17-f', name: 'Júlia Teixeira', number: 21, position: 'Pivô', birthDate: '2009-02-03', heightCm: 186, memberSince: '2022-03', status: 'ativo' },
  { id: 'carol-mendes', teamId: 'vb-sub17-f', name: 'Carol Mendes', number: 4, position: 'Ala', birthDate: '2009-12-19', heightCm: 175, memberSince: '2024-01', status: 'ativo' },
  { id: 'pedro-lima', teamId: 'vb-sub15-m', name: 'Pedro Lima', number: 8, position: 'Ala', birthDate: '2011-03-29', heightCm: 178, memberSince: '2023-06', status: 'ativo' },
  { id: 'helena-vieira', teamId: 'fc-sub17-f', name: 'Helena Vieira', number: 13, position: 'Ala-armadora', birthDate: '2009-09-14', heightCm: 172, memberSince: '2022-08', status: 'ativo' },
  { id: 'davi-campos', teamId: 'fc-sub13-x', name: 'Davi Campos', number: 11, position: 'Armador', birthDate: '2013-07-08', heightCm: 154, memberSince: '2024-04', status: 'ativo' },
]

type MatchRow = { id: string; date: string; homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number }

export const matches: MatchRow[] = [
  { id: 'm-100', date: '2025-09-28', homeTeamId: 'sa-sub17-f', awayTeamId: 'qv-sub17-f', homeScore: 58, awayScore: 62 },
  { id: 'm-101', date: '2025-10-12', homeTeamId: 'qv-sub17-f', awayTeamId: 'sa-sub17-f', homeScore: 68, awayScore: 54 },
  { id: 'm-102', date: '2025-10-19', homeTeamId: 'vb-sub17-f', awayTeamId: 'qv-sub17-f', homeScore: 48, awayScore: 59 },
  { id: 'm-103', date: '2025-10-26', homeTeamId: 'qv-sub17-f', awayTeamId: 'fc-sub17-f', homeScore: 51, awayScore: 55 },
  { id: 'm-201', date: '2025-10-10', homeTeamId: 'qv-sub15-m', awayTeamId: 'vb-sub15-m', homeScore: 54, awayScore: 49 },
  { id: 'm-202', date: '2025-10-24', homeTeamId: 'vb-sub15-m', awayTeamId: 'qv-sub15-m', homeScore: 61, awayScore: 57 },
  { id: 'm-301', date: '2025-10-18', homeTeamId: 'qv-sub13-x', awayTeamId: 'fc-sub13-x', homeScore: 38, awayScore: 31 },
  { id: 'm-302', date: '2025-10-25', homeTeamId: 'fc-sub13-x', awayTeamId: 'qv-sub13-x', homeScore: 35, awayScore: 40 },
]

/** [partida, atleta, pontos, rebotes, assistências, minutos] */
type StatRow = [string, string, number, number, number, number]

export const statLines: StatRow[] = [
  ['m-100', 'luiza-martins', 18, 4, 6, 30], ['m-101', 'luiza-martins', 22, 5, 7, 31], ['m-102', 'luiza-martins', 18, 4, 8, 29], ['m-103', 'luiza-martins', 15, 6, 5, 30],
  ['m-100', 'ana-ribeiro', 14, 3, 4, 28], ['m-101', 'ana-ribeiro', 12, 5, 3, 27], ['m-102', 'ana-ribeiro', 15, 2, 4, 29], ['m-103', 'ana-ribeiro', 11, 4, 2, 26],
  ['m-100', 'bia-costa', 9, 7, 2, 25], ['m-101', 'bia-costa', 8, 8, 1, 24], ['m-102', 'bia-costa', 11, 6, 2, 26], ['m-103', 'bia-costa', 10, 7, 3, 27],
  ['m-100', 'clara-souza', 10, 11, 1, 27], ['m-101', 'clara-souza', 12, 12, 2, 28], ['m-102', 'clara-souza', 7, 9, 1, 24], ['m-103', 'clara-souza', 8, 10, 0, 25],
  ['m-100', 'nina-lima', 7, 6, 1, 20], ['m-101', 'nina-lima', 9, 5, 2, 22], ['m-102', 'nina-lima', 6, 7, 1, 21], ['m-103', 'nina-lima', 5, 4, 1, 19],
  ['m-100', 'duda-alves', 4, 1, 3, 14], ['m-101', 'duda-alves', 5, 2, 4, 15],
  ['m-201', 'rafael-alves', 6, 2, 3, 16],
  ['m-201', 'gabriel-santos', 16, 5, 2, 30], ['m-202', 'gabriel-santos', 19, 6, 3, 31],
  ['m-201', 'theo-oliveira', 12, 10, 1, 28], ['m-202', 'theo-oliveira', 14, 11, 0, 29],
  ['m-201', 'miguel-rocha', 8, 3, 5, 24],
  ['m-301', 'lara-nunes', 12, 3, 4, 24], ['m-302', 'lara-nunes', 14, 2, 5, 25],
  ['m-301', 'enzo-ferreira', 9, 4, 2, 22], ['m-302', 'enzo-ferreira', 11, 5, 1, 23],
  ['m-301', 'sofia-melo', 8, 8, 0, 20], ['m-302', 'sofia-melo', 7, 9, 1, 21],
  ['m-100', 'isabela-prado', 17, 3, 6, 32], ['m-101', 'isabela-prado', 15, 4, 5, 31],
  ['m-100', 'julia-teixeira', 14, 12, 1, 30], ['m-101', 'julia-teixeira', 11, 10, 2, 29],
  ['m-102', 'carol-mendes', 13, 5, 2, 30],
  ['m-201', 'pedro-lima', 15, 6, 2, 30], ['m-202', 'pedro-lima', 21, 7, 3, 32],
  ['m-103', 'helena-vieira', 19, 4, 4, 33],
  ['m-301', 'davi-campos', 10, 2, 3, 24], ['m-302', 'davi-campos', 13, 3, 4, 25],
]

/** Objetivos de treino: dado interno da comissão técnica. */
export const development: Record<string, Development> = {
  'luiza-martins': { goal: 'Aprimorar leitura de pick and roll e tomada de decisão sob pressão.', progress: 68, reviewDate: '2025-11-12' },
  'ana-ribeiro': { goal: 'Ganhar consistência no arremesso de três após o drible.', progress: 45, reviewDate: '2025-11-19' },
  'clara-souza': { goal: 'Melhorar o posicionamento no rebote defensivo.', progress: 80, reviewDate: '2025-11-05' },
  'duda-alves': { goal: 'Retorno gradual após entorse no tornozelo, com liberação da fisioterapia.', progress: 30, reviewDate: '2025-11-03' },
}

/** Campeonatos (página pública e, depois, etapa 7). */
export const competitions = [
  { id: 'liga-escolar-sp', name: 'Liga Escolar SP', status: 'em-andamento' as const, phase: 'Fase de grupos', categories: 'Sub-13 a Sub-17', teams: 12, note: 'Até 18 de dezembro' },
  { id: 'copa-base-paulista', name: 'Copa Base Paulista', status: 'inscricoes' as const, phase: 'Inscrições abertas', categories: 'Sub-15 e Sub-17', teams: 8, note: 'Inscrições até 5 de novembro' },
  { id: 'circuito-metropolitano', name: 'Circuito Metropolitano', status: 'finalizado' as const, phase: 'Encerrado', categories: 'Sub-17 Feminino', teams: 16, note: 'Campeã: Quadra Viva' },
]

/** Jogos de hoje e dos próximos dias. O placar ao vivo virá do estatístico (etapa 8). */
export const upcomingMatches = [
  { id: 'm-110', date: '2025-10-29', time: '16:30', homeTeamId: 'qv-sub17-f', awayTeamId: 'sa-sub17-f', competitionId: 'liga-escolar-sp', venue: 'Ginásio Central · Quadra 1', live: { homeScore: 42, awayScore: 38, period: '3º período · 04:32' } },
  { id: 'm-203', date: '2025-10-31', time: '18:00', homeTeamId: 'qv-sub15-m', awayTeamId: 'vb-sub15-m', competitionId: 'liga-escolar-sp', venue: 'Quadra Norte', live: null },
  { id: 'm-111', date: '2025-11-02', time: '10:00', homeTeamId: 'qv-sub17-f', awayTeamId: 'fc-sub17-f', competitionId: 'liga-escolar-sp', venue: 'Ginásio Central · Quadra 1', live: null },
]
