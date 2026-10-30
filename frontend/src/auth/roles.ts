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

export type Role = 'tecnico' | 'atleta' | 'estatistico' | 'basico'

export type Permission =
  | 'team.manage' // criar e editar equipes
  | 'athlete.manage' // adicionar e editar atletas
  | 'schedule.manage' // agendar jogos e treinos
  | 'lineup.manage' // montar escalação
  | 'tactics.use' // quadro tático
  | 'match.record' // registrar ações oficiais da partida
  | 'profile.own' // ver o próprio perfil de atleta

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  tecnico: ['team.manage', 'athlete.manage', 'schedule.manage', 'lineup.manage', 'tactics.use'],
  atleta: ['profile.own'],
  // Quem registra as ações é quem assiste, não o técnico: ele não consegue
  // lançar estatística enquanto dirige o time.
  estatistico: ['match.record'],
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
    can: ['Criar e editar equipes e atletas', 'Agendar jogos e treinos', 'Montar escalação', 'Usar o quadro tático'],
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
  basico: {
    label: 'Usuário básico',
    summary: 'Acompanha jogos, resultados, equipes, campeonatos e perfis públicos.',
    can: ['Ver jogos e resultados', 'Ver equipes, campeonatos e perfis públicos'],
  },
}

export type DemoUser = {
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
}

export const DEMO_USERS: Record<Role, DemoUser> = {
  tecnico: { id: 'u-marina', email: 'marina@camphoop.demo', name: 'Marina Costa', initials: 'MC', role: 'tecnico', context: 'Treinadora · Quadra Viva Sub-17', teamId: 'qv-sub17-f' },
  atleta: { id: 'u-luiza', email: 'luiza@camphoop.demo', name: 'Luiza Martins', initials: 'LM', role: 'atleta', context: 'Armadora #8 · Quadra Viva Sub-17', teamId: 'qv-sub17-f', athleteId: 'luiza-martins' },
  estatistico: { id: 'u-carlos', email: 'carlos@camphoop.demo', name: 'Carlos Mendes', initials: 'CM', role: 'estatistico', context: 'Estatístico · Liga Escolar SP' },
  basico: { id: 'u-joao', email: 'joao@camphoop.demo', name: 'João Pereira', initials: 'JP', role: 'basico', context: 'Torcedor' },
}

export const ROLES: Role[] = ['tecnico', 'atleta', 'estatistico', 'basico']

export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}
