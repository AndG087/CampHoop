/**
 * Formato dos dados que a API do CampHoop vai devolver.
 * Hoje são preenchidos por dados fictícios (api/mock); quando o backend
 * FastAPI existir, as mesmas formas viram os schemas das respostas.
 */

export type Category = 'Sub-13' | 'Sub-15' | 'Sub-17'
export type Gender = 'Feminino' | 'Masculino' | 'Misto'
export type AthleteStatus = 'ativo' | 'lesionado' | 'afastado'

export type Club = {
  id: string
  name: string
  shortName: string
  city: string
}

export type Team = {
  id: string
  club: Club
  category: Category
  gender: Gender
  /** Ex.: "Sub-17 Feminino". */
  name: string
}

/** Dados públicos de um atleta: o que qualquer perfil pode ver. */
export type AthleteSummary = {
  id: string
  name: string
  number: number
  position: string
  photoUrl: string | null
  age: number
  heightCm: number
  memberSince: string // AAAA-MM
  status: AthleteStatus
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
  minutes: number
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
    birthDate: string // AAAA-MM-DD
    development: Development | null
  } | null
}

export type CompetitionStatus = 'em-andamento' | 'inscricoes' | 'finalizado'

export type Competition = {
  id: string
  name: string
  status: CompetitionStatus
  phase: string
  categories: string
  teams: number
  note: string
}

/** Jogo como aparece para o público: ao vivo, agendado ou encerrado. */
export type PublicGame = {
  id: string
  date: string // AAAA-MM-DD
  time: string | null // HH:MM
  status: 'ao-vivo' | 'agendado' | 'encerrado'
  home: Team
  away: Team
  homeScore: number | null
  awayScore: number | null
  period: string | null
  venue: string | null
  competition: string | null
}
