/**
 * Contratos das telas atendidos por FastAPI. Dados ausentes na fonte são null.
 * api/mock é reservado ao modo de demonstração e à regressão isolada.
 */

export type Category = 'Sub-13' | 'Sub-15' | 'Sub-17' | 'Universitário'
export type Gender = 'Feminino' | 'Masculino' | 'Misto'
export type AthleteStatus = 'ativo' | 'lesionado' | 'afastado' | 'historico' | 'registrado' | 'desligado'

export type Club = {
  id: string
  name: string
  shortName: string
  city: string
}

export type Team = {
  imported?: boolean
  season?: string | null
  revision?: number
  id: string
  club: Club
  category: Category
  gender: Gender
  /** Ex.: "Sub-17 Feminino". */
  name: string
}

/** Dados públicos de um atleta: o que qualquer perfil pode ver. */
export type AthleteSummary = {
  imported?: boolean
  revision?: number
  season?: string | null
  id: string
  name: string
  number: number | null
  position: string
  photoUrl: string | null
  age: number | null
  heightCm: number | null
  memberSince: string | null // AAAA-MM
  status: AthleteStatus
  /** Capitão da equipe na temporada. */
  captain?: boolean
  /** Faz parte do quinteto titular. */
  starter?: boolean
  team: Team
  games: number
  pointsPerGame: number
}

export type GameLine = {
  matchId: string
  date: string // AAAA-MM-DD
  opponent: Club
  home: boolean
  points: number
  rebounds: number
  assists: number
  minutes: number | null
}

export type Development = {
  goal: string
  progress: number // 0 a 100
  reviewDate: string // AAAA-MM-DD
}

export type AthleteProfile = AthleteSummary & {
  reboundsPerGame: number
  assistsPerGame: number
  recentGames: GameLine[]
  /** Só vem preenchido para o técnico da equipe e para o próprio atleta. */
  private: {
    birthDate: string | null // AAAA-MM-DD, when known
    development: Development | null
  } | null
}

export type CompetitionStatus = 'em-andamento' | 'inscricoes' | 'finalizado'
export type CompetitionDivision = { category: Category; gender: Gender }

export type Competition = {
  season?: string
  ruleset?: string
  standingsMode?: string
  sourceUrl?: string | null
  id: string
  name: string
  status: CompetitionStatus
  phase: string
  categories: string
  teams: number
  note: string
  divisions: CompetitionDivision[]
  /** Dono de campeonatos criados na demonstração; os iniciais usam as permissões da sessão. */
  organizerId: string | null
}

export type Standing = {
  winRate?: number
  team: Team
  played: number
  wins: number
  losses: number
  points: number
  pointsFor: number
  pointsAgainst: number
  difference: number
  form: ('V' | 'D')[]
}

export type CompetitionProfile = Competition & {
  enrolled: Team[]
  games: PublicGame[]
  standings: { division: CompetitionDivision; rows: Standing[] }[]
}

/** Jogo como aparece para o público: ao vivo, agendado ou encerrado. */
export type PublicGame = {
  season?: string | null
  imported?: boolean
  sourceStatus?: string | null
  id: string
  date: string // AAAA-MM-DD
  time: string | null // HH:MM
  status: 'ao-vivo' | 'agendado' | 'encerrado' | 'adiado'
  home: Team
  away: Team
  homeScore: number | null
  awayScore: number | null
  period: string | null
  venue: string | null
  competition: string | null
}

/** Equipe na lista de times. Campanha e médias saem das partidas encerradas. */
export type TeamSummary = {
  team: Team
  coach: string
  athletes: number
  games: number
  wins: number
  losses: number
  /** Campeonatos de que a equipe participa na temporada. */
  competitions: Pick<Competition, 'id' | 'name' | 'status'>[]
}

export type TeamProfile = TeamSummary & {
  pointsFor: number // média por jogo
  pointsAgainst: number // média por jogo
  pointDiff: number // saldo médio por jogo, calculado dos placares (não das médias arredondadas)
  winRate: number // 0 a 100
  roster: AthleteSummary[]
  recentGames: PublicGame[]
  nextGame: PublicGame | null
}

/** Compromisso na agenda: jogo (público) ou treino (só da equipe). */
export type ScheduleEvent =
  | { kind: 'jogo'; id: string; date: string; time: string | null; game: PublicGame }
  | {
      kind: 'treino'
      id: string
      date: string
      time: string
      team: Team
      venue: string
      /** Treino do horário fixo (`slotId`) ou avulso (`null`). */
      slotId: string | null
      cancelled: boolean
      /** Ex.: "Remarcado de seg, 3 nov". */
      note: string | null
    }
