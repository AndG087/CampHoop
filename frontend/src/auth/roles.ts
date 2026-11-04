/**
 * Perfis e permissões do CampHoop.
 *
 * Sem login, a pessoa vê a página pública com torneios e jogos (issue #19).
 * O sistema completo é para quem entra com uma conta.
 *
 * Demonstração: não há autenticação real. A conta entra pelo e-mail com
 * qualquer senha e fica salva no navegador. Quando o backend existir,
 * `DemoUser` vira a resposta da API de sessão e as permissões passam a ser
 * conferidas também no servidor.
 */

export type Role = 'tecnico' | 'atleta' | 'estatistico' | 'organizador' | 'basico'

export type Permission =
  | 'team.manage' // criar e editar equipes
  | 'athlete.manage' // adicionar e editar atletas
  | 'training.manage' // horário de treinos e exceções da própria equipe
  | 'friendly.schedule' // agendar amistosos da própria equipe
  | 'match.schedule' // agendar jogos oficiais dos campeonatos que organiza
  | 'competition.manage' // criar campeonatos e inscrever equipes (etapa 7)
  | 'lineup.manage' // montar escalação
  | 'tactics.use' // quadro tático
  | 'match.record' // registrar ações oficiais da partida
  | 'profile.own' // ver o próprio perfil de atleta

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  tecnico: ['team.manage', 'athlete.manage', 'training.manage', 'friendly.schedule', 'lineup.manage', 'tactics.use'],
  atleta: ['profile.own'],
  // Quem registra as ações é quem assiste, não o técnico: ele não consegue
  // lançar estatística enquanto dirige o time.
  estatistico: ['match.record'],
  // Jogo oficial depende da tabela, da quadra e do adversário: quem organiza
  // o torneio agenda (decisão da #18).
  organizador: ['match.schedule', 'competition.manage'],
  basico: [],
}

export type RoleInfo = {
  label: string
  summary: string
  /** O que o perfil pode fazer, em frases curtas para a tela de login. */
  can: string[]
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  tecnico: {
    label: 'Técnico',
    summary: 'Gerencia equipes, atletas, agenda, escalação e o quadro tático.',
    can: ['Criar e editar equipes e atletas', 'Definir treinos e agendar amistosos', 'Montar escalação', 'Usar o quadro tático'],
  },
  atleta: {
    label: 'Atleta',
    summary: 'Acompanha o próprio perfil, estatísticas, equipe e agenda.',
    can: ['Ver o próprio perfil e estatísticas', 'Ver equipe, agenda e partidas'],
  },
  estatistico: {
    label: 'Estatístico',
    summary: 'Registra as ações das duas equipes durante a partida ao vivo.',
    can: ['Registrar pontos, rebotes, faltas e substituições', 'Ver jogos, equipes e campeonatos'],
  },
  organizador: {
    label: 'Organizador',
    summary: 'Organiza campeonatos e agenda os jogos oficiais.',
    can: ['Agendar jogos oficiais', 'Criar campeonatos e inscrever equipes'],
  },
  basico: {
    label: 'Usuário básico',
    summary: 'Acompanha jogos, resultados, equipes, campeonatos e perfis públicos.',
    can: ['Ver jogos e resultados', 'Ver equipes, campeonatos e perfis públicos'],
  },
}

export type DemoUser = {
  isDemo?: boolean
  emailVerified?: boolean
  canInviteMembers?: boolean
  hasPassword?: boolean
  emailNotifications?: boolean
  operatorTeamIds?: string[]
  activeClubId?: string | null
  clubs?: { id: string; name: string; role: string }[]
  teamIds?: string[]
  managedTeamIds?: string[]
  id: string
  /** E-mail usado no login de demonstração (qualquer senha é aceita). */
  email: string
  name: string
  initials: string
  role: Role
  /** Linha de contexto abaixo do nome, ex.: "Treinadora · Sub-17". */
  context: string
  /** Equipe do usuário: a que o técnico comanda ou em que o atleta joga. */
  teamId?: string
  /** Cadastro de atleta ligado a esta conta. */
  athleteId?: string
  athleteIds?: string[]
  /** Campeonatos que o organizador administra. */
  competitionIds?: string[]
}

export const DEMO_USERS: Record<Role, DemoUser> = {
  tecnico: { id: 'u-marina', email: 'marina@camphoop.demo', name: 'Marina Costa', initials: 'MC', role: 'tecnico', context: 'Treinadora · Quadra Viva Sub-17', teamId: 'qv-sub17-f' },
  atleta: { id: 'u-luiza', email: 'luiza@camphoop.demo', name: 'Luiza Martins', initials: 'LM', role: 'atleta', context: 'Armadora #8 · Quadra Viva Sub-17', teamId: 'qv-sub17-f', athleteId: 'luiza-martins' },
  estatistico: { id: 'u-carlos', email: 'carlos@camphoop.demo', name: 'Carlos Mendes', initials: 'CM', role: 'estatistico', context: 'Estatístico · Liga Escolar SP' },
  organizador: { id: 'u-beatriz', email: 'beatriz@camphoop.demo', name: 'Beatriz Nogueira', initials: 'BN', role: 'organizador', context: 'Organizadora · Liga Escolar SP', competitionIds: ['liga-escolar-sp', 'copa-base-paulista'] },
  basico: { id: 'u-joao', email: 'joao@camphoop.demo', name: 'João Pereira', initials: 'JP', role: 'basico', context: 'Torcedor' },
}

export const ROLES: Role[] = ['tecnico', 'atleta', 'estatistico', 'organizador', 'basico']

export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}
